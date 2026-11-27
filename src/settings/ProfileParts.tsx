// Settings → Profile's lower groups: a line about you, with one-tap starters that a second tap takes back out, and
// running the welcome again (agents-design D34).
import { Route } from "lucide-react";

export const bioMax = 240;
/** One-tap lines for the About field; tapping one again takes it back out. */
const bioStarters = ["🌅 Early riser", "🦉 Night owl", "☕ Runs on coffee", "📚 Always reading", "🌱 Learning something new", "🧘 Likes it calm"];

export function AboutLine({ bio, onBio }: { bio: string; onBio: (bio: string) => void }) {
  const lines = bio.split("\n").map((part) => part.trim()).filter(Boolean);
  const toggle = (line: string) => onBio((lines.includes(line) ? lines.filter((part) => part !== line) : [...lines, line]).join("\n").slice(0, bioMax));
  return (
    <section className="settings-group" id="profile-about">
      <div className="settings-group-head">
        <h4><label htmlFor="profile-about-input">A line about you</label></h4>
        <small data-full={bio.length >= bioMax || undefined}>{bio.length} of {bioMax}</small>
      </div>
      <div className="settings-card">
        <div className="profile-starters" role="group" aria-label="Quick lines">
          {bioStarters.map((line) => (
            <button key={line} className="capture-start" aria-pressed={lines.includes(line)} onClick={() => toggle(line)}>{line}</button>
          ))}
        </div>
        <textarea id="profile-about-input" value={bio} rows={3} maxLength={bioMax} placeholder="Tap a line above, or write your own."
          onChange={(event) => onBio(event.target.value)} />
      </div>
    </section>
  );
}

export function SetupAgain({ onSetup }: { onSetup: () => void }) {
  return (
    <section className="settings-group" id="profile-setup">
      <h4>Setup</h4>
      <div className="settings-card account-card">
        <span className="account-orb" aria-hidden="true"><Route size={18} /></span>
        <div>
          <strong>The welcome, from the start</strong>
          <p>Pick your domains and agents again, the way you did on day one. Anything you untick goes to the Archive, never gone.</p>
        </div>
        <button className="secondary-button" onClick={onSetup}>Run setup again</button>
      </div>
    </section>
  );
}
