import type { BotHqRow } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { stubGlobal } from "../../../test/render";
import { LocalVoiceSession } from "./LocalVoiceSession";

it("a live call stops speech on barge-in, sends the recognized utterance and releases the microphone", async () => {
  let receive: ((event: { data: Float32Array }) => void) | undefined;
  let played!: () => void;
  const playbackStarted = new Promise<void>((resolve) => {
    played = resolve;
  });
  let sent!: () => void;
  const messageSent = new Promise<void>((resolve) => {
    sent = resolve;
  });
  const stopAudio = vi.fn();
  const stopTrack = vi.fn();
  const closeContext = vi.fn(async () => {});
  const closePort = vi.fn();
  await using resources = new AsyncDisposableStack();
  resources.use(
    stubGlobal(
      "AudioContext",
      class {
        sampleRate = 16000;
        destination = {};
        audioWorklet = { addModule: async () => {} };
        resume = async () => {};
        close = closeContext;
        decodeAudioData = async () => ({});
        createMediaStreamSource() {
          return { connect() {} };
        }
        createBufferSource() {
          return { buffer: null, onended: null, connect() {}, start: played, stop: stopAudio };
        }
      },
    ),
  );
  resources.use(
    stubGlobal(
      "AudioWorkletNode",
      class {
        port = {
          set onmessage(handler: typeof receive) {
            receive = handler;
          },
          close: closePort,
        };
        connect() {}
        disconnect() {}
      },
    ),
  );
  resources.use(
    vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue({
      getTracks: () => [{ stop: stopTrack, addEventListener() {} }],
      getAudioTracks: () => [],
    } as unknown as MediaStream),
  );
  const interrupt = vi.fn(async () => {});
  const send = vi.fn(async () => {
    sent();
  });
  const error = vi.fn();
  const call = new LocalVoiceSession(
    {
      warm: async () => {},
      transcribe: async () => "Actually, do this instead.",
      speak: async () => btoa("test audio"),
      send,
      interrupt,
      onState: vi.fn(),
      onError: error,
    },
    [],
  );
  try {
    await call.start();
    const row: BotHqRow = {
      botId: "bot_doug",
      generation: 1,
      seq: 1,
      updatedSeq: 1,
      createdAt: 1,
      kind: "message",
      body: { type: "message", role: "assistant", text: "Here is the answer." },
    };
    call.observe([row]);
    await playbackStarted;
    const feed = (amplitude: number) => receive!({ data: new Float32Array(800).fill(amplitude) });
    feed(0.1);
    feed(0.1);
    expect(stopAudio).toHaveBeenCalledOnce();
    expect(interrupt).toHaveBeenCalledOnce();
    for (let index = 0; index < 11; index++) feed(0);
    await messageSent;
    expect(send).toHaveBeenCalledExactlyOnceWith("Actually, do this instead.");
    expect(error).not.toHaveBeenCalled();
  } finally {
    call.stop();
  }
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(closeContext).toHaveBeenCalledOnce();
  expect(closePort).toHaveBeenCalledOnce();
});
