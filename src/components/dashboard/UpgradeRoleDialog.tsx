import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Briefcase, Home } from "lucide-react";

interface UpgradeRoleDialogProps {
  currentRole: "sitter" | "owner";
  onUpgrade?: () => void;
}

const UpgradeRoleDialog = ({ currentRole, onUpgrade }: UpgradeRoleDialogProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user, refreshRole } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const newRoleLabel = currentRole === "sitter" ? "Pet Parent" : "Sitter";
  const newRoleIcon = currentRole === "sitter" ? Home : Briefcase;
  const NewRoleIcon = newRoleIcon;

  const handleUpgrade = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Update role to "both"
      const { error: roleError } = await supabase
        .from("user_roles")
        .update({ role: "both" })
        .eq("user_id", user.id);

      if (roleError) throw roleError;

      // Create the missing profile
      if (currentRole === "sitter") {
        // Create owner profile
        await supabase.from("owner_profiles").upsert(
          { user_id: user.id },
          { onConflict: "user_id" }
        );
      } else {
        // Create sitter profile
        await supabase.from("sitter_profiles").upsert(
          { user_id: user.id },
          { onConflict: "user_id" }
        );
      }

      await refreshRole();

      toast({
        title: "Role upgraded!",
        description: `You can now use NomadNest as both a Nomad and Pet Parent.`,
      });

      setOpen(false);
      onUpgrade?.();
    } catch (error: any) {
      console.error("Error upgrading role:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to upgrade your role. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          Also become a {newRoleLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <NewRoleIcon className="w-5 h-5" />
            Become a {newRoleLabel} too
          </DialogTitle>
          <DialogDescription>
            {currentRole === "sitter"
              ? "Add Pet Parent capabilities to your account. You'll be able to create listings for your pets and find nomads when you travel."
              : "Add Sitter capabilities to your account. You'll be able to browse sits and apply to take care of pets while traveling."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <h4 className="font-medium">What you'll get:</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              {currentRole === "sitter" ? (
                <>
                  <li>• Create listings for your home and pets</li>
                  <li>• Receive applications from nomads</li>
                  <li>• Browse and invite nomads</li>
                </>
              ) : (
                <>
                  <li>• Browse available sits worldwide</li>
                  <li>• Apply to sit for pets</li>
                  <li>• Save favorite listings</li>
                </>
              )}
            </ul>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                setOpen(false);
                navigate("/membership?upgrade=both");
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Upgrade to Both
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UpgradeRoleDialog;
