import { appAtomRegistry } from "~/rpc/atomRegistry";
import { botHq } from "~/state/botHq";
import type { BotHqAttachment, EnvironmentId } from "@t3tools/contracts";
import { AtomRegistry } from "effect/reactivity";
import * as Effect from "effect/Effect";

export const fileBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read this file"));
    reader.readAsDataURL(file);
  });

export async function avatarDataUrl(file: File) {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw new Error("Choose a PNG, JPEG or WebP image smaller than 10 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image editing is unavailable in this browser.");
    const side = Math.min(bitmap.width, bitmap.height);
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      256,
      256,
    );
    return canvas.toDataURL("image/webp", 0.88);
  } finally {
    bitmap.close();
  }
}

export async function downloadBotAttachment(
  environmentId: EnvironmentId,
  botId: string,
  attachment: BotHqAttachment,
) {
  const atom = botHq.read({
    environmentId,
    input: { resource: "file", botId, fileId: attachment.id },
  });
  const result = await Effect.runPromise(
    AtomRegistry.getResult(appAtomRegistry, atom, { suspendOnWaiting: true }),
  );
  if (!result.file) throw new Error("This file could not be downloaded.");
  const raw = atob(result.file.data);
  const url = URL.createObjectURL(
    new Blob([Uint8Array.from(raw, (character) => character.charCodeAt(0))], {
      type: attachment.mime,
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = attachment.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
