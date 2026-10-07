import { SmilePlus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { REACTION_EMOJIS, type MessageReactionSummary } from "@/hooks/useMessageReactions";

interface ReactionBarProps {
  reactions: MessageReactionSummary[];
  onToggle: (emoji: string) => void;
  align?: "start" | "end";
}

/** Reaction pills (one per emoji used, heart-pill style) and the add-a-reaction picker. */
const ReactionBar = ({ reactions, onToggle, align = "start" }: ReactionBarProps) => (
  <div className={cn("flex flex-wrap items-center gap-1.5", align === "end" ? "justify-end" : "justify-start")}>
    {reactions
      .filter((r) => r.count > 0)
      .map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => onToggle(r.emoji)}
          aria-pressed={r.mine}
          aria-label={`${r.mine ? "Remove your" : "Add a"} ${r.emoji} reaction, ${r.count}`}
          className={cn(
            "inline-flex h-11 items-center gap-1 rounded-full border px-3.5 text-sm font-semibold",
            r.mine
              ? "border-[var(--nn-accent)] bg-[var(--nn-tint)] text-[var(--nn-accent-dark)]"
              : "border-[var(--nn-border)] bg-card text-muted-foreground",
          )}
        >
          <span aria-hidden="true">{r.emoji}</span>
          {r.count}
        </button>
      ))}
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-[var(--nn-soft)] hover:text-foreground"
          aria-label="Add a reaction"
        >
          <SmilePlus className="h-[18px] w-[18px]" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto rounded-full p-1.5" align={align}>
        <div className="flex gap-1">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onToggle(emoji)}
              className="flex h-11 w-11 items-center justify-center rounded-full text-xl hover:bg-[var(--nn-soft)]"
              aria-label={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  </div>
);

export default ReactionBar;
