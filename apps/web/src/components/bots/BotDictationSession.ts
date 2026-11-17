import { requestMicrophone } from "~/speech/requestMicrophone";
import workletUrl from "./botPcmWorklet.ts?worker&url";
import { voiceWav } from "./voiceAudio";

export class BotDictationSession {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private chunks: Float32Array[] = [];
  private length = 0;
  private rate = 16000;
  private closed = false;
  private finishing = false;
  private cancelNotified = false;
  private limited = false;
  private flushed: (() => void) | undefined;
  constructor(
    private readonly options: {
      onLimit: () => void;
      onError: (error: string) => void;
      onCanceled?: () => void;
    },
  ) {}
  async start() {
    const context = new AudioContext();
    this.context = context;
    this.rate = context.sampleRate;
    await context.resume();
    const stream = await requestMicrophone("");
    if (this.closed) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;
    await context.audioWorklet.addModule(workletUrl);
    if (this.closed) return;
    const node = new AudioWorkletNode(context, "bot-pcm");
    this.node = node;
    node.port.onmessage = ({ data }: MessageEvent<Float32Array | "stopped">) => {
      if (data === "stopped") {
        this.flushed?.();
        return;
      }
      if (this.closed) return;
      const remaining = this.rate * 60 - this.length;
      const chunk = data.subarray(0, remaining);
      this.chunks.push(chunk);
      this.length += chunk.length;
      if (this.length >= this.rate * 60 && !this.limited) {
        this.limited = true;
        this.options.onLimit();
      }
    };
    node.onprocessorerror = () => this.fail("Microphone processing stopped. Retry dictation.");
    for (const track of stream.getTracks())
      track.addEventListener(
        "ended",
        () => {
          if (!this.closed) this.fail("The microphone disconnected.");
        },
        { once: true },
      );
    context.createMediaStreamSource(stream).connect(node);
    node.connect(context.destination);
  }
  async stop(): Promise<string | null> {
    if (this.closed || this.finishing) return null;
    this.finishing = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (this.node)
        await new Promise<void>((resolve, reject) => {
          this.flushed = resolve;
          timer = setTimeout(
            () => reject(new Error("Microphone capture did not stop. Retry dictation.")),
            5000,
          );
          this.node!.port.postMessage("stop", []);
        });
      if (this.closed) return null;
      const samples = new Float32Array(this.length);
      let offset = 0;
      for (const chunk of this.chunks) {
        samples.set(chunk, offset);
        offset += chunk.length;
      }
      return this.length ? voiceWav(samples, this.rate) : null;
    } finally {
      clearTimeout(timer);
      this.close();
    }
  }
  cancel() {
    if (!this.cancelNotified) {
      this.cancelNotified = true;
      this.options.onCanceled?.();
    }
    this.close();
  }
  private close() {
    if (this.closed) return;
    this.closed = true;
    this.flushed?.();
    this.node?.disconnect();
    this.node?.port.close();
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.context?.close().catch(() => {});
    this.chunks = [];
  }
  private fail(message: string) {
    this.cancel();
    this.options.onError(message);
  }
}
