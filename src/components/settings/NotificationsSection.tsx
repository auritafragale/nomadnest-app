import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { nnButton } from "@/components/nn/ui";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  type MessageEmailFrequency,
  type NotificationPreferences,
} from "@/hooks/useNotificationPreferences";
import { GroupTitle, Note, Segmented, ToggleRow } from "./SettingsParts";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  label: string;
  sub: string;
  /** null: this row has no email (City Chat replies). */
  email: { on: boolean; set: Partial<NotificationPreferences> | ((on: boolean) => Partial<NotificationPreferences>) } | null;
  /** null: this row has no push (Membership). */
  push: keyof NotificationPreferences | null;
};

const Cell = ({ on, label, text, onFlip, disabled }: { on: boolean; label: string; text: string; onFlip: () => void; disabled?: boolean }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={onFlip}
    disabled={disabled}
    className={cn(
      "inline-flex min-h-[44px] min-w-[84px] items-center justify-center rounded-full border-[1.5px] px-3 text-sm font-bold",
      on ? "border-transparent bg-[var(--nn-accent)] text-primary-foreground" : "border-[var(--nn-border)] bg-card text-muted-foreground",
    )}
  >
    {text}
  </button>
);

const NoCell = ({ label }: { label: string }) => (
  <span aria-label={label} className="inline-flex min-h-[44px] min-w-[84px] items-center justify-center text-sm text-muted-foreground">
    —
  </span>
);

/** Settings, Notifications: push on this device, then email and push per kind. */
const NotificationsSection = () => {
  const { user, role } = useAuth();
  const { data: prefs, isLoading } = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const push = usePushNotifications();
  const [testing, setTesting] = useState(false);
  const isNomad = role === "sitter" || role === "both";

  const save = (patch: Partial<NotificationPreferences>) =>
    update.mutate(patch, {
      onSuccess: () => toast.success("Saved."),
      onError: () => toast.error("Couldn't save that. Please try again."),
    });

  const sendTest = async () => {
    if (!user) return;
    setTesting(true);
    try {
      const { error } = await supabase.functions.invoke("send-push-notification", {
        body: {
          user_id: user.id,
          payload: { title: "Test from NomadNest", body: "Push notifications are working on this device.", url: "/settings/notifications", tag: "test" },
        },
      });
      if (error) throw error;
      toast.success("Test sent. Check your phone.");
    } catch {
      toast.error("We couldn't send a test just now.");
    } finally {
      setTesting(false);
    }
  };

  const togglePush = async () => {
    if (push.isSubscribed) await push.unsubscribe();
    else await push.subscribe();
  };

  if (isLoading || !prefs) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 rounded-[18px]" />
        ))}
      </div>
    );
  }

  const appsEmail = prefs.email_new_applications && prefs.email_application_status;
  const rows: Row[] = [
    { id: "messages", label: "Messages", sub: "New chats and replies", email: { on: prefs.email_messages, set: (on) => ({ email_messages: on }) }, push: "push_messages" },
    {
      id: "applications",
      label: "Applications and invites",
      sub: "New applicants, invites, decisions",
      email: { on: appsEmail, set: (on) => ({ email_new_applications: on, email_application_status: on }) },
      push: "push_applications",
    },
    { id: "sits", label: "Your sits", sub: "Confirmations, daily updates, date changes", email: { on: prefs.email_sit_updates, set: (on) => ({ email_sit_updates: on }) }, push: "push_sits" },
    { id: "reviews", label: "Reviews", sub: "New reviews and reminders", email: { on: prefs.email_reviews, set: (on) => ({ email_reviews: on }) }, push: "push_reviews" },
    ...(isNomad ? [{ id: "city", label: "City Chat replies", sub: "Threads you follow", email: null, push: "push_city_chat" as const }] : []),
    { id: "membership", label: "Membership", sub: "Renewals and receipts", email: { on: prefs.email_membership, set: (on) => ({ email_membership: on }) }, push: null },
  ];

  return (
    <div className="flex flex-col gap-3">
      {push.isSupported ? (
        <ToggleRow
          id="push-device"
          label="Push on this phone"
          sub={
            push.permission === "denied"
              ? "Blocked in your browser. Allow notifications for NomadNest in your browser settings, then come back."
              : push.isSubscribed
                ? "On. Tap Send a test to check it works."
                : "Off. You will only get emails."
          }
          checked={push.isSubscribed}
          onChange={() => void togglePush()}
          disabled={push.isLoading || push.permission === "denied"}
        />
      ) : (
        <Note>Push notifications aren't supported in this browser. You'll get emails. On a phone, add NomadNest to your home screen to get pushes.</Note>
      )}

      <GroupTitle>What we tell you about</GroupTitle>
      <div className="overflow-hidden rounded-[18px] border border-[var(--nn-border)] bg-card">
        <div className="hidden grid-cols-[1fr_auto_auto] gap-3 border-b border-[var(--nn-line)] px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground sm:grid">
          <span>Kind</span>
          <span className="w-[84px] text-center">Email</span>
          <span className="w-[84px] text-center">Push</span>
        </div>
        {rows.map((r, i) => (
          <div key={r.id} className={cn("flex flex-col gap-2 px-4 py-3 sm:grid sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-3", i > 0 && "border-t border-[var(--nn-line)]")}>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">{r.label}</p>
              <p className="text-sm text-muted-foreground">{r.sub}</p>
            </div>
            <div className="flex gap-2 sm:contents">
              {r.email ? (
                <Cell
                  on={r.email.on}
                  label={`${r.label} by email`}
                  text={r.email.on ? "Email ✓" : "Email"}
                  onFlip={() => {
                    const e = r.email!;
                    save(typeof e.set === "function" ? e.set(!e.on) : e.set);
                  }}
                />
              ) : (
                <NoCell label={`${r.label}: no emails, push only`} />
              )}
              {r.push ? (
                <Cell
                  on={!!prefs[r.push]}
                  label={`${r.label} as a push`}
                  text={prefs[r.push] ? "Push ✓" : "Push"}
                  onFlip={() => save({ [r.push as string]: !prefs[r.push!] } as Partial<NotificationPreferences>)}
                />
              ) : (
                <NoCell label={`${r.label}: email only`} />
              )}
            </div>
          </div>
        ))}
      </div>

      <Segmented<MessageEmailFrequency>
        label="Message emails"
        options={[
          { id: "instant", label: "Right away" },
          { id: "daily", label: "Once a day" },
          { id: "never", label: "Never" },
        ]}
        value={prefs.email_messages ? prefs.message_email_frequency : "never"}
        onChange={(v) => save(v === "never" ? { message_email_frequency: "never", email_messages: false } : { message_email_frequency: v, email_messages: true })}
        sub="Push still tells you right away if it is on."
      />

      <Note>Always on: safety alerts, ID checks, payment problems and changes to your sits.</Note>

      {push.isSubscribed && (
        <button type="button" onClick={sendTest} disabled={testing} className={nnButton("secondary", "self-start")}>
          {testing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Send a test notification
        </button>
      )}
    </div>
  );
};

export default NotificationsSection;
