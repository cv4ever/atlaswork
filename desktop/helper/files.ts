// How the desktop app's helper reads a PDF's text, a Word or Excel file's (D78), and shrinks an image for the file tools
// (src/fileTools.ts), the way the browser does with pdf.js and a canvas (src/folders.ts, src/images.ts): pdf.js's Node
// build, the index's own Word and Excel reader and Jimp, all plain JavaScript, so the helper compiles to one program.
import * as pdfjs from "npm:pdfjs-dist@6.5.438/legacy/build/pdf.mjs";
import { Jimp } from "npm:jimp@1.7.0";
import { limits } from "../../supabase/functions/agent/logic.ts";
import { pdfPages } from "../../src/fileTools.ts";
import type { FileLike, PdfText } from "../../src/fileTools.ts";
import { officeText } from "./search.ts";

/** A Word document's or an Excel workbook's text, as the search index reads it. */
export const officeOf = async (file: FileLike) => officeText(new Uint8Array(await file.arrayBuffer()), /\.xlsx$/i.test(file.name) ? "xlsx" : "docx");

/** A PDF's text, from its first `pdfPages` pages. */
export async function pdfText(file: FileLike): Promise<PdfText> {
  // Text only: no fonts or rendering, and no warnings about the fonts it didn't load.
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), disableFontFace: true, verbosity: 0 });
  try {
    const document = await task.promise;
    const read = Math.min(document.numPages, pdfPages), pages: string[] = [];
    for (let number = 1; number <= read; number++) {
      const content = await (await document.getPage(number)).getTextContent();
      pages.push(content.items.map((item) => "str" in item ? `${item.str}${item.hasEOL ? "\n" : ""}` : "").join(""));
    }
    return { text: pages.join("\n\n"), pages: document.numPages, read };
  } finally {
    void task.destroy();
  }
}

/** How long the longer side of a sent image may be, as in the browser (src/images.ts). */
const side = 1024;

/** `file` as a JPEG data URL for `read_image`, at most `side` pixels on its longer side, or why it can't be. */
export async function imageForAgent(file: FileLike): Promise<string> {
  let image: Awaited<ReturnType<typeof Jimp.read>>;
  try { image = await Jimp.read(await file.arrayBuffer()); } catch { return "This image couldn't be opened on this computer; say so."; }
  if (Math.max(image.width, image.height) > side) image.scaleToFit({ w: side, h: side });
  // Transparent PNGs would turn black as JPEG.
  const flat = new Jimp({ width: image.width, height: image.height, color: 0xffffffff }).composite(image);
  for (const quality of [80, 60, 40]) {
    const bytes = new Uint8Array(await flat.getBuffer("image/jpeg", { quality }));
    let binary = "";
    for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
    const url = `data:image/jpeg;base64,${btoa(binary)}`;
    if (url.length <= limits.image) return url;
  }
  return "This image is too detailed to send even when shrunk; say so.";
}
