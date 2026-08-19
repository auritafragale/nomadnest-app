import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Send, MessageCircle, Star, Settings as SettingsIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveRole } from "@/contexts/ActiveRoleContext";

export const WALKTHROUGH_STORAGE_KEY = "nomadnest_walkthrough_seen";
export const WALKTHROUGH_EVENT = "nomadnest:start-walkthrough";

export const startWalkthrough = () =>
  window.dispatchEvent(new Event(WALKTHROUGH_EVENT));

type Step = {
  icon: typeof Search;
  title: string;
  body: string;
  cta?: { label: string; to: string };
};

const buildSteps = (isOwnerView: boolean): Step[] => [
  {
    icon: Search,
    title: isOwnerView ? "Browse Nomads" : "Browse sits",
    body: isOwnerView
      ? "Search verified Nomads by location, dates and pet experience. Every profile shows reviews and verification badges."
      : "Search sits worldwide by location, dates and pet type. Save the ones you like and come back to them later.",
    cta: isOwnerView
      ? { label: "Browse Nomads", to: "/browse-sitters" }
      : { label: "Browse sits", to: "/browse-sits" },
  },
  {
    icon: Send,
    title: isOwnerView ? "Invite a Nomad" : "Apply to a sit",
    body: isOwnerView
      ? "Matching works both ways: Nomads apply to your listing, and you can invite anyone directly from their profile."
      : "Matching works both ways: apply to sits that fit your plans, and Pet Parents can invite you directly to theirs.",
    cta: isOwnerView
      ? { label: "See applications", to: "/applications" }
      : { label: "See my applications", to: "/applications" },
  },
  {
    icon: MessageCircle,
    title: "Chat before you commit",
    body: "Every match opens a private chat. Ask about pets, routines and the home — the exact address is only shared once a sit is confirmed.",
    cta: { label: "Open inbox", to: "/inbox" },
  },
  {
    icon: Star,
    title: "Reviews after the sit",
    body: "When a sit is completed, both sides rate each other across categories like pet care, communication and reliability. You have 14 days to leave a review.",
  },
  {
    icon: SettingsIcon,
    title: "Settings & visibility",
    body: "Switch between Nomad and Pet Parent modes, verify your ID, manage notifications, or pause your profile at any time from Settings.",
    cta: { label: "Open settings", to: "/settings" },
  },
];

const GuidedWalkthrough = () => {
  const { user, onboardingCompleted } = useAuth();
  const { activeRole } = useActiveRole();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  // Auto-open once for first-time users who finished onboarding
  useEffect(() => {
    if (!user || !onboardingCompleted) return;
    if (localStorage.getItem(WALKTHROUGH_STORAGE_KEY) === "true") return;
    setIndex(0);
    setOpen(true);
  }, [user, onboardingCompleted]);

  useEffect(() => {
    const handler = () => {
      setIndex(0);
      setOpen(true);
    };
    window.addEventListener(WALKTHROUGH_EVENT, handler);
    return () => window.removeEventListener(WALKTHROUGH_EVENT, handler);
  }, []);

  const finish = () => {
    localStorage.setItem(WALKTHROUGH_STORAGE_KEY, "true");
    setOpen(false);
  };

  if (!open || !user) return null;

  const steps = buildSteps(activeRole === "owner");
  const step = steps[index];
  const Icon = step.icon;
  const isLast = index === steps.length - 1;

  return (
    <div
      className="fixed inset-0 z-[9997] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="walkthrough-title"
    >
      <div className="relative w-full max-w-md rounded-t-2xl bg-card p-6 shadow-xl sm:rounded-2xl">
        <button
          type="button"
          onClick={finish}
          aria-label="Skip walkthrough"
          className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>

        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Step {index + 1} of {steps.length}
        </p>
        <h2 id="walkthrough-title" className="mb-2 font-display text-xl">
          {step.title}
        </h2>
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">{step.body}</p>

        <div className="mb-5 flex gap-1.5" aria-hidden="true">
          {steps.map((_, i) => (
            <span
              key={i}
              className={
                "h-1.5 flex-1 rounded-full transition-colors " +
                (i <= index ? "bg-primary" : "bg-muted")
              }
            />
          ))}
        </div>

        <div className="flex items-center gap-3">
          {index > 0 && (
            <Button variant="ghost" onClick={() => setIndex(index - 1)}>
              Back
            </Button>
          )}
          {step.cta && (
            <Button
              variant="outline"
              onClick={() => {
                finish();
                navigate(step.cta!.to);
              }}
            >
              {step.cta.label}
            </Button>
          )}
          <Button
            className="ml-auto"
            onClick={() => (isLast ? finish() : setIndex(index + 1))}
          >
            {isLast ? "Got it" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default GuidedWalkthrough;
