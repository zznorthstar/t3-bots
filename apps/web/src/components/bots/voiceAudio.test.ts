import { describe, expect, it, vi } from "vite-plus/test";
import { InterruptibleSpeech, VoiceActivity, voiceWav } from "./voiceAudio";

function deferred<A>() {
  let resolve!: (value: A) => void;
  const promise = new Promise<A>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("local voice", () => {
  it("ignores brief noise, captures speech with pre-roll and ends after silence", () => {
    const start = vi.fn();
    const end = vi.fn();
    const detector = new VoiceActivity(16000, start, end);
    const frame = (amplitude: number) => new Float32Array(800).fill(amplitude);
    detector.feed(frame(0.1));
    detector.feed(frame(0));
    expect(start).not.toHaveBeenCalled();
    detector.feed(frame(0.1));
    detector.feed(frame(0.1));
    expect(start).toHaveBeenCalledOnce();
    for (let index = 0; index < 11; index++) detector.feed(frame(0));
    expect(end).toHaveBeenCalledOnce();
    expect(end.mock.calls[0]![0].length).toBeGreaterThan(1600);
  });

  it("encodes resampled, clipped mono PCM for the local recognizer", () => {
    const data = Uint8Array.from(atob(voiceWav(new Float32Array([2, 2, -2, -2]), 32000)), (c) =>
      c.charCodeAt(0),
    );
    const view = new DataView(data.buffer);
    expect(new TextDecoder().decode(data.subarray(0, 4))).toBe("RIFF");
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(40, true)).toBe(4);
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
  });

  it("discards late audio and queued speech when the user interrupts", async () => {
    const oldAudio = deferred<string>();
    const started = deferred<void>();
    const synthesize = vi.fn((text: string) => {
      if (text === "old") {
        started.resolve();
        return oldAudio.promise;
      }
      return Promise.resolve(text);
    });
    const play = vi.fn(() => ({ finished: Promise.resolve(), stop: vi.fn() }));
    const error = vi.fn();
    const speech = new InterruptibleSpeech(synthesize, play, error);
    const old = speech.enqueue("old");
    const queued = speech.enqueue("discard");
    await started.promise;
    speech.interrupt();
    await speech.enqueue("new reply");
    oldAudio.resolve("stale audio");
    await Promise.all([old, queued]);
    expect(play).toHaveBeenCalledExactlyOnceWith("new reply");
    expect(synthesize.mock.calls.map(([text]) => text)).toEqual(["old", "new reply"]);
    expect(error).not.toHaveBeenCalled();
  });

  it("stops active playback immediately on interruption", async () => {
    const playing = deferred<void>();
    const done = deferred<void>();
    const stop = vi.fn(() => done.resolve());
    const speech = new InterruptibleSpeech(
      async () => "audio",
      () => {
        playing.resolve();
        return { finished: done.promise, stop };
      },
      vi.fn(),
    );
    const completion = speech.enqueue("hello");
    await playing.promise;
    speech.interrupt();
    expect(stop).toHaveBeenCalledOnce();
    await completion;
  });
});
