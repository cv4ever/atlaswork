// Your picture, picked the same way in Settings → Profile and on the first run's Hello: your initial on one of six
// colours, a photo kept on this device, or a face from the portraits behind Faces.
import { useRef, useState } from "react";
import { Camera, Users } from "lucide-react";
import { domainHues } from "./model.ts";
import { usePortraitSrc } from "./crewStyle.ts";
import { profileAvatar } from "./look.ts";
import { Tip } from "./Popups.tsx";

/** What a pick changes on your profile. */
export type PicturePatch = { profilePhoto?: string; profileHue?: string; profilePortrait?: string };
/** Your picture as it shows now (`profilePicture`) and what it's made from. */
export type YourPicture = { picture: string; photo: string; hue: string; portrait: string };

/** Colours for your initial: the default green, then a few domain hues. */
const pictureHues: [string, string][] = [["Green", "#416b57"], ...(["Clay", "Marigold", "Lagoon", "Iris", "Rose"] as const).map((hue) => [hue, domainHues[hue]] as [string, string])];
/** A portrait's name as words: "atlas" → "Atlas", "silhouette-pine" → "Pine silhouette". */
const faceLabel = (face: string) => face.startsWith("silhouette-") ? `${face.slice(11).replace(/^\w/, (letter) => letter.toUpperCase())} silhouette`
  : face.replace(/^\w/, (letter) => letter.toUpperCase());

/** A photo cropped to its centre square and shrunk to `size` px WebP (256 for you; a person's is smaller, D71). */
export async function squarePhoto(file: Blob, size = 256) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  return canvas.toDataURL("image/webp", 0.85);
}

/**
 * Uploading a photo: `field` is the hidden file input to render once, `open` shows the browser's picker, and a file
 * it can't read as a picture sets `error`.
 */
export function usePhotoUpload(onChange: (patch: PicturePatch) => void) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const upload = async (file: File) => {
    setError("");
    try { onChange({ profilePhoto: await squarePhoto(file), profileHue: "", profilePortrait: "" }); }
    catch { setError("That file isn't a picture this browser can read. Try a JPG, PNG or WebP."); }
  };
  const field = (
    <input ref={input} type="file" accept="image/*" hidden aria-hidden="true" tabIndex={-1}
      onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
  );
  return { open: () => input.current?.click(), error, field };
}

/** The line under the choices: what the open choice means. */
export const pictureNote = (photo: string, faces: boolean) => faces ? "Any face from the portraits. Your agents keep theirs."
  : photo ? "Your photo stays on this device, cropped to a square. Picking a colour keeps it here for later."
  : "Your initial on the colour you pick, a face, or a photo that stays on this device.";

/**
 * The choices in one row (your photo, the face you picked, your initial on six colours, Upload, Faces, Remove photo),
 * then the portraits while Faces is open. The tick follows the picture that shows, so a picture the choices can't
 * make ticks none of them. `labels` adds words under the Upload and Faces icons.
 */
export function PictureChoices({ name, you, faces, offered, labels, className = "", onFaces, onUpload, onChange }: {
  name: string; you: YourPicture; faces: boolean;
  /** The portraits Faces offers. */
  offered: readonly string[];
  labels?: boolean; className?: string;
  onFaces: (open: boolean) => void; onUpload: () => void; onChange: (patch: PicturePatch) => void;
}) {
  const portraitSrc = usePortraitSrc();
  const { picture, photo, hue, portrait } = you;
  return <>
    <div className={`picture-choices ${className}`.trim()} role="radiogroup" aria-label="Your picture">
      {photo && <Tip label="Your photo"><label className="picture-choice">
        <input type="radio" name="your-picture" aria-label="Your photo" checked={!hue && !portrait} onChange={() => onChange({ profileHue: "", profilePortrait: "" })} />
        <img src={photo} alt="" />
      </label></Tip>}
      {portrait && <Tip label="The face you picked"><label className="picture-choice">
        <input type="radio" name="your-picture" aria-label="The face you picked" checked={!hue} onChange={() => onChange({ profileHue: "" })} />
        <img src={portraitSrc({ portrait })} alt="" />
      </label></Tip>}
      {pictureHues.map(([label, value]) => (
        <Tip key={label} label={`Your initial on ${label.toLowerCase()}`}><label className="picture-choice">
          <input type="radio" name="your-picture" aria-label={`Initial on ${label.toLowerCase()}`}
            checked={hue ? hue === value : picture === profileAvatar(name, value)} onChange={() => onChange({ profileHue: value, profilePortrait: "" })} />
          <img src={profileAvatar(name, value)} alt="" />
        </label></Tip>
      ))}
      <Tip label="Upload a photo"><button type="button" className="picture-upload" aria-label={labels ? undefined : "Upload a photo"} onClick={onUpload}>
        <Camera size={16} />{labels && <span>{photo ? "New photo" : "Upload"}</span>}</button></Tip>
      <Tip label="Use a face from the portraits"><button type="button" className="picture-upload" aria-expanded={faces} aria-label={labels ? undefined : "Faces"}
        onClick={() => onFaces(!faces)}><Users size={16} />{labels && <span>Faces</span>}</button></Tip>
      {photo && <button type="button" className="text-button" onClick={() => onChange({ profilePhoto: "" })}>Remove photo</button>}
    </div>
    {faces && (
      <div className="picture-faces" role="radiogroup" aria-label="Faces">
        {offered.map((face) => (
          <Tip key={face} label={faceLabel(face)}><label className="picture-choice">
            <input type="radio" name="your-face" aria-label={faceLabel(face)} checked={!hue && portrait === face}
              onChange={() => onChange({ profilePortrait: face, profileHue: "" })} />
            <img src={portraitSrc({ portrait: face })} alt="" loading="lazy" />
          </label></Tip>
        ))}
      </div>
    )}
  </>;
}
