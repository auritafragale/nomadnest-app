import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { HeartPulse, MessageCircleQuestion, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { mentionsArrivalDetails } from "@/lib/askNest";
import { useGuideQa, useGuideQaActions, useOwnerGuideQuestions, type GuideQuestion, type GuideQa } from "@/hooks/useAskNest";

const EMERGENCY_DAYS = 14;

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const QuestionAnswer = ({
  q,
  onSave,
  saving,
}: {
  q: GuideQuestion;
  onSave: (text: string, arrivalOnly: boolean) => Promise<void>;
  saving: boolean;
}) => {
  const [text, setText] = useState("");
  const [arrivalOnly, setArrivalOnly] = useState(() => mentionsArrivalDetails(q.question));
  return (
    <li className="space-y-2 rounded-xl border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{q.question}</p>
        <span className="shrink-0 text-xs text-muted-foreground">{when(q.created_at)}</span>
      </div>
      {q.asked_owner_at && <p className="text-xs text-muted-foreground">Also sent to you in chat.</p>}
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 2000))}
        rows={3}
        placeholder="Your answer"
        aria-label={`Answer to: ${q.question}`}
        className="rounded-xl text-base sm:text-sm"
      />
      <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <Checkbox checked={arrivalOnly} onCheckedChange={(c) => setArrivalOnly(c === true)} />
        Arrival detail (only visible in the 48-hour arrival window)
      </label>
      <Button size="sm" disabled={saving || !text.trim()} onClick={() => onSave(text, arrivalOnly).then(() => setText(""), () => undefined)}>
        {saving ? "Saving…" : "Save to guide"}
      </Button>
    </li>
  );
};

/** "Questions from your sitters": emergency checks first, then unanswered questions. */
export const GuideQuestionsCard = ({ listingId }: { listingId: string }) => {
  const { data: questions = [] } = useOwnerGuideQuestions(listingId);
  const { answer } = useGuideQaActions(listingId);
  const [savingId, setSavingId] = useState<string | null>(null);

  const since = Date.now() - EMERGENCY_DAYS * 86_400_000;
  const emergencies = questions.filter((q) => q.is_emergency && new Date(q.created_at).getTime() >= since);
  const unanswered = questions.filter((q) => !q.is_emergency && !q.answered_from_guide && !q.owner_answer);
  if (emergencies.length === 0 && unanswered.length === 0) return null;

  const save = async (q: GuideQuestion, text: string, arrivalOnly: boolean) => {
    setSavingId(q.id);
    try {
      const result = await answer.mutateAsync({ questionId: q.id, text, arrivalOnly });
      toast.success(result.chatSent ? "Saved to your guide and sent to your sitter" : "Saved to your guide");
    } catch (err) {
      toast.error((err as { message?: string })?.message || "Couldn't save. Please try again.");
      throw err;
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <MessageCircleQuestion className="h-5 w-5 text-primary" aria-hidden="true" />
        Questions from your sitters
      </h2>
      <ul className="space-y-3">
        {emergencies.map((q) => (
          <li key={q.id} className="space-y-1.5 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-800 dark:text-amber-300">
                <HeartPulse className="h-3 w-3" aria-hidden="true" />
                Emergency check
              </Badge>
              <span className="text-xs text-muted-foreground">{when(q.created_at)}</span>
            </div>
            <p className="text-sm">{q.question}</p>
            <p className="text-xs text-muted-foreground">
              Your sitter was shown your vet and emergency details.
              {q.asked_owner_at ? " They also sent this to you in chat." : ""}
            </p>
          </li>
        ))}
        {unanswered.map((q) => (
          <QuestionAnswer key={q.id} q={q} saving={savingId === q.id} onSave={(t, a) => save(q, t, a)} />
        ))}
      </ul>
    </section>
  );
};

const QaItem = ({ item, listingId }: { item: GuideQa; listingId: string }) => {
  const { update, remove } = useGuideQaActions(listingId);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.answer);
  const [arrivalOnly, setArrivalOnly] = useState(item.arrival_only);

  const save = async () => {
    try {
      await update.mutateAsync({ id: item.id, text, arrivalOnly });
      setEditing(false);
      toast.success("Answer updated");
    } catch (err) {
      toast.error((err as { message?: string })?.message || "Couldn't save. Please try again.");
    }
  };

  return (
    <li className="space-y-2 rounded-xl border bg-background p-3">
      <p className="text-sm font-medium">{item.question}</p>
      {editing ? (
        <>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 2000))}
            rows={3}
            aria-label={`Answer to: ${item.question}`}
            className="rounded-xl text-base sm:text-sm"
          />
          <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={arrivalOnly} onCheckedChange={(c) => setArrivalOnly(c === true)} />
            Arrival detail (only visible in the 48-hour arrival window)
          </label>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={update.isPending || !text.trim()}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="whitespace-pre-line text-sm text-muted-foreground">{item.answer}</p>
          {item.arrival_only && <Badge variant="secondary" className="text-[11px]">Arrival detail</Badge>}
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1 px-2 text-xs text-destructive"
              onClick={() => remove.mutate(item.id, { onError: () => toast.error("Couldn't remove it.") })}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Remove
            </Button>
          </div>
        </>
      )}
    </li>
  );
};

/** The guide's saved Q&A (used by Ask the Nest and shown to sitters). */
export const SavedQaCard = ({ listingId }: { listingId: string }) => {
  const { data: qa = [] } = useGuideQa(listingId);
  if (qa.length === 0) return null;
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <h2 className="font-semibold">Saved questions and answers</h2>
      <ul className="space-y-3">
        {qa.map((item) => (
          <QaItem key={item.id} item={item} listingId={listingId} />
        ))}
      </ul>
    </section>
  );
};
