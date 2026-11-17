declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class BotPcmProcessor extends AudioWorkletProcessor {
  private buffer = new Float32Array(1024);
  private offset = 0;
  private recording = true;
  constructor() {
    super();
    this.port.onmessage = ({ data }) => {
      if (data !== "stop") return;
      this.recording = false;
      if (this.offset) this.port.postMessage(this.buffer.slice(0, this.offset), []);
      this.port.postMessage("stopped", []);
    };
  }
  process(inputs: Float32Array[][]) {
    if (!this.recording) return true;
    const samples = inputs[0]?.[0];
    if (samples)
      for (const sample of samples) {
        this.buffer[this.offset++] = sample;
        if (this.offset === 1024) {
          this.port.postMessage(this.buffer, [this.buffer.buffer]);
          this.buffer = new Float32Array(1024);
          this.offset = 0;
        }
      }
    return true;
  }
}
registerProcessor("bot-pcm", BotPcmProcessor);
