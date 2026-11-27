// Images an agent looks at (agents-design D58): the browser shrinks one to a JPEG data URL the agent function takes,
// at most `side` pixels on its long side, lowering the quality until it fits `limits.image`. Nothing is kept or sent
// anywhere else; the function has it described and drops it.
import { limits } from "../supabase/functions/agent/logic.ts";

/** How long the longer side of a sent image may be: 1024px keeps a worksheet's print legible at about 100 KB. */
const side = 1024;

/** `image` as a JPEG data URL for `read_image`, or why it can't be. */
export async function imageForAgent(image: Blob): Promise<string> {
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(image); } catch { return "This image couldn't be opened in this browser; say so."; }
  const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
  const context = canvas.getContext("2d")!;
  // Transparent PNGs would turn black as JPEG.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.8, 0.6, 0.4]) {
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/jpeg", quality })).arrayBuffer());
    let binary = "";
    for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
    const url = `data:image/jpeg;base64,${btoa(binary)}`;
    if (url.length <= limits.image) return url;
  }
  return "This image is too detailed to send even when shrunk; say so.";
}

