import { EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";
import { act, render, stubGlobal } from "../../../test/render";
import { BotDictationButton } from "./BotDictationButton";
import "~/index.css";

const state = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("~/state/botHq", async () => {
  const { Atom } = await import("effect/reactivity");
  const allowed = Atom.make(true);
  return {
    useBotHqRead: () => ({ data: undefined }),
    botHq: { mutate: { permissionAtom: () => allowed } },
  };
});
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => state.mutate }));

function Draft() {
  const [text, setText] = useState("Existing prompt.");
  return (
    <>
      <textarea
        aria-label="Prompt"
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
      />
      <BotDictationButton
        environmentId={EnvironmentId.make("local")}
        botId="bot_doug"
        disabled={false}
        onText={(value) => setText((current) => `${current} ${value}`)}
        onError={() => {}}
        onBusyChange={() => {}}
      />
    </>
  );
}

it("dictates into the draft without sending a message, calling or speaking", async () => {
  state.mutate.mockReset();
  state.mutate.mockResolvedValue({ _tag: "Success", value: { text: "Add the next step." } });
  let receive: ((event: { data: Float32Array | "stopped" }) => void) | undefined;
  const stop = vi.fn();
  const close = vi.fn(async () => {});
  await using resources = new AsyncDisposableStack();
  resources.use(
    stubGlobal(
      "AudioContext",
      class {
        sampleRate = 16000;
        destination = {};
        audioWorklet = { addModule: async () => {} };
        resume = async () => {};
        close = close;
        createMediaStreamSource() {
          return { connect() {} };
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
          postMessage(message: string) {
            if (message === "stop") {
              receive?.({ data: new Float32Array(44).fill(0.1) });
              receive?.({ data: "stopped" });
            }
          },
          close() {},
        };
        disconnect() {}
        connect() {}
      },
    ),
  );
  resources.use(
    vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue({
      getTracks: () => [{ stop, addEventListener() {} }],
    } as unknown as MediaStream),
  );
  await using screen = await render(<Draft />);
  await screen.getByRole("button", { name: "Dictate prompt" }).click();
  await act(() => receive?.({ data: new Float32Array(1024).fill(0.1) }));
  await screen.getByRole("button", { name: "Stop dictation" }).click();
  await expect
    .element(screen.getByRole("textbox", { name: "Prompt" }))
    .toHaveValue("Existing prompt. Add the next step.");
  expect(state.mutate).toHaveBeenCalledOnce();
  const request = state.mutate.mock.calls[0]![0];
  expect(request.input._tag).toBe("voice-transcribe");
  const wav = Uint8Array.from(atob(request.input.data), (character) => character.charCodeAt(0));
  expect(new DataView(wav.buffer).getUint32(40, true)).toBe((1024 + 44) * 2);
  expect(stop).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});
