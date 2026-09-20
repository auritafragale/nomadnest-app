import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface SignUpPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Overrides the default dialog body copy. */
  message?: string;
}

const SignUpPromptDialog = ({
  open,
  onOpenChange,
  message = "Create a free account to view full profiles",
}: SignUpPromptDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm text-center">
        <DialogHeader className="text-center sm:text-center">
          <DialogTitle>Join NomadNest</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          <Button asChild className="w-full sm:w-auto">
            <Link to="/auth">Sign up</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SignUpPromptDialog;
