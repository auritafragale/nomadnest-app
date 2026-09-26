import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BookOpen, HeartPulse, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useGuideAi } from "@/hooks/useWelcomeGuide";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useSaveGuideAnswerFromChat,
  useSetGuideQuestionDismissed,
  useSetGuideQuestionDraft,
  type LinkedGuideQuestion,
} from "@/hooks/useAskNest";
import { mentionsArrivalDetails } from "@/lib/askNest";

/** A chat message sent from Ask the Nest, shown to both people as a card. */
export const GuideQuestionCard = ({
  question,
  isEmergency,
  isOwn,
  time,
}: {
  question: string;
  isEmergency: boolean;
  isOwn: boolean;
  time: string;
}) => (
  <div
    className={cn(
      "max-w-[80%] space-y-1.5 rounded-xl border px-3.5 py-2.5",
      isEmergency ? "border-amber-500/40 bg-amber-500/5" : "border-primary/25 bg-primary/5",
    )}
  >
    <p
      className={cn(
        "flex items-center gap-1.5 text-xs font-medium",
        isEmergency ? "text-amber-800 dark:text-amber-300" : "text-primary",
      )}
    >
      {isEmergency ? <HeartPulse className="h-3.5 w-3.5" aria-hidden="true" /> : <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />}
      {isEmergency ? "Emergency check" : "From the Welcome Guide"}
    </p>
    <p className="whitespace-pre-wrap break-words text-sm text-foreground">{question}</p>
    <p className={cn("text-right text-xs text-muted-foreground", isOwn && "text-muted-foreground")}>{time}</p>
  </div>
);

const dismissKey = (messageId: string) => `nn_guide_prompt_dismissed_${messageId}`;
const isPromptDismissed = (messageId: string) => {
  try {
    return localStorage.getItem(dismissKey(messageId)) === "1";
  } catch {
    return false;
  }
};

/**
 * Under the owner's own reply, visible only to the owner: offer to save the
 * reply as a guide answer for the unanswered question(s) it may answer.
 */
export const AddToGuidePrompt = ({
  messageId,
  replyText,
  candidates,
}: {
  messageId: string;
  replyText: string;
  candidates: LinkedGuideQuestion[];
}) => {
  const [hidden, setHidden] = useState(() => isPromptDismissed(messageId));
  const [open, setOpen] = useState(false);
  const setDismissed = useSetGuideQuestionDismissed();
  const setDraft = useSetGuideQuestionDraft();
  if (hidden || candidates.length === 0) return null;

  // "Don't add": the question leaves the owner's list (restorable in the editor).
  const dontAdd = async (questions: LinkedGuideQuestion[]) => {
    try {
      for (const q of questions) await setDismissed.mutateAsync({ questionId: q.id, dismissed: true });
      toast.success(questions.length > 1 ? "Questions dismissed" : "Question dismissed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't dismiss it. Please try again.");
    }
  };

  const dontAddButton = (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 px-2 text-xs"
      disabled={setDismissed.isPending}
      onClick={candidates.length === 1 ? () => dontAdd(candidates) : undefined}
    >
      Don't add
    </Button>
  );

  return (
    <div className="mt-1.5 flex flex-wrap items-center justify-end gap-2 text-xs">
      <span className="text-muted-foreground">Add this to your Welcome Guide?</span>
      <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => setOpen(true)}>
        Add to guide
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        onClick={() => {
          // "Later": hide here only; the question stays in the owner's list,
          // with this reply kept as its draft answer. With several questions,
          // it goes to the newest one (the one this reply directly follows).
          setDraft.mutate({ questionId: candidates[0].id, draft: replyText });
          try {
            localStorage.setItem(dismissKey(messageId), "1");
          } catch {
            /* still hide for this session */
          }
          setHidden(true);
        }}
      >
        Later
      </Button>
      {candidates.length === 1 ? (
        dontAddButton
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>{dontAddButton}</DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-w-xs">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Don't add which question?</DropdownMenuLabel>
            {candidates.map((q) => (
              <DropdownMenuItem key={q.id} className="text-sm" onSelect={() => dontAdd([q])}>
                <span className="line-clamp-2">{q.question}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-sm" onSelect={() => dontAdd(candidates)}>
              All of these
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <AddToGuideSheet open={open} onOpenChange={setOpen} replyText={replyText} candidates={candidates} />
    </div>
  );
};

const AddToGuideSheet = ({
  open,
  onOpenChange,
  replyText,
  candidates,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  replyText: string;
  candidates: LinkedGuideQuestion[];
}) => {
  const isMobile = useIsMobile();
  const ai = useGuideAi();
  const save = useSaveGuideAnswerFromChat();
  const [questionId, setQuestionId] = useState<string | null>(candidates.length === 1 ? candidates[0].id : null);
  const [text, setText] = useState("");
  const [arrivalOnly, setArrivalOnly] = useState(false);
  const [tidying, setTidying] = useState(false);
  const [tidyNote, setTidyNote] = useState<string | null>(null);
  const question = candidates.find((c) => c.id === questionId) ?? null;

  // Reset each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setQuestionId(candidates.length === 1 ? candidates[0].id : null);
    setText("");
    setTidyNote(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Once a question is chosen: tidy the reply (if available), else use it as written.
  useEffect(() => {
    if (!open || !question) return;
    let cancelled = false;
    setArrivalOnly(mentionsArrivalDetails(question.question));
    if (!ai.visible) {
      setText(replyText);
      return;
    }
    setTidying(true);
    ai.polishAnswer(question.listing_id, question.question, replyText)
      .then((tidied) => {
        if (!cancelled) setText(tidied);
      })
      .catch(() => {
        if (cancelled) return;
        setText(replyText);
        setTidyNote("Couldn't tidy it this time, so here's your reply as written.");
      })
      .finally(() => {
        if (!cancelled) setTidying(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, question?.id]);

  const onSave = async () => {
    if (!question || !text.trim()) return;
    try {
      await save.mutateAsync({ questionId: question.id, text, arrivalOnly });
      toast.success("Added to your Welcome Guide");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save. Please try again.");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn("flex flex-col gap-4 overflow-y-auto", isMobile ? "max-h-[90dvh] rounded-t-2xl" : "w-full sm:max-w-md")}
      >
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
            Add to your Welcome Guide
          </SheetTitle>
          <SheetDescription>Saved answers help Ask the Nest answer your sitters next time.</SheetDescription>
        </SheetHeader>

        {!question ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Which question does your reply answer?</p>
            <div className="space-y-2" role="radiogroup" aria-label="Question">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={false}
                  onClick={() => setQuestionId(c.id)}
                  className="w-full rounded-xl border bg-card p-3 text-left text-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  {c.question}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Question</p>
              <p className="text-sm">{question.question}</p>
            </div>
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Answer for the guide
                {ai.visible && !tidyNote && <Sparkles className="h-3 w-3 text-primary" aria-hidden="true" />}
              </p>
              {tidying ? (
                <p className="flex items-center gap-2 rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Tidying your reply…
                </p>
              ) : (
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, 2000))}
                  rows={5}
                  aria-label="Answer for the guide"
                  className="rounded-xl text-base sm:text-sm"
                />
              )}
              {tidyNote && <p className="text-xs text-muted-foreground">{tidyNote}</p>}
            </div>
            <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={arrivalOnly} onCheckedChange={(c) => setArrivalOnly(c === true)} />
              Arrival detail (only visible in the 48-hour arrival window)
            </label>
            <div className="flex gap-2">
              {candidates.length > 1 && (
                <Button variant="ghost" onClick={() => setQuestionId(null)} disabled={save.isPending}>
                  Change question
                </Button>
              )}
              <Button className="ml-auto" onClick={onSave} disabled={tidying || save.isPending || !text.trim()}>
                {save.isPending ? "Saving…" : "Save to guide"}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
