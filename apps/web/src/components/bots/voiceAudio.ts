export class VoiceActivity {
  private chunks: Float32Array[] = [];
  private preRoll: Float32Array[] = [];
  private voiced = 0;
  private quiet = 0;
  private length = 0;
  private speaking = false;
  constructor(
    private readonly rate: number,
    private readonly onStart: () => void,
    private readonly onEnd: (audio: Float32Array) => void,
  ) {}
  reset() {
    this.chunks = [];
    this.preRoll = [];
    this.voiced = 0;
    this.quiet = 0;
    this.length = 0;
    this.speaking = false;
  }
  feed(samples: Float32Array) {
    const duration = samples.length / this.rate;
    const energy = Math.sqrt(
      samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length,
    );
    if (!this.speaking) {
      this.preRoll.push(samples);
      while (this.preRoll.length > Math.ceil((this.rate * 0.25) / samples.length))
        this.preRoll.shift();
      this.voiced = energy > 0.018 ? this.voiced + duration : 0;
      if (this.voiced < 0.09) return;
      this.speaking = true;
      this.chunks = this.preRoll;
      this.preRoll = [];
      this.length = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      this.onStart();
      return;
    }
    this.chunks.push(samples);
    this.length += samples.length;
    this.quiet = energy < 0.012 ? this.quiet + duration : 0;
    if (this.quiet < 0.5 && this.length / this.rate < 60) return;
    const audio = new Float32Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      audio.set(chunk, offset);
      offset += chunk.length;
    }
    this.reset();
    this.onEnd(audio);
  }
}

export function voiceWav(samples: Float32Array, inputRate: number): string {
  const rate = 16000;
  const count = Math.floor((samples.length * rate) / inputRate);
  const data = new ArrayBuffer(44 + count * 2);
  const view = new DataView(data);
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++)
      view.setUint8(offset + index, value.charCodeAt(index));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + count * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, count * 2, true);
  for (let index = 0; index < count; index++) {
    const position = (index * inputRate) / rate;
    const left = Math.floor(position);
    const blend = position - left;
    const sample = Math.max(
      -1,
      Math.min(
        1,
        (samples[left] ?? 0) * (1 - blend) + (samples[left + 1] ?? samples[left] ?? 0) * blend,
      ),
    );
    view.setInt16(44 + index * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  const bytes = new Uint8Array(data);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192)
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(binary);
}

export class InterruptibleSpeech<Audio> {
  private epoch = 0;
  private tail: Promise<void> = Promise.resolve();
  private stopPlayback: (() => void) | undefined;
  constructor(
    private readonly synthesize: (text: string) => Promise<Audio>,
    private readonly play: (audio: Audio) => { finished: Promise<void>; stop: () => void },
    private readonly onError: (error: unknown) => void,
  ) {}
  enqueue(text: string) {
    const epoch = this.epoch;
    this.tail = this.tail
      .then(async () => {
        if (epoch !== this.epoch) return;
        const audio = await this.synthesize(text);
        if (epoch !== this.epoch) return;
        const playback = this.play(audio);
        this.stopPlayback = playback.stop;
        await playback.finished;
        if (this.stopPlayback === playback.stop) this.stopPlayback = undefined;
      })
      .catch((error) => {
        if (epoch === this.epoch) this.onError(error);
      });
    return this.tail;
  }
  interrupt() {
    this.epoch++;
    this.stopPlayback?.();
    this.stopPlayback = undefined;
    this.tail = Promise.resolve();
  }
}

export function spokenText(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " Code is in the conversation. ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "a link in the conversation")
    .replace(/[#*_`>]/g, "")
    .trim();
}
