import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, ChevronRight, HeartPulse, MessageCircle, Pencil, RotateCcw, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState, SectionCard, SerifTitle, StatusChip, nnButton } from "@/components/nn/ui";
import { mentionsArrivalDetails } from "@/lib/askNest";
import { cn } from "@/lib/utils";
import {
  useGuideQa,
  useGuideQaActions,
  useOwnerGuideQuestions,
  useRemoveGuideQuestion,
  useSetGuideQuestionDismissed,
  type GuideQa,
  type GuideQuestion,
} from "@/hooks/useAskNest";

const DAY_MS = 86_400_000;
/** Emergency checks show while the sit is on and for this long after it ends. */
const EMERGENCY_AFTER_SIT_DAYS = 7;
/** Questions from sits that ended longer ago than this move to "Older questions". */
const OLDER_AFTER_SIT_DAYS = 30;

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Repeats grouped by Ask the Nest, shown to the owner as one item. */
export interface QuestionGroup {
  /** The first question asked; answering or dismissing it covers the group. */
  root: GuideQuestion;
  askCount: number;
  sitterCount: number;
  latestAt: number;
  /** Latest sit end in the group; null while any of its sits is unknown. */
  sitEndedAt: number | null;
  sentInChat: boolean;
  dismissed: boolean;
  /** Prefill for "Your answer": the saved draft, else the latest chat reply. */
  prefill: string | null;
}

const latestChatReply = (members: GuideQuestion[]) =>
  members
    .filter((m) => m.chat_reply && m.chat_reply_at)
    .sort((a, b) => b.chat_reply_at!.localeCompare(a.chat_reply_at!))[0]?.chat_reply ?? null;

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
      prefill: (root.draft_answer ?? members.find((m) => m.draft_answer)?.draft_answer ?? latestChatReply(members))?.slice(0, 2000) ?? null,
    };
  });
};

/** Most asked first, then newest. */
const byMostAsked = (a: QuestionGroup, b: QuestionGroup) => b.askCount - a.askCount || b.latestAt - a.latestAt;

const askedLabel = (g: QuestionGroup) =>
  g.sitterCount > 1 ? `Asked by ${g.sitterCount} sitters` : g.askCount > 1 ? `Asked ${g.askCount} times` : null;

/**
 * The owner's sitter questions sorted into emergency checks (current sits and
 * the 7 days after), open questions, older ones and dismissed ones. Nothing
 * is deleted unless the owner removes a dismissed question.
 */
export const useGuideQuestionGroups = (listingId: string) => {
  const { data: questions = [], isLoading } = useOwnerGuideQuestions(listingId);
  const now = Date.now();
  const emergencies = questions.filter(
    (q) =>
      q.is_emergency &&
      !q.dismissed_at &&
      new Date(q.sit_ended_at ?? q.created_at).getTime() >= now - EMERGENCY_AFTER_SIT_DAYS * DAY_MS,
  );
  const groups = buildGroups(questions).sort(byMostAsked);
  const isOlder = (g: QuestionGroup) => g.sitEndedAt !== null && g.sitEndedAt < now - OLDER_AFTER_SIT_DAYS * DAY_MS;
  return {
    isLoading,
    emergencies,
    open: groups.filter((g) => !g.dismissed && !isOlder(g)),
    older: groups.filter((g) => !g.dismissed && isOlder(g)),
    dismissed: groups.filter((g) => g.dismissed),
  };
};

/** Arrival-detail tick box, shared by questions and saved answers. */
const ArrivalTick = ({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) => (
  <button type="button" role="checkbox" aria-checked={on} onClick={() => onChange(!on)} className="flex min-h-[44px] items-start gap-3 text-left">
    <span
      className={cn(
        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2",
        on ? "border-primary bg-primary text-primary-foreground" : "border-[var(--nn-border)]",
      )}
    >
      {on && <Check className="h-4 w-4" aria-hidden="true" />}
    </span>
    <span className="flex flex-col gap-0.5">
      <span className="text-[15px] font-semibold">This is an arrival detail</span>
      <span className="text-[13px] text-muted-foreground">Only shown 48 hours before a sit, like keys and codes</span>
    </span>
  </button>
);

const QuestionCard = ({
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
  const [text, setText] = useState(group.prefill ?? "");
  const [arrivalOnly, setArrivalOnly] = useState(() => mentionsArrivalDetails(q.question));
  const asked = askedLabel(group);
  const fromChat = !!group.prefill && text.trim() !== "" && text === group.prefill;
  return (
    <SectionCard label={q.question} className="flex flex-col gap-3 p-[18px]">
      <div className="flex flex-col gap-1">
        <p className="text-[17px] font-bold leading-snug">{q.question}</p>
        <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
          {asked && (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {asked}
            </span>
          )}
          {asked && group.sentInChat && <span aria-hidden="true">·</span>}
          {group.sentInChat && <span>{asked ? "also sent to you in chat" : "Also sent to you in chat"}</span>}
          {!asked && !group.sentInChat && <span>{when(new Date(group.latestAt).toISOString())}</span>}
        </p>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between gap-2 text-[15px] font-semibold">
          Your answer
          {fromChat && (
            <span className="inline-flex items-center gap-1 text-[13px] font-normal text-muted-foreground">
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
              From your chat reply
            </span>
          )}
        </span>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 2000))}
          rows={3}
          maxLength={2000}
          aria-label={`Answer to: ${q.question}`}
          className="rounded-2xl border-[var(--nn-border)] text-base"
        />
      </label>
      <ArrivalTick on={arrivalOnly} onChange={setArrivalOnly} />
      <button
        type="button"
        disabled={saving || !text.trim()}
        onClick={() => onSave(text, arrivalOnly).then(() => setText(""), () => undefined)}
        className={nnButton("primary", "h-[52px] rounded-2xl text-[15px]")}
      >
        {saving ? "Saving…" : "Save to guide"}
      </button>
      <button type="button" disabled={saving || dismissing} onClick={onDismiss} className={nnButton("ghost", "self-center")}>
        Not needed, dismiss
      </button>
    </SectionCard>
  );
};

/** Saving an answer (and sending it to the sitter in chat when they're waiting). */
const useQuestionActions = (listingId: string) => {
  const { answer } = useGuideQaActions(listingId);
  const setDismissed = useSetGuideQuestionDismissed();
  const removeQuestion = useRemoveGuideQuestion();
  const [savingId, setSavingId] = useState<string | null>(null);

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
  return { save, dismiss, savingId, setDismissed, removeQuestion };
};

const SavedAnswer = ({ item, listingId }: { item: GuideQa; listingId: string }) => {
  const { update, remove } = useGuideQaActions(listingId);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.answer);
  const [arrivalOnly, setArrivalOnly] = useState(item.arrival_only);
  const [confirm, setConfirm] = useState(false);

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
    <SectionCard className="flex flex-col gap-2.5 p-[18px]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[16px] font-bold">{item.question}</p>
        {item.arrival_only && <StatusChip tone="gold">Arrival detail</StatusChip>}
      </div>
      {editing ? (
        <>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 2000))}
            rows={3}
            aria-label={`Answer to: ${item.question}`}
            className="rounded-2xl border-[var(--nn-border)] text-base"
          />
          <ArrivalTick on={arrivalOnly} onChange={setArrivalOnly} />
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={update.isPending || !text.trim()} className={nnButton("primary", "flex-1")}>
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className={nnButton("secondary", "flex-1")}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="whitespace-pre-line text-[15px] text-muted-foreground">{item.answer}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing(true)} className={nnButton("ghost", "px-3")}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit
            </button>
            <button type="button" onClick={() => setConfirm(true)} className={nnButton("ghost", "px-3 text-destructive")}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Remove
            </button>
          </div>
        </>
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this answer from your guide?</AlertDialogTitle>
            <AlertDialogDescription>Your Nomads and Ask the Nest won't see it any more.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => remove.mutate(item.id, { onError: () => toast.error("Couldn't remove it.") })}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
};

/**
 * "Questions from your sitters" (design: GuideQuestionsPhone/Tablet/Desktop):
 * the emergency-check alert, To answer / Saved tabs, one question per card,
 * and Older questions / Dismissed as their own lists (?view=older|dismissed).
 */
export const GuideQuestions = ({ listingId }: { listingId: string }) => {
  const [params, setParams] = useSearchParams();
  const view = params.get("view");
  const tab = params.get("tab") === "saved" ? "saved" : "answer";
  const { emergencies, open, older, dismissed, isLoading } = useGuideQuestionGroups(listingId);
  const { data: qa = [] } = useGuideQa(listingId);
  const actions = useQuestionActions(listingId);
  const [confirmRemove, setConfirmRemove] = useState<GuideQuestion | null>(null);
  const set = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    setParams(p);
  };

  const card = (g: QuestionGroup) => (
    <QuestionCard
      key={g.root.id}
      group={g}
      saving={actions.savingId === g.root.id}
      dismissing={actions.setDismissed.isPending}
      onSave={(t, a) => actions.save(g.root, t, a)}
      onDismiss={() => actions.dismiss(g.root, true)}
    />
  );

  // ─── Older questions / Dismissed ─────────────────────────────────────────
  if (view === "older" || view === "dismissed") {
    const list = view === "older" ? older : dismissed;
    return (
      <div className="flex flex-col gap-[18px]">
        <button type="button" onClick={() => set({ view: null })} className={nnButton("ghost", "-ml-2 self-start px-2")}>
          All questions
        </button>
        <SerifTitle as="h2" className="text-[26px]">
          {view === "older" ? "Older questions" : "Dismissed"}
        </SerifTitle>
        <p className="text-[15px] text-muted-foreground">
          {view === "older"
            ? `From sits that ended more than ${OLDER_AFTER_SIT_DAYS} days ago. You can still answer them.`
            : "Questions you said weren't needed. Restore one to answer it, or remove it for good."}
        </p>
        {list.length === 0 ? (
          <EmptyState title="Nothing here" text={view === "older" ? "No older questions." : "No dismissed questions."} />
        ) : view === "older" ? (
          <div className="grid gap-4 lg:grid-cols-2">{list.map(card)}</div>
        ) : (
          <SectionCard className="px-[18px] py-1.5">
            {list.map((g, i) => (
              <div key={g.root.id} className={cn("flex flex-col gap-2 py-3.5", i > 0 && "border-t border-[var(--nn-line)]")}>
                <p className="text-[15px] font-semibold">{g.root.question}</p>
                {askedLabel(g) && <p className="text-[13px] text-muted-foreground">{askedLabel(g)}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={actions.setDismissed.isPending || actions.removeQuestion.isPending}
                    onClick={() => actions.dismiss(g.root, false)}
                    className={nnButton("secondary", "px-4")}
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Restore
                  </button>
                  <button
                    type="button"
                    disabled={actions.setDismissed.isPending || actions.removeQuestion.isPending}
                    onClick={() => setConfirmRemove(g.root)}
                    className={nnButton("ghost", "px-3 text-destructive")}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </SectionCard>
        )}
        <AlertDialog open={!!confirmRemove} onOpenChange={(o) => !o && setConfirmRemove(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove this question?</AlertDialogTitle>
              <AlertDialogDescription>It won't come back.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (!confirmRemove) return;
                  actions.removeQuestion.mutate(confirmRemove.id, {
                    onSuccess: () => toast.success("Question removed"),
                    onError: (err) => toast.error(err.message || "Couldn't remove it. Please try again."),
                  });
                  setConfirmRemove(null);
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ─── To answer / Saved ───────────────────────────────────────────────────
  const pill = (id: "answer" | "saved", label: string) => (
    <button
      type="button"
      aria-pressed={tab === id}
      onClick={() => set({ tab: id === "saved" ? "saved" : null })}
      className={cn(
        "inline-flex h-11 items-center rounded-full border-[1.5px] px-4 text-sm",
        tab === id ? "border-[var(--nn-accent)] bg-[var(--nn-accent)] font-bold text-primary-foreground" : "border-[var(--nn-border)] bg-card font-semibold",
      )}
    >
      {label}
    </button>
  );
  const row = (to: string, title: string, count: number) => (
    <Link to={to} className="flex min-h-[52px] items-center justify-between gap-3 border-t border-[var(--nn-line)] py-3 first:border-t-0">
      <span className="text-[15px] font-semibold">{title}</span>
      <span className="flex items-center gap-1 text-sm text-muted-foreground">
        {count}
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </Link>
  );

  return (
    <div className="flex flex-col gap-[18px]">
      {emergencies.map((q) => (
        <p key={q.id} role="alert" className="flex items-start gap-3 rounded-[20px] border border-[var(--nn-tip-border)] bg-[var(--nn-tip-bg)] px-4 py-3.5 text-[15px] leading-snug">
          <HeartPulse className="mt-0.5 h-5 w-5 shrink-0 text-[var(--nn-tip-text)]" aria-hidden="true" />
          <span>
            <strong>Emergency check, {when(q.created_at)}.</strong> Your sitter asked "{q.question}" and was shown your vet and
            emergency details.{q.asked_owner_at ? " They also sent this to you in chat." : ""}
          </span>
        </p>
      ))}

      <nav aria-label="Filter questions" className="flex gap-2">
        {pill("answer", `To answer · ${open.length}`)}
        {pill("saved", `Saved · ${qa.length}`)}
      </nav>

      {tab === "answer" ? (
        isLoading ? null : open.length === 0 ? (
          <EmptyState title="You're all caught up" text="New questions from your sitters will show up here." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">{open.map(card)}</div>
        )
      ) : qa.length === 0 ? (
        <EmptyState title="No saved answers yet" text="Answers you save to your guide show up here. Your Nomads and Ask the Nest use them." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {qa.map((item) => (
            <SavedAnswer key={item.id} item={item} listingId={listingId} />
          ))}
        </div>
      )}

      {(older.length > 0 || dismissed.length > 0) && (
        <SectionCard className="px-[18px] py-1.5 lg:max-w-xl">
          {older.length > 0 && row("?view=older", "Older questions", older.length)}
          {dismissed.length > 0 && row("?view=dismissed", "Dismissed", dismissed.length)}
        </SectionCard>
      )}
    </div>
  );
};
