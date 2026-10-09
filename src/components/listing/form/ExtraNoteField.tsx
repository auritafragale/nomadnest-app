import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { AI_SUGGESTION_NOTE } from "@/hooks/useWritingHelper";
import { speechRecognitionCtor, transcriptFrom, type SpeechRecognitionLike } from "@/lib/speech";
import { AiButton, inputClass } from "./FormBits";
import { cn } from "@/lib/utils";

/** Sentence starters: the card (icon and short label) and the text it inserts. */
export const STARTERS: { icon: string; label: string; text: string }[] = [
  { icon: "🌳", label: "Our area", text: "What we love about our area…" },
  { icon: "📍", label: "Close by", text: "Close by…" },
  { icon: "🚆", label: "Getting here", text: "Getting here…" },
  { icon: "💻", label: "Working from here", text: "Working from here…" },
  { icon: "🏠", label: "Home quirks", text: "Little quirks of our home…" },
  { icon: "🎁", label: "Free to use", text: "Free to use…" },
  { icon: "⭐", label: "A perfect sit", text: "A perfect sit for us…" },
  { icon: "☕", label: "Favourite spot", text: "Our favourite local spot…" },
];

const VOICE_NOTE = "We turned what you said into text. Read it and change anything that isn't right. We never keep a recording.";
const MAX_SECONDS = 120;

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
  const [listening, setListening] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [interim, setInterim] = useState("");
  const [voiced, setVoiced] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const spokenRef = useRef("");
  // The box as it is right now (starters tapped or typing while listening).
  const valueRef = useRef(value);
  valueRef.current = value;
  const canSpeak = !!speechRecognitionCtor();

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

  // A starter is ticked only while its text is in the box.
  const isUsed = (text: string) => value.includes(text);

  const addStarter = (starter: string) => {
    const el = ref.current;
    const at = el && document.activeElement === el ? el.selectionStart : value.length;
    const before = value.slice(0, at);
    const after = value.slice(at);
    const lead = before && !before.endsWith("\n") ? "\n" : "";
    const insert = `${lead}${starter} `;
    onChange(before + insert + after);
    requestAnimationFrame(() => {
      const pos = before.length + insert.length;
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  };

  const startVoice = () => {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language || "en-GB";
    rec.continuous = true;
    rec.interimResults = true;
    spokenRef.current = "";
    rec.onresult = (e) => {
      // Rebuilt from the whole list every time, so no word appears twice.
      const { final, interim: live } = transcriptFrom(e.results);
      spokenRef.current = final;
      setInterim([final, live].filter(Boolean).join(" "));
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      const said = spokenRef.current.trim();
      if (said) {
        // Added to whatever is in the box now, on a new line.
        const current = valueRef.current;
        onChange(current + (current && !current.endsWith("\n") ? "\n" : "") + said);
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

      <p className="text-sm font-semibold">Need ideas? Tap one to start a sentence.</p>
      <div role="group" aria-label="Sentence starters" className="grid grid-cols-2 gap-2">
        {STARTERS.map((s) => {
          const on = isUsed(s.text);
          return (
            <button
              key={s.text}
              type="button"
              aria-pressed={on}
              onClick={() => addStarter(s.text)}
              className={cn(
                "flex min-h-[56px] items-center gap-2.5 rounded-2xl border-[1.5px] px-3 py-2 text-left text-sm font-semibold",
                on
                  ? "border-brand-teal bg-[var(--nn-ok-bg)] text-foreground"
                  : "border-[var(--nn-border)] bg-card text-foreground hover:bg-[var(--nn-soft)]",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base",
                  on ? "bg-brand-teal font-bold text-primary-foreground" : "bg-[var(--nn-chip)]",
                )}
              >
                {on ? "✓" : s.icon}
              </span>
              <span className="min-w-0 leading-snug">
                {s.label}
                <span className="sr-only">, adds “{s.text}”</span>
              </span>
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
