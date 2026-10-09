/**
 * Voice to text with the browser's own speech recognition (Web Speech API).
 * Audio never reaches NomadNest.
 *
 * Android Chrome sends growing partial results as separate "final" results
 * ("need", "need to", "need to talk"), so appending each one repeats words.
 * Instead, the whole transcript is rebuilt from the full results list on
 * every event, and a final result that starts with the previous one (or is
 * contained in it) replaces it rather than being added.
 */

export interface SpeechResultLike {
  isFinal?: boolean;
  0: { transcript: string };
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex?: number; results: ArrayLike<SpeechResultLike> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
}

export const speechRecognitionCtor = (): (new () => SpeechRecognitionLike) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const norm = (s: string) => s.trim().replace(/\s+/g, " ");

/** The spoken text so far: final parts (without repeats) and the live part. */
export const transcriptFrom = (results: ArrayLike<SpeechResultLike>): { final: string; interim: string } => {
  const finals: string[] = [];
  let interim = "";
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const text = norm(r?.[0]?.transcript ?? "");
    if (!text) continue;
    // Treat a result with no isFinal flag (some browsers) as final.
    if (r.isFinal === false) {
      interim = interim ? `${interim} ${text}` : text;
      continue;
    }
    const prev = finals[finals.length - 1];
    const lower = text.toLowerCase();
    if (prev !== undefined && lower.startsWith(prev.toLowerCase())) {
      finals[finals.length - 1] = text; // a longer version of the same phrase
    } else if (prev !== undefined && prev.toLowerCase().startsWith(lower)) {
      // a shorter repeat: keep the longer one
    } else {
      finals.push(text);
    }
  }
  return { final: finals.join(" "), interim };
};
