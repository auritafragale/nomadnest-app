import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SignUpPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Overrides the default title. */
  title?: string;
  /** Overrides the default dialog body copy. */
  message?: string;
  /** Show a heart above the title (the "Save sits you love" prompt). */
  heart?: boolean;
}

/** Asks a signed-out visitor to create a free account (or log in). */
const SignUpPromptDialog = ({
  open,
  onOpenChange,
  title = "Join NomadNest",
  message = "Create a free account to view full profiles",
  heart = false,
}: SignUpPromptDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-[24px] text-center sm:max-w-sm">
        <DialogHeader className="items-center text-center sm:text-center">
          {heart && (
            <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-brand-coral-light text-brand-coral-text">
              <Heart className="h-6 w-6" aria-hidden="true" />
            </span>
          )}
          <DialogTitle className="font-display text-[26px] font-normal">{title}</DialogTitle>
          <DialogDescription className="text-[15px]">{message}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Link
            to="/auth?signup=true"
            className="flex h-[52px] items-center justify-center rounded-2xl bg-primary text-[15px] font-bold text-primary-foreground"
          >
            Create free account
          </Link>
          <Link to="/auth" className="flex h-[52px] items-center justify-center rounded-2xl border-[1.5px] border-border text-[15px] font-bold">
            Log in
          </Link>
          <button type="button" onClick={() => onOpenChange(false)} className="flex h-11 items-center justify-center text-[15px] font-semibold text-muted-foreground">
            Not now
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SignUpPromptDialog;
