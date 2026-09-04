import { CheckCircle, Mail, Phone, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface VerificationBadgesProps {
  idVerified?: boolean | null;
  emailVerified?: boolean | null;
  phoneVerified?: boolean | null;
  backgroundCheck?: boolean | null;
  className?: string;
}

/**
 * Shared verification badge set so Nomad and Pet Parent profiles look identical.
 */
const VerificationBadges = ({
  idVerified,
  emailVerified,
  phoneVerified,
  backgroundCheck,
  className,
}: VerificationBadgesProps) => {
  if (!idVerified && !emailVerified && !phoneVerified && !backgroundCheck) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {idVerified && (
        <Badge variant="outline" className="gap-1 border-green-500 text-green-700 dark:text-green-400 text-[11px] px-1.5 py-0 leading-4">
          <CheckCircle className="w-2.5 h-2.5" />
          ID Verified
        </Badge>
      )}
      {emailVerified && (
        <Badge variant="outline" className="gap-1 border-blue-400 text-blue-600 dark:text-blue-400 text-[11px] px-1.5 py-0 leading-4">
          <Mail className="w-2.5 h-2.5" />
          Email Verified
        </Badge>
      )}
      {phoneVerified && (
        <Badge variant="outline" className="gap-1 border-purple-400 text-purple-600 dark:text-purple-400 text-[11px] px-1.5 py-0 leading-4">
          <Phone className="w-2.5 h-2.5" />
          Phone Verified
        </Badge>
      )}
      {backgroundCheck && (
        <Badge variant="outline" className="gap-1 text-[11px] px-1.5 py-0 leading-4">
          <Shield className="w-2.5 h-2.5" />
          Check
        </Badge>
      )}
    </div>
  );
};

export default VerificationBadges;
