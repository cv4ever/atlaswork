// Speaking into Capture (agents-design D53): the browser's own speech recognition, in the browser's language. Chrome
// and Edge send the audio to their own speech service, Safari recognises on the device, and Firefox has none, so the
// microphone only shows where `canDictate`. Nothing is recorded or kept: only the words land in the field.
import { useEffect, useRef, useState } from "react";

type Heard = ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { results: Heard }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
// TypeScript's DOM types leave speech recognition out; both names are optional here because most browsers lack one.
const speech = globalThis as typeof globalThis & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
const engine = speech.SpeechRecognition ?? speech.webkitSpeechRecognition;
export const canDictate = !!engine;

/**
 * Listens until `stop`, reporting everything heard since `start` (settled words, then the guess still forming) to
 * `onWords`. Recognition ends by itself after a pause, and Android repeats words in continuous mode, so each run hears
 * one stretch and the next starts at once while you still want it; what earlier runs settled carries over.
 */
export function useDictation(onWords: (heard: string) => void) {
  const [state, setState] = useState<"idle" | "listening" | "blocked" | "failed">("idle");
  const run = useRef<Recognition | null>(null);
  const report = useRef(onWords);
  useEffect(() => { report.current = onWords; });
  useEffect(() => () => run.current?.abort(), []);
  const start = () => {
    if (!engine || run.current) return;
    let settled = "";
    const listen = () => {
      const recognition = new engine();
      recognition.lang = navigator.language;
      recognition.continuous = !/Android/i.test(navigator.userAgent);
      recognition.interimResults = true;
      let finals = "";
      recognition.onresult = ({ results }) => {
        let forming = "";
        finals = "";
        for (const result of Array.from(results)) (result.isFinal ? (finals += result[0].transcript) : (forming += result[0].transcript));
        report.current(`${settled}${finals}${forming}`.replace(/\s+/g, " ").trimStart());
      };
      // Silence just starts the next run; a refused microphone or a speech service that can't be reached stops listening.
      recognition.onerror = ({ error }) => {
        if (error === "no-speech" || error === "aborted") return;
        run.current = null;
        setState(error === "not-allowed" || error === "service-not-allowed" ? "blocked" : "failed");
      };
      recognition.onend = () => {
        if (run.current !== recognition) return;
        settled = `${settled}${finals} `;
        listen();
      };
      run.current = recognition;
      recognition.start();
    };
    setState("listening");
    listen();
  };
  const stop = () => {
    const recognition = run.current;
    run.current = null;
    recognition?.stop();
    setState((now) => now === "listening" ? "idle" : now);
  };
  return { state, start, stop };
}
