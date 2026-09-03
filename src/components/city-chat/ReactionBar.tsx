import { SmilePlus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { REACTION_EMOJIS, type MessageReactionSummary } from "@/hooks/useMessageReactions";

interface ReactionBarProps {
  reactions: MessageReactionSummary[];
  onToggle: (emoji: string) => void;
  align?: "start" | "end";
}

const ReactionBar = ({ reactions, onToggle, align = "start" }: ReactionBarProps) => {
  const total = reactions.reduce((sum, r) => sum + r.count, 0);
  const mine = reactions.some((r) => r.mine);

  return (
    <div
      className={cn(
        "flex items-center gap-1 mt-1",
        align === "end" ? "justify-end" : "justify-start",
      )}
    >
      {total > 0 && (
        <button
          type="button"
          onClick={() => {
            const own = reactions.find((r) => r.mine);
            onToggle(own ? own.emoji : reactions[0].emoji);
          }}
          className={cn(
            "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
            mine
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background text-muted-foreground hover:bg-muted",
          )}
          aria-label={mine ? "Remove your reaction" : "React to this message"}
        >
          <span>{reactions.map((r) => r.emoji).join("")}</span>
          <span>{total}</span>
        </button>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Add a reaction"
          >
            <SmilePlus className="w-3.5 h-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-1.5" align={align}>
          <div className="flex gap-1">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onToggle(emoji)}
                className="rounded-full p-1.5 text-lg hover:bg-muted transition-colors"
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
};

export default ReactionBar;
