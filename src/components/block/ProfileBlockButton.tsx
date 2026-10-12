import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ban } from "lucide-react";
import BlockMemberSheet from "@/components/block/BlockMemberSheet";

/** "Block {first name}" next to Report on a member's profile (design: BlockPhone). */
const ProfileBlockButton = ({ otherId, otherName }: { otherId: string; otherName: string }) => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 self-start text-[15px] font-semibold text-muted-foreground underline underline-offset-2"
      >
        <Ban className="h-4 w-4" aria-hidden="true" />
        Block {otherName}
      </button>
      <BlockMemberSheet
        otherId={otherId}
        otherName={otherName}
        open={open}
        onOpenChange={setOpen}
        // Their profile is hidden from you now.
        onBlocked={() => navigate("/dashboard")}
      />
    </>
  );
};

export default ProfileBlockButton;
