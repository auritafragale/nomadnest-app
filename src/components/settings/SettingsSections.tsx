import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { nnButton, shortRange } from "@/components/nn/ui";
import ResponsiveSheet from "@/components/nn/ResponsiveSheet";
import { PhoneVerification } from "@/components/settings/PhoneVerification";
import { startWalkthrough } from "@/components/walkthrough/GuidedWalkthrough";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme, type ThemePreference } from "@/contexts/ThemeContext";
import { supabase } from "@/integrations/supabase/client";
import { useProfileVisibility, useUpdateProfileVisibility } from "@/hooks/useProfileVisibility";
import { useVerification } from "@/hooks/useVerification";
import { useIdVerificationRequest } from "@/hooks/useIdVerificationRequest";
import { useMyPreferredLanguage, useSetPreferredLanguage } from "@/hooks/useDailyUpdates";
import { useDeleteAccount } from "@/hooks/useDeleteAccount";
import { UPDATE_LANGUAGES } from "@/lib/dailyUpdate";
import { InfoRow, Note, Segmented, ToggleRow, GroupTitle } from "./SettingsParts";

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;

/** The member's own contact details (email, phone). Only ever shown to them. */
export const useMyContact = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-contact", user?.id],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_my_contact_info").maybeSingle();
      const c = data as { email?: string | null; phone_verified?: boolean | null; phone_number?: string | null } | null;
      return { email: c?.email || user?.email || "", phoneVerified: !!c?.phone_verified, phoneNumber: c?.phone_number ?? null };
    },
    enabled: !!user,
  });
};

// ─── Privacy and visibility ────────────────────────────────────────────────

export const PrivacySection = () => {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const { data: vis, isLoading } = useProfileVisibility();
  const updateVis = useUpdateProfileVisibility();
  const isNomad = role === "sitter" || role === "both";

  // "Use my first name in Sit Stories" (Nomads; existing setting).
  const storyKey = ["my-settings", "share_name_in_stories", user?.id];
  const { data: shareName } = useQuery({
    queryKey: storyKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_settings");
      if (error) throw error;
      return ((data as { share_name_in_stories?: boolean } | null)?.share_name_in_stories ?? true) as boolean;
    },
    enabled: !!user && isNomad,
  });
  const saveStory = useMutation({
    mutationFn: async (v: boolean) => {
      const { error } = await supabase.rpc("set_my_story_name_sharing", { p_allow: v });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storyKey });
      toast.success("Saved.");
    },
    onError: () => toast.error("Couldn't save that. Please try again."),
  });

  if (isLoading) return <Skeleton className="h-40 rounded-[18px]" />;

  const nomadOn = !!vis?.sitterProfileActive;
  const paused = vis?.ownerProfileActive === false;

  return (
    <div className="flex flex-col gap-3">
      {vis?.hasSitterProfile && (
        <ToggleRow
          id="nomad-visible"
          label="Show my Nomad profile"
          sub={
            nomadOn
              ? "Pet Parents can find you in Browse Nomads and Nomads Near Me."
              : "Hidden from Browse Nomads and Nomads Near Me. People you already chat with can still message you."
          }
          checked={nomadOn}
          disabled={updateVis.isPending}
          onChange={(v) => updateVis.mutate({ profileType: "sitter", isActive: v })}
        />
      )}
      {vis?.hasOwnerProfile && (
        <ToggleRow
          id="listing-pause"
          label="Pause my listing"
          sub={paused ? "Your listing is hidden from Browse Sits. Confirmed sits are not affected." : "Your listing shows in Browse Sits."}
          checked={paused}
          disabled={updateVis.isPending}
          onChange={(v) => updateVis.mutate({ profileType: "owner", isActive: !v })}
        />
      )}
      {isNomad && (
        <ToggleRow
          id="story-name"
          label="Use my first name in Sit Stories"
          sub="Pet Parents can mention you by first name when they share a Sit Story. When this is off, it says “our NomadNest sitter”."
          checked={shareName ?? true}
          disabled={saveStory.isPending}
          onChange={(v) => saveStory.mutate(v)}
        />
      )}
      {!vis?.hasSitterProfile && !vis?.hasOwnerProfile && <Note>Finish setting up your profile first.</Note>}
      <Note>Your phone number is never shared automatically. Once a sit is confirmed, you can choose to share it in your chat.</Note>
    </div>
  );
};

// ─── Verification ──────────────────────────────────────────────────────────

export const VerificationSection = ({ openPhone }: { openPhone?: boolean }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: verification } = useVerification();
  const { data: idRequest } = useIdVerificationRequest();
  const { data: contact, isLoading } = useMyContact();
  const [changingPhone, setChangingPhone] = useState(!!openPhone);

  const idVerified = !!verification?.id_verified || idRequest?.status === "approved";
  const checkedOn = fmtDate(idRequest?.reviewed_at ?? null);

  return (
    <div className="flex flex-col gap-3">
      {idVerified ? (
        <InfoRow
          label="Identity"
          value="Verified"
          sub={`${checkedOn ? `Checked on ${checkedOn}. ` : ""}Your documents are never shown to anyone.`}
          chip="✓ Verified"
        />
      ) : idRequest?.status === "pending" ? (
        <InfoRow
          label="Identity"
          value="Being checked"
          sub={`Sent on ${fmtDate(idRequest.created_at)}. We'll email you once it's checked. Your documents are never shown to anyone.`}
          chip="In review"
          chipTone="warn"
        />
      ) : (
        <>
          <InfoRow
            label="Identity"
            value={idRequest?.status === "rejected" ? "Not approved" : "Not verified"}
            sub={
              idRequest?.status === "rejected"
                ? idRequest.notes || "Your photos couldn't be approved. Please try again with clearer photos."
                : "Verify your ID to apply for sits and create a listing. Your documents are never shown to anyone."
            }
            chip={idRequest?.status === "rejected" ? "Try again" : undefined}
            chipTone="warn"
          />
          <button type="button" onClick={() => navigate("/verify-identity")} className={nnButton("primary", "self-start")}>
            {idRequest?.status === "rejected" ? "Send my ID again" : "Verify my ID"}
          </button>
        </>
      )}

      <GroupTitle>Phone</GroupTitle>
      {isLoading ? (
        <Skeleton className="h-20 rounded-[18px]" />
      ) : contact?.phoneVerified && !changingPhone ? (
        <>
          <InfoRow
            label="Phone"
            value={contact.phoneNumber}
            sub="Only you see it here. Never shared automatically. Once a sit is confirmed, you can choose to share it in your chat."
            chip="✓ Verified"
          />
          <button type="button" onClick={() => setChangingPhone(true)} className={nnButton("secondary", "self-start")}>
            Change my phone number
          </button>
        </>
      ) : (
        <div className="rounded-[18px] border border-[var(--nn-border)] bg-card p-4">
          <PhoneVerification
            phoneVerified={false}
            phoneNumber={contact?.phoneNumber ?? null}
            onVerified={() => {
              setChangingPhone(false);
              queryClient.invalidateQueries({ queryKey: ["my-contact"] });
            }}
          />
          {contact?.phoneVerified && (
            <button type="button" onClick={() => setChangingPhone(false)} className={nnButton("ghost", "mt-2")}>
              Keep my current number
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Login and security ────────────────────────────────────────────────────

const field = "min-h-[44px] w-full rounded-xl border-[1.5px] border-[var(--nn-border)] bg-card px-3 text-[16px] outline-none focus:border-[var(--nn-accent)]";

/** Checks the current password before any change (signs in again with it). */
const confirmPassword = async (email: string, password: string) => {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error("That isn't your current password.");
};

export const LoginSection = () => {
  const { user } = useAuth();
  const { data: contact } = useMyContact();
  const email = contact?.email || user?.email || "";
  const [mode, setMode] = useState<null | "email" | "password">(null);
  const [current, setCurrent] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setMode(null);
    setCurrent("");
    setNewEmail("");
    setNewPassword("");
    setAgain("");
  };

  const changeEmail = async () => {
    if (!/^\S+@\S+\.\S+$/.test(newEmail.trim())) return toast.error("Please enter a valid email.");
    setBusy(true);
    try {
      await confirmPassword(email, current);
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (error) throw error;
      toast.success("Check both your old and new email to confirm the change.");
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't change your email.");
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    if (newPassword.length < 8) return toast.error("Use at least 8 characters.");
    if (newPassword !== again) return toast.error("The two new passwords don't match.");
    setBusy(true);
    try {
      await confirmPassword(email, current);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Your password has been changed.");
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't change your password.");
    } finally {
      setBusy(false);
    }
  };

  const currentField = (
    <label className="flex flex-col gap-1.5 text-sm font-semibold">
      Current password
      <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={field} />
    </label>
  );

  return (
    <div className="flex flex-col gap-3">
      <InfoRow label="Email" value={email} sub="We send sit and account emails here." chip={user?.email_confirmed_at ? "✓ Verified" : "Not verified"} chipTone={user?.email_confirmed_at ? "ok" : "warn"} />
      {mode === "email" ? (
        <div className="flex flex-col gap-3 rounded-[18px] border border-[var(--nn-border)] bg-card p-4">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            New email
            <input type="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className={field} />
          </label>
          {currentField}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={changeEmail} disabled={busy || !newEmail || !current} className={nnButton("primary")}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Change email
            </button>
            <button type="button" onClick={reset} className={nnButton("secondary")}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setMode("email")} className={nnButton("secondary", "self-start")}>Change email</button>
      )}

      <GroupTitle>Password</GroupTitle>
      <InfoRow label="Password" value="••••••••" sub="You will need your current password to change it." />
      {mode === "password" ? (
        <div className="flex flex-col gap-3 rounded-[18px] border border-[var(--nn-border)] bg-card p-4">
          {currentField}
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            New password (at least 8 characters)
            <input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            New password again
            <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className={field} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={changePassword} disabled={busy || !current || !newPassword || !again} className={nnButton("primary")}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Change password
            </button>
            <button type="button" onClick={reset} className={nnButton("secondary")}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setMode("password")} className={nnButton("secondary", "self-start")}>Change password</button>
      )}
    </div>
  );
};

// ─── Language ──────────────────────────────────────────────────────────────

const NONE = "none";

export const LanguageSection = () => {
  const { data: language, isLoading } = useMyPreferredLanguage();
  const setLanguage = useSetPreferredLanguage();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-[18px] border border-[var(--nn-border)] bg-card p-4">
        <label htmlFor="translate-into" className="text-[15px] font-semibold">Translate into</label>
        <Select
          value={language ?? NONE}
          disabled={isLoading || setLanguage.isPending}
          onValueChange={(value) =>
            setLanguage.mutate(value === NONE ? null : value, {
              onSuccess: () => toast.success("Saved."),
              onError: (err) => toast.error(err.message || "Couldn't save your language."),
            })
          }
        >
          <SelectTrigger id="translate-into" className="min-h-[44px] w-full sm:w-72" aria-label="Translate into">
            <SelectValue placeholder="Choose a language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Don't translate</SelectItem>
            {UPDATE_LANGUAGES.map((l) => (
              <SelectItem key={l.code} value={l.code}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">Choose from {UPDATE_LANGUAGES.length} languages, or turn translation off.</span>
      </div>
      <Note>You can always tap See original under a translated message.</Note>
    </div>
  );
};

// ─── Appearance ────────────────────────────────────────────────────────────

export const AppearanceSection = () => {
  const { preference, setPreference } = useTheme();
  return (
    <Segmented<ThemePreference>
      label="Theme"
      options={[
        { id: "system", label: "Match my phone" },
        { id: "light", label: "Light" },
        { id: "dark", label: "Dark" },
      ]}
      value={preference}
      onChange={(v) => {
        setPreference(v);
        toast.success("Saved.");
      }}
      sub="Dark mode is easier on the eyes at night."
    />
  );
};

// ─── Your data ─────────────────────────────────────────────────────────────

export const DataSection = () => {
  const [loading, setLoading] = useState(false);
  const download = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("export-my-data", { body: {} });
      if (error) {
        const detail = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
        throw new Error(detail?.error || "We couldn't prepare your data just now.");
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nomadnest-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Preparing your file. Photo links work for 7 days.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't prepare your data just now.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={download} disabled={loading} className={nnButton("primary", "self-start")}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {loading ? "Preparing…" : "Download my data"}
      </button>
      <Note>Your file is only shown to you. Keep it somewhere safe. Links to your photos and documents in it work for 7 days.</Note>
    </div>
  );
};

// ─── Help and tour ─────────────────────────────────────────────────────────

export const HelpSection = () => {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => {
          navigate("/dashboard");
          setTimeout(() => startWalkthrough(), 400);
        }}
        className={nnButton("secondary", "justify-start")}
      >
        Replay the app tour
      </button>
      <Link to="/faq" className={nnButton("secondary", "justify-start")}>Questions and answers</Link>
      <Link to="/contact" className={nnButton("secondary", "justify-start")}>Contact us</Link>
      <Link to="/code-of-conduct" className={nnButton("secondary", "justify-start")}>Code of conduct</Link>
    </div>
  );
};

// ─── Delete my account ─────────────────────────────────────────────────────

/** A confirmed or in-progress sit, which blocks deleting the account. */
const useMyLiveSit = (enabled: boolean) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-live-sit", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("sits")
        .select("id, owner_user_id, sitter_user_id, snapshot_start_date, snapshot_end_date, sit_dates(start_date, end_date)")
        .in("status", ["confirmed", "in_progress"])
        .or(`owner_user_id.eq.${user!.id},sitter_user_id.eq.${user!.id}`)
        .limit(1);
      const sit = (data ?? [])[0] as
        | { owner_user_id: string | null; sitter_user_id: string | null; snapshot_start_date: string | null; snapshot_end_date: string | null; sit_dates: { start_date: string; end_date: string } | null }
        | undefined;
      if (!sit) return null;
      const start = sit.sit_dates?.start_date ?? sit.snapshot_start_date;
      const end = sit.sit_dates?.end_date ?? sit.snapshot_end_date;
      const iAmOwner = sit.owner_user_id === user!.id;
      return { dates: start && end ? shortRange(start, end) : null, iAmOwner };
    },
    enabled: !!user && enabled,
  });
};

export const DeleteAccountSheet = ({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) => {
  const [text, setText] = useState("");
  const del = useDeleteAccount();
  const { data: liveSit, isLoading } = useMyLiveSit(open);
  useEffect(() => {
    if (!open) setText("");
  }, [open]);

  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title="Delete your account?" description="Permanently delete your NomadNest account.">
      <div className="flex flex-col gap-4">
        <p className="text-[15px]">
          This can't be undone. We delete your profile, photos, listing and messages you sent. We keep reviews you received without your name, and anything we must keep by law. Any membership is cancelled straight away.
        </p>
        <details className="rounded-2xl border border-[var(--nn-border)] p-4 text-sm">
          <summary className="min-h-[24px] cursor-pointer font-semibold">What we delete and what we keep</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Deleted: your profiles, photos and ID documents; your listings, applications and favourites; the photos you added to daily updates and chats; your notifications and settings.</li>
            <li>Sits, daily updates and chats you shared stay for the other member, with you shown as "Former member" and no name, photo or profile. Reviews you wrote stay as "Former member".</li>
            <li>Reports you made stay with our safety team without your name. Safety records about your account, including reviews about you (no longer shown to members), are kept for 24 months, then deleted.</li>
            <li>Your membership is cancelled with no further payments. Our payment provider keeps past invoices, as the law requires.</li>
          </ul>
        </details>
        {isLoading ? (
          <Skeleton className="h-16 rounded-2xl" />
        ) : liveSit ? (
          <p role="alert" className="rounded-2xl bg-[var(--nn-tip-bg)] p-4 text-[15px] text-[var(--nn-tip-text)]">
            You have a confirmed sit{liveSit.dates ? ` on ${liveSit.dates}` : ""}. Please cancel it first so{" "}
            {liveSit.iAmOwner ? "your Nomad isn't left without a sit" : "the Pet Parent isn't left without a Nomad"}.
          </p>
        ) : (
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Type DELETE to confirm
            <input value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" className={field} />
          </label>
        )}
        <button
          type="button"
          onClick={() => del.mutate()}
          disabled={!!liveSit || isLoading || text !== "DELETE" || del.isPending}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border-[1.5px] border-[var(--nn-danger-text)] px-5 text-sm font-bold text-[var(--nn-danger-text)] disabled:opacity-50"
        >
          {del.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Delete my account
        </button>
        <button type="button" onClick={() => onOpenChange(false)} className={nnButton("primary")}>
          Keep my account
        </button>
        <p className="text-sm text-muted-foreground">Want a copy of your data first? Use Your data, Download my data.</p>
      </div>
    </ResponsiveSheet>
  );
};
