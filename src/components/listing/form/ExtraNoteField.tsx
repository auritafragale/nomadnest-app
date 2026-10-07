import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { AI_SUGGESTION_NOTE } from "@/hooks/useWritingHelper";
import { AiButton, inputClass } from "./FormBits";
import { cn } from "@/lib/utils";

export const STARTERS = [
  "What we love about our area…",
  "Close by…",
  "Getting here…",
  "Working from here…",
  "Little quirks of our home…",
  "Free to use…",
  "A perfect sit for us…",
  "Our favourite local spot…",
];

const VOICE_NOTE = "We turned what you said into text. Read it and change anything that isn't right. We never keep a recording.";
const MAX_SECONDS = 120;

// The browser's own speech recognition (Web Speech API). Audio never reaches
// NomadNest: the browser or the device turns it into text.
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
};
const speechCtor = (): (new () => SpeechRecognitionLike) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/**
 * "Anything else a Nomad should know?" on the Home step: sentence starters,
 * free typing, "Tell me out loud" (voice to text) and Polish with AI.
 */
const ExtraNoteField = ({
  value,
  onChange,
  aiNote,
  aiVisible,
  aiBusy,
  onPolish,
}: {
  value: string;
  /** `fromAi` is true when the text is an AI suggestion. */
  onChange: (text: string, fromAi?: boolean) => void;
  aiNote: boolean;
  aiVisible: boolean;
  aiBusy: boolean;
  onPolish: () => void;
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [used, setUsed] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [interim, setInterim] = useState("");
  const [voiced, setVoiced] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseRef = useRef("");
  const finalRef = useRef("");
  const canSpeak = !!speechCtor();

  // Stop listening if the step closes.
  useEffect(() => () => recognitionRef.current?.abort(), []);

  useEffect(() => {
    if (!listening) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [listening]);

  useEffect(() => {
    if (listening && seconds >= MAX_SECONDS) recognitionRef.current?.stop();
  }, [listening, seconds]);

  const isUsed = (s: string) => used.includes(s) || value.includes(s);

  const addStarter = (starter: string) => {
    const el = ref.current;
    const at = el && document.activeElement === el ? el.selectionStart : value.length;
    const before = value.slice(0, at);
    const after = value.slice(at);
    const lead = before && !before.endsWith("\n") ? "\n" : "";
    const insert = `${lead}${starter} `;
    const next = before + insert + after;
    onChange(next);
    setUsed((u) => [...u, starter]);
    requestAnimationFrame(() => {
      const pos = before.length + insert.length;
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  };

  const startVoice = () => {
    const Ctor = speechCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language || "en-GB";
    rec.continuous = true;
    rec.interimResults = true;
    baseRef.current = value;
    finalRef.current = "";
    rec.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += `${r[0].transcript.trim()} `;
        else live += r[0].transcript;
      }
      setInterim(live);
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      const said = finalRef.current.trim();
      if (said) {
        const base = baseRef.current;
        onChange(base + (base && !base.endsWith("\n") ? "\n" : "") + said);
        setVoiced(true);
      }
      recognitionRef.current = null;
    };
    rec.onerror = () => {
      // Permission refused or no speech: just stop.
      setListening(false);
    };
    recognitionRef.current = rec;
    setSeconds(0);
    setVoiced(false);
    setListening(true);
    rec.start();
  };

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <section aria-labelledby="extra-label" className="flex flex-col gap-2">
      <label id="extra-label" htmlFor="listing-description" className="text-[15px] font-bold">
        Anything else a Nomad should know? <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <p id="extra-help" className="text-sm text-muted-foreground">
        Most details are already in your listing. Add anything extra that matters to you. Tap a starter, type, or just say it out loud.
      </p>

      <div role="group" aria-label="Sentence starters" className="flex flex-wrap gap-2">
        {STARTERS.map((s) => {
          const on = isUsed(s);
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => addStarter(s)}
              className={cn(
                "inline-flex min-h-[44px] items-center rounded-full border-[1.5px] px-3.5 text-sm font-semibold",
                on ? "border-transparent bg-[var(--nn-tint)] text-[var(--nn-accent-dark)]" : "border-[var(--nn-border)] bg-card text-foreground hover:bg-[var(--nn-soft)]",
              )}
            >
              {on && <span aria-hidden="true" className="mr-1">✓</span>}
              {s}
            </button>
          );
        })}
      </div>

      {listening && (
        <div role="status" className="flex items-center gap-3 rounded-2xl border border-[var(--nn-border)] bg-[var(--nn-soft)] p-3">
          <span className="flex h-10 w-10 shrink-0 animate-pulse items-center justify-center rounded-full bg-[var(--nn-accent)] text-primary-foreground" aria-hidden="true">
            <Mic className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold">Listening… {mmss}</span>
            <span className="block truncate text-sm text-muted-foreground">{interim || "Talk like you would to a friend. Up to 2 minutes."}</span>
          </span>
          <button type="button" onClick={() => recognitionRef.current?.stop()} className="inline-flex min-h-[44px] items-center rounded-full bg-[var(--nn-accent)] px-5 text-sm font-bold text-primary-foreground">
            Done
          </button>
        </div>
      )}

      <textarea
        id="listing-description"
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setVoiced(false);
        }}
        rows={6}
        placeholder="Tap a starter above, or type here…"
        aria-describedby={cn("extra-help", (aiNote || voiced) && "extra-note")}
        className={cn(inputClass, "resize-y")}
      />

      <div className="flex flex-wrap items-center gap-2">
        {canSpeak && !listening && (
          <button
            type="button"
            onClick={startVoice}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border-[1.5px] border-[var(--nn-border)] bg-card px-4 text-sm font-bold hover:bg-[var(--nn-soft)]"
          >
            <Mic className="h-4 w-4" aria-hidden="true" />
            Tell me out loud
          </button>
        )}
        {aiVisible && (
          <AiButton label={voiced ? "Tidy it up with AI" : "Polish with AI"} busy={aiBusy} onClick={onPolish} disabled={!value.trim()} />
        )}
      </div>
      {(voiced || aiNote) && (
        <p id="extra-note" className="text-sm text-muted-foreground">
          {voiced ? VOICE_NOTE : AI_SUGGESTION_NOTE}
        </p>
      )}

      <p className="rounded-2xl bg-[var(--nn-tip-bg)] p-3 text-sm text-[var(--nn-tip-text)]">
        🔒 Keep your address, door codes and Wi-Fi password for the Welcome Guide. Only your confirmed Nomad sees that.
      </p>
    </section>
  );
};

export default ExtraNoteField;
