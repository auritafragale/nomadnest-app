import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Check, Loader2, MessageCircle, Mic, MicOff, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSitterGuide, useSitterGuidePhotoUrls, type SitterGuide } from "@/hooks/useSitterGuide";
import { askTheNest, useSendGuideChatMessage } from "@/hooks/useAskNest";
import { isEmergencyQuestion, suggestedQuestions } from "@/lib/askNest";

// ─── Browser speech recognition (Web Speech API), where supported ───────────
// Only the transcribed text is used; the app never records or uploads audio.
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
const getSpeechRecognition = (): SpeechRecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const VOICE_NOTICE_KEY = "nn_voice_notice_seen";

type Turn =
  | { id: string; kind: "pending"; question: string }
  | { id: string; kind: "error"; question: string; message: string }
  | { id: string; kind: "emergency"; question: string; questionId: string | null; sent: boolean }
  | {
      id: string;
      kind: "answer";
      question: string;
      answer: string;
      fromGuide: boolean;
      photoIds: string[];
      questionId: string | null;
      sent: boolean;
    };

const EmergencyCard = ({ guide }: { guide: SitterGuide }) => {
  const vets = guide.pets
    .filter((p) => (p.vet_info || "").trim())
    .map((p) => ({ label: guide.pets.length > 1 ? `Vet for ${p.name || p.type}` : "Vet", value: p.vet_info as string }));
  const outOfHours = typeof guide.guide?.out_of_hours_vet === "string" ? guide.guide.out_of_hours_vet.trim() : "";
  const contacts = typeof guide.guide?.emergency_contacts === "string" ? guide.guide.emergency_contacts.trim() : "";
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 font-semibold text-destructive">
        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        Call the vet now
      </p>
      {vets.map((v) => (
        <div key={v.label}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{v.label}</p>
          <p className="whitespace-pre-line text-sm">{v.value}</p>
        </div>
      ))}
      {outOfHours && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Out-of-hours vet</p>
          <p className="whitespace-pre-line text-sm">{outOfHours}</p>
        </div>
      )}
      {contacts && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Emergency contacts</p>
          <p className="whitespace-pre-line text-sm">{contacts}</p>
        </div>
      )}
      {vets.length === 0 && !outOfHours && !contacts && (
        <p className="text-sm">
          The guide has no vet details. Call the nearest vet or emergency vet service now.
        </p>
      )}
    </div>
  );
};

/** "Ask the Nest": questions about the home, answered only from its Welcome Guide. */
export const AskNestSheet = ({
  listingId,
  open,
  onOpenChange,
}: {
  listingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { guide } = useSitterGuide(listingId, open);
  const { data: photoUrls = {} } = useSitterGuidePhotoUrls(listingId, open && !!guide);
  const sendChat = useSendGuideChatMessage();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [showVoiceNotice, setShowVoiceNotice] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const SpeechRecognition = getSpeechRecognition();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const owner = guide?.owner_first_name || "the Pet Parent";
  const update = (id: string, next: Turn) => setTurns((t) => t.map((x) => (x.id === id ? next : x)));

  const ask = async (raw: string) => {
    const question = raw.trim().replace(/\s+/g, " ").slice(0, 500);
    if (!question || busy) return;
    setInput("");
    const id = crypto.randomUUID();

    // Emergency: show the card immediately, no AI. The call below only records it.
    if (isEmergencyQuestion(question)) {
      setTurns((t) => [...t, { id, kind: "emergency", question, questionId: null, sent: false }]);
      askTheNest(listingId, question)
        .then((r) => setTurns((t) => t.map((x) => (x.id === id && x.kind === "emergency" ? { ...x, questionId: r.question_id ?? null } : x))))
        .catch(() => undefined);
      return;
    }

    setBusy(true);
    setTurns((t) => [...t, { id, kind: "pending", question }]);
    try {
      const reply = await askTheNest(listingId, question);
      if (reply.emergency) {
        update(id, { id, kind: "emergency", question, questionId: reply.question_id ?? null, sent: false });
      } else {
        update(id, {
          id,
          kind: "answer",
          question,
          answer: reply.answer ?? "",
          fromGuide: reply.answered_from_guide === true,
          photoIds: reply.photo_ids ?? [],
          questionId: reply.question_id ?? null,
          sent: false,
        });
      }
    } catch (err) {
      update(id, { id, kind: "error", question, message: err instanceof Error ? err.message : "Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const sendToOwner = async (turn: Extract<Turn, { kind: "answer" | "emergency" }>) => {
    if (!guide?.owner_user_id || !user) return;
    const body =
      turn.kind === "emergency"
        ? `Urgent from your Welcome Guide: ${turn.question}`
        : `Question from your Welcome Guide: ${turn.question}`;
    try {
      await sendChat.mutateAsync({
        listingId,
        ownerUserId: guide.owner_user_id,
        sitterUserId: user.id,
        body,
        questionId: turn.questionId,
      });
      setTurns((t) => t.map((x) => (x.id === turn.id && (x.kind === "answer" || x.kind === "emergency") ? { ...x, sent: true } : x)));
      toast.success(`Sent to ${owner}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send. Please try again.");
    }
  };

  const toggleVoice = () => {
    if (!SpeechRecognition) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    try {
      if (!localStorage.getItem(VOICE_NOTICE_KEY)) {
        setShowVoiceNotice(true);
        localStorage.setItem(VOICE_NOTICE_KEY, "1");
      }
    } catch {
      setShowVoiceNotice(true);
    }
    const rec = new SpeechRecognition();
    rec.lang = navigator.language || "en-GB";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      const text = event.results?.[0]?.[0]?.transcript ?? "";
      if (text) setInput((prev) => (prev ? `${prev} ${text}` : text));
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  const chips = guide ? suggestedQuestions(guide) : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn("flex flex-col gap-0 p-0", isMobile ? "h-[88dvh] rounded-t-2xl" : "w-full sm:max-w-md")}
      >
        <SheetHeader className="border-b px-4 py-4 text-left">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
            Ask the Nest
          </SheetTitle>
          <SheetDescription>Answers come only from {owner}'s Welcome Guide.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
          {!guide ? (
            <p className="text-sm text-muted-foreground">Loading the guide…</p>
          ) : turns.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Ask anything about the home and the pets.</p>
              <div className="flex flex-wrap gap-2">
                {chips.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => ask(c)}
                    className="rounded-full border bg-card px-3.5 py-2 text-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            turns.map((turn) => (
              <div key={turn.id} className="space-y-2">
                <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                  {turn.question}
                </p>
                <div
                  className={cn(
                    "max-w-[92%] rounded-2xl rounded-bl-md border px-3.5 py-3 text-sm",
                    turn.kind === "emergency" ? "border-destructive/40 bg-destructive/5" : "bg-card",
                  )}
                >
                  {turn.kind === "pending" && (
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Checking the guide…
                    </span>
                  )}
                  {turn.kind === "error" && <p className="text-muted-foreground">{turn.message}</p>}
                  {turn.kind === "emergency" && guide && (
                    <div className="space-y-3">
                      <EmergencyCard guide={guide} />
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={turn.sent || sendChat.isPending}
                        onClick={() => sendToOwner(turn)}
                      >
                        {turn.sent ? <Check className="h-4 w-4" aria-hidden="true" /> : <MessageCircle className="h-4 w-4" aria-hidden="true" />}
                        {turn.sent ? `Sent to ${owner}` : `Let ${owner} know`}
                      </Button>
                    </div>
                  )}
                  {turn.kind === "answer" && (
                    <div className="space-y-3">
                      <p className="whitespace-pre-line">{turn.answer}</p>
                      {turn.photoIds.filter((pid) => photoUrls[pid]).length > 0 && (
                        <div className="grid grid-cols-2 gap-2">
                          {turn.photoIds
                            .filter((pid) => photoUrls[pid])
                            .map((pid) => {
                              const photo = guide?.photos.find((p) => p.id === pid);
                              return (
                                <figure key={pid} className="overflow-hidden rounded-xl border">
                                  <img src={photoUrls[pid]} alt="" className="h-28 w-full object-cover" />
                                  {(photo?.instruction || photo?.note) && (
                                    <figcaption className="p-2 text-xs">{photo.instruction || photo.note}</figcaption>
                                  )}
                                </figure>
                              );
                            })}
                        </div>
                      )}
                      {!turn.fromGuide && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={turn.sent || sendChat.isPending}
                          onClick={() => sendToOwner(turn)}
                        >
                          {turn.sent ? <Check className="h-4 w-4" aria-hidden="true" /> : <MessageCircle className="h-4 w-4" aria-hidden="true" />}
                          {turn.sent ? `Sent to ${owner}` : `Ask ${owner}`}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <form
          className="border-t bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <div className="flex items-center gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, 500))}
              placeholder={listening ? "Listening…" : "Ask about the home or the pets"}
              aria-label="Your question"
              disabled={!guide}
              className="h-11 flex-1 rounded-full px-4 text-base sm:text-sm"
            />
            {SpeechRecognition && (
              <Button
                type="button"
                variant={listening ? "default" : "outline"}
                size="icon"
                className="h-11 w-11 shrink-0 rounded-full"
                onClick={toggleVoice}
                disabled={!guide}
                aria-label={listening ? "Stop voice input" : "Ask with your voice"}
                aria-pressed={listening}
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            )}
            <Button
              type="submit"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-full"
              disabled={!guide || busy || !input.trim()}
              aria-label="Send question"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          {showVoiceNotice && (
            <p className="mt-2 text-xs text-muted-foreground">Voice questions are transcribed by your phone's speech service.</p>
          )}
        </form>
      </SheetContent>
    </Sheet>
  );
};
