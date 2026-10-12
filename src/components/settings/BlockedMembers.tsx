import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { nnButton } from "@/components/nn/ui";
import { useMyBlockedMembers, useUnblockMember } from "@/hooks/useBlocks";
import { GroupTitle } from "./SettingsParts";

const HOW = [
  "You can’t message each other, and they can’t apply to your home or invite you.",
  "You won’t see each other in Browse, Nomads Near Me or City Chats.",
  "They are not told. Old messages stay, but the chat is closed.",
  "A sit happening now keeps its chat open until it ends. A confirmed sit that hasn’t started is cancelled, and the other person is told it was cancelled.",
];

/** Settings, Privacy: Blocked members and how blocking works (design: BlockPhone, BlockTablet). */
const BlockedMembers = () => {
  const { data: blocked = [], isLoading } = useMyBlockedMembers();
  const unblock = useUnblockMember();

  return (
    <section aria-labelledby="blocked-title" className="flex flex-col gap-3">
      <GroupTitle>
        <span id="blocked-title">Blocked members</span>
      </GroupTitle>
      <p className="-mt-1 text-sm text-muted-foreground">People you block can’t contact you or see you on NomadNest.</p>
      {isLoading ? (
        <Skeleton className="h-16 rounded-[18px]" />
      ) : blocked.length === 0 ? (
        <p className="rounded-[18px] bg-muted p-4 text-[15px] text-muted-foreground">You haven’t blocked anyone.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--nn-line)] rounded-[18px] border border-[var(--nn-border)] bg-card">
          {blocked.map((b) => (
            <li key={b.blocked_id} className="flex items-center gap-3 p-3">
              <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[17px] font-bold">
                {b.avatar_url ? <img src={b.avatar_url} alt="" className="h-full w-full object-cover" /> : b.first_name.charAt(0)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[16px] font-bold">{b.first_name}</span>
                <span className="text-sm text-muted-foreground">
                  Blocked {new Date(b.blocked_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </span>
              <button
                type="button"
                onClick={() =>
                  unblock.mutate(b.blocked_id, {
                    onSuccess: () => toast.success(`${b.first_name} is unblocked.`),
                    onError: () => toast.error("That didn’t work. Please try again."),
                  })
                }
                disabled={unblock.isPending}
                aria-label={`Unblock ${b.first_name}`}
                className={nnButton("secondary", "h-11 rounded-xl px-4")}
              >
                Unblock
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2.5 rounded-[18px] bg-muted p-4">
        <span className="text-[15px] font-bold">How blocking works</span>
        <ul className="flex flex-col gap-2">
          {HOW.map((t) => (
            <li key={t} className="flex gap-2.5 text-sm leading-normal">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {t}
            </li>
          ))}
        </ul>
        <Link to="/contact" className="min-h-11 self-start py-2.5 text-sm font-bold text-[var(--nn-accent-dark)] underline underline-offset-2">
          Feel unsafe? Contact us
        </Link>
      </div>
    </section>
  );
};

export default BlockedMembers;
