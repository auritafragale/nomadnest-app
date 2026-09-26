import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, HeartPulse, MessageCircleQuestion, Pencil, RotateCcw, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { mentionsArrivalDetails } from "@/lib/askNest";
import {
  useGuideQa,
  useGuideQaActions,
  useOwnerGuideQuestions,
  useSetGuideQuestionDismissed,
  type GuideQuestion,
  type GuideQa,
} from "@/hooks/useAskNest";

const DAY_MS = 86_400_000;
/** Emergency checks show while the sit is on and for this long after it ends. */
const EMERGENCY_AFTER_SIT_DAYS = 7;
/** Questions from sits that ended longer ago than this move to "Older". */
const OLDER_AFTER_SIT_DAYS = 30;
const TOP_COUNT = 5;

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Repeats grouped by Ask the Nest, shown to the owner as one item. */
interface QuestionGroup {
  /** The first question asked; answering or dismissing it covers the group. */
  root: GuideQuestion;
  askCount: number;
  sitterCount: number;
  latestAt: number;
  /** Latest sit end in the group; null while any of its sits is unknown. */
  sitEndedAt: number | null;
  sentInChat: boolean;
  dismissed: boolean;
}

const buildGroups = (questions: GuideQuestion[]): QuestionGroup[] => {
  const byRoot = new Map<string, GuideQuestion[]>();
  for (const q of questions) {
    if (q.is_emergency) continue;
    const key = q.parent_question_id ?? q.id;
    byRoot.set(key, [...(byRoot.get(key) ?? []), q]);
  }
  return [...byRoot.entries()].map(([rootId, members]) => {
    const oldestFirst = [...members].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const root = members.find((m) => m.id === rootId) ?? oldestFirst[0];
    const ends = members.map((m) => (m.sit_ended_at ? new Date(m.sit_ended_at).getTime() : null));
    return {
      root,
      askCount: members.length,
      sitterCount: new Set(members.map((m) => m.sitter_user_id)).size,
      latestAt: Math.max(...members.map((m) => new Date(m.created_at).getTime())),
      sitEndedAt: ends.some((e) => e === null) ? null : Math.max(...(ends as number[])),
      sentInChat: members.some((m) => !!m.asked_owner_at),
      dismissed: !!root.dismissed_at,
    };
  });
};

/** Most asked first, then newest. */
const byMostAsked = (a: QuestionGroup, b: QuestionGroup) => b.askCount - a.askCount || b.latestAt - a.latestAt;

const askedLabel = (g: QuestionGroup) =>
  g.sitterCount > 1 ? `Asked by ${g.sitterCount} sitters` : g.askCount > 1 ? `Asked ${g.askCount} times` : null;

const QuestionAnswer = ({
  group,
  onSave,
  onDismiss,
  saving,
  dismissing,
}: {
  group: QuestionGroup;
  onSave: (text: string, arrivalOnly: boolean) => Promise<void>;
  onDismiss: () => void;
  saving: boolean;
  dismissing: boolean;
}) => {
  const q = group.root;
  const [text, setText] = useState("");
  const [arrivalOnly, setArrivalOnly] = useState(() => mentionsArrivalDetails(q.question));
  const asked = askedLabel(group);
  return (
    <li className="space-y-2 rounded-xl border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{q.question}</p>
        <span className="shrink-0 text-xs text-muted-foreground">{when(new Date(group.latestAt).toISOString())}</span>
      </div>
      {(asked || group.sentInChat) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {asked && (
            <Badge variant="secondary" className="gap-1 text-[11px]">
              <Users className="h-3 w-3" aria-hidden="true" />
              {asked}
            </Badge>
          )}
          {group.sentInChat && <span>Also sent to you in chat.</span>}
        </div>
      )}
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
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={saving || !text.trim()} onClick={() => onSave(text, arrivalOnly).then(() => setText(""), () => undefined)}>
          {saving ? "Saving…" : "Save to guide"}
        </Button>
        <Button size="sm" variant="ghost" disabled={saving || dismissing} onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </li>
  );
};

const CollapsedSection = ({ title, count, children }: { title: string; count: number; children: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t pt-3">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-lg text-left text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          {title} ({count})
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">{children}</CollapsibleContent>
    </Collapsible>
  );
};

/**
 * "Questions from your sitters": recent emergency checks first, then open
 * questions (repeats grouped, most asked first), with "Older" and "Dismissed"
 * sections. Nothing is ever deleted here.
 */
export const GuideQuestionsCard = ({ listingId }: { listingId: string }) => {
  const { data: questions = [] } = useOwnerGuideQuestions(listingId);
  const { answer } = useGuideQaActions(listingId);
  const setDismissed = useSetGuideQuestionDismissed();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const now = Date.now();
  const emergencySince = now - EMERGENCY_AFTER_SIT_DAYS * DAY_MS;
  // Current sits, or sits that ended in the last 7 days.
  const emergencies = questions.filter(
    (q) => q.is_emergency && !q.dismissed_at && new Date(q.sit_ended_at ?? q.created_at).getTime() >= emergencySince,
  );
  const groups = buildGroups(questions).sort(byMostAsked);
  const isOlder = (g: QuestionGroup) => g.sitEndedAt !== null && g.sitEndedAt < now - OLDER_AFTER_SIT_DAYS * DAY_MS;
  const open = groups.filter((g) => !g.dismissed && !isOlder(g));
  const older = groups.filter((g) => !g.dismissed && isOlder(g));
  const dismissed = groups.filter((g) => g.dismissed);
  if (emergencies.length === 0 && groups.length === 0) return null;

  const visible = showAll ? open : open.slice(0, TOP_COUNT);

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

  const dismiss = (q: GuideQuestion, value: boolean) =>
    setDismissed.mutate(
      { questionId: q.id, dismissed: value },
      {
        onSuccess: () => toast.success(value ? "Question dismissed" : "Question restored"),
        onError: (err) => toast.error(err.message || "Couldn't update it. Please try again."),
      },
    );

  const renderGroup = (g: QuestionGroup) => (
    <QuestionAnswer
      key={g.root.id}
      group={g}
      saving={savingId === g.root.id}
      dismissing={setDismissed.isPending}
      onSave={(t, a) => save(g.root, t, a)}
      onDismiss={() => dismiss(g.root, true)}
    />
  );

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <MessageCircleQuestion className="h-5 w-5 text-primary" aria-hidden="true" />
        Questions from your sitters
      </h2>
      {emergencies.length === 0 && open.length === 0 && (
        <p className="text-sm text-muted-foreground">You're all caught up.</p>
      )}
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
        {visible.map(renderGroup)}
      </ul>
      {open.length > TOP_COUNT && (
        <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `See all (${open.length})`}
        </Button>
      )}

      <CollapsedSection title="Older" count={older.length}>
        <p className="mb-3 text-xs text-muted-foreground">From sits that ended more than {OLDER_AFTER_SIT_DAYS} days ago.</p>
        <ul className="space-y-3">{older.map(renderGroup)}</ul>
      </CollapsedSection>

      <CollapsedSection title="Dismissed" count={dismissed.length}>
        <ul className="space-y-2">
          {dismissed.map((g) => {
            const asked = askedLabel(g);
            return (
              <li key={g.root.id} className="flex items-start justify-between gap-3 rounded-xl border bg-background p-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm">{g.root.question}</p>
                  {asked && <p className="text-xs text-muted-foreground">{asked}</p>}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 gap-1 px-2 text-xs"
                  disabled={setDismissed.isPending}
                  onClick={() => dismiss(g.root, false)}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Restore
                </Button>
              </li>
            );
          })}
        </ul>
      </CollapsedSection>
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
