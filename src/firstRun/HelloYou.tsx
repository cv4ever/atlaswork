// Hello's own card: your picture, your name and the picture's choices.
import { useState } from "react";
import { Camera } from "lucide-react";
import { portraits } from "../look.ts";
import { PictureChoices, pictureNote, usePhotoUpload } from "../PicturePicker.tsx";
import type { PicturePatch, YourPicture } from "../PicturePicker.tsx";
import { Tip } from "../Popups.tsx";

/** What Hello changes on your profile: your name, and your picture as Settings → Profile changes it. */
export type ProfilePatch = PicturePatch & { profileName?: string };

/**
 * You, on Hello: your round picture (a tap uploads a photo), your name, and the picture's choices in one row (your
 * photo, your initial on six colours, a face from the portraits behind Faces). Atlas's face is never offered here, so
 * the guide and you never look alike.
 */
export function HelloYou({ name, you, onProfile, onTyped, onEnter }: {
  name: string; you: YourPicture; onProfile: (patch: ProfilePatch) => void; onTyped: () => void; onEnter: () => void;
}) {
  const photos = usePhotoUpload(onProfile);
  const [faces, setFaces] = useState(false);
  return (
    <section className="hello-you" aria-label="You">
      <Tip label="Upload a photo"><button type="button" className="hello-you-picture" aria-label="Upload a photo" onClick={photos.open}>
        <img src={you.picture} alt="" /><span aria-hidden="true"><Camera size={16} /></span>
      </button></Tip>
      <label className="field hello-you-name">
        <span>Your name</span>
        <input value={name} placeholder="Your first name" maxLength={40} autoComplete="given-name"
          onChange={(event) => { onTyped(); onProfile({ profileName: event.target.value }); }}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onEnter(); } }} />
      </label>
      <PictureChoices name={name} you={you} faces={faces} offered={portraits} className="hello-pictures"
        onFaces={setFaces} onUpload={photos.open} onChange={onProfile} />
      {photos.field}
      <p className={photos.error ? "field-error hello-you-note" : "hello-you-note"} role={photos.error ? "alert" : undefined}>
        {photos.error || pictureNote(you.photo, faces)}</p>
    </section>
  );
}
