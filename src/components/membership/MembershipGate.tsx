import { useNavigate } from "react-router-dom";
import { Crown, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface MembershipGateProps {
  type: "sitter" | "owner";
  children: React.ReactNode;
  hasAccess: boolean;
}

const MembershipGate = ({ type, children, hasAccess }: MembershipGateProps) => {
  const navigate = useNavigate();

  if (hasAccess) return <>{children}</>;

  const label = type === "sitter" ? "Nomad" : "Pet Parent";

  return (
    <Card className="border-2 border-dashed border-muted-foreground/30">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <Lock className="w-10 h-10 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">
          {label} Membership Required
        </h3>
        <p className="text-muted-foreground mb-6 max-w-sm">
          You need an active {label} or Combined membership to access this feature.
        </p>
        <Button onClick={() => navigate("/membership")}>
          <Crown className="w-4 h-4 mr-2" />
          View Membership Plans
        </Button>
      </CardContent>
    </Card>
  );
};

export default MembershipGate;
