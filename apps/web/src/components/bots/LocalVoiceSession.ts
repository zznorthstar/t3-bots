import workletUrl from "./botPcmWorklet.ts?worker&url";
import type { BotHqRow } from "@t3tools/contracts";
import { InterruptibleSpeech, spokenText, VoiceActivity, voiceWav } from "./voiceAudio";

type VoiceOptions = {
  warm: () => Promise<void>;
  transcribe: (data: string) => Promise<string>;
  speak: (text: string) => Promise<string>;
  send: (text: string) => Promise<void>;
  interrupt: () => Promise<void>;
  onState: (state: string) => void;
  onError: (error: string) => void;
};

const rowKey = (row: BotHqRow) => `${row.generation}:${row.seq}`;

export class LocalVoiceSession {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private detector: VoiceActivity | null = null;
  private closed = false;
  private muted = false;
  private utterance = 0;
  private blocked: Set<string>;
  private offsets = new Map<string, number>();
  private speech: InterruptibleSpeech<AudioBuffer>;
  constructor(
    private readonly options: VoiceOptions,
    rows: ReadonlyArray<BotHqRow>,
  ) {
    this.blocked = new Set(rows.map(rowKey));
    this.speech = new InterruptibleSpeech(
      async (text) => {
        const data = await options.speak(text);
        if (!this.context || this.closed) throw new Error("Call ended");
        return this.context.decodeAudioData(
          Uint8Array.from(atob(data), (character) => character.charCodeAt(0)).buffer,
        );
      },
      (audio) => {
        const context = this.context!;
        const source = context.createBufferSource();
        source.buffer = audio;
        source.connect(context.destination);
        this.options.onState("Speaking");
        let done!: () => void;
        const finished = new Promise<void>((resolve) => {
          done = resolve;
        });
        source.onended = () => {
          done();
          if (!this.closed) this.options.onState(this.muted ? "Microphone muted" : "Listening");
        };
        source.start();
        return {
          finished,
          stop: () => {
            source.onended = null;
            try {
              source.stop();
            } catch {}
            done();
          },
        };
      },
      (error) => this.fail(error),
    );
  }
  async start() {
    this.options.onState("Preparing local voice…");
    this.context = new AudioContext();
    await this.context.resume();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    if (this.closed) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;
    await this.options.warm();
    if (this.closed) return;
    await this.context.audioWorklet.addModule(workletUrl);
    if (this.closed) return;
    const rate = this.context.sampleRate;
    this.detector = new VoiceActivity(
      rate,
      () => {
        this.utterance++;
        this.speech.interrupt();
        for (const key of this.offsets.keys()) this.blocked.add(key);
        this.options.onState("Listening to you…");
        void this.options.interrupt().catch((error) => this.fail(error));
      },
      (samples) => {
        const utterance = this.utterance;
        this.options.onState("Transcribing…");
        void this.options
          .transcribe(voiceWav(samples, rate))
          .then(async (text) => {
            if (this.closed || utterance !== this.utterance) return;
            if (!text.trim()) {
              this.options.onState("Listening");
              return;
            }
            this.options.onState("Waiting for reply…");
            await this.options.send(text);
          })
          .catch((error) => this.fail(error));
      },
    );
    this.node = new AudioWorkletNode(this.context, "bot-pcm");
    this.node.onprocessorerror = () =>
      this.fail(new Error("Microphone processing stopped. Retry the call."));
    this.node.port.onmessage = (event) => {
      if (!this.closed && !this.muted) this.detector?.feed(event.data as Float32Array);
    };
    this.context.createMediaStreamSource(stream).connect(this.node);
    this.node.connect(this.context.destination);
    for (const track of stream.getTracks()) track.addEventListener("ended", () => this.stop());
    this.options.onState("Listening");
  }
  observe(rows: ReadonlyArray<BotHqRow>) {
    if (this.closed) return;
    for (const row of rows) {
      const key = rowKey(row);
      if (this.blocked.has(key) || row.body.type !== "message" || row.body.role !== "assistant")
        continue;
      const text = row.body.text ?? "";
      let offset = this.offsets.get(key) ?? 0;
      const remainder = text.slice(offset);
      const end = row.body.streaming ? /[.!?](?:\s|$)/.exec(remainder) : null;
      const count = row.body.streaming
        ? end
          ? end.index + end[0].length
          : remainder.length > 320
            ? remainder.lastIndexOf(" ", 240)
            : 0
        : remainder.length;
      if (count <= 0) {
        this.offsets.set(key, offset);
        continue;
      }
      const fragment = spokenText(remainder.slice(0, count));
      offset += count;
      this.offsets.set(key, offset);
      for (const chunk of fragment.match(/.{1,600}(?:\s|$)|.{1,600}/g) ?? [])
        void this.speech.enqueue(chunk.trim());
    }
  }
  mute(value: boolean) {
    this.muted = value;
    this.detector?.reset();
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = !value;
    });
    this.options.onState(value ? "Microphone muted" : "Listening");
  }
  stop() {
    if (this.closed) return;
    this.closed = true;
    this.utterance++;
    this.speech.interrupt();
    this.node?.disconnect();
    this.node?.port.close();
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.context?.close().catch(() => {});
    this.options.onState("Ended");
  }
  private fail(error: unknown) {
    if (this.closed) return;
    this.stop();
    this.options.onError(
      error instanceof Error ? error.message : "The voice call stopped. Retry the call.",
    );
  }
}
