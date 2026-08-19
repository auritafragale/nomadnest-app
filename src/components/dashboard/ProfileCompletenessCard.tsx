import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  CheckCircle2, 
  Circle, 
  User, 
  Image, 
  MapPin, 
  FileText, 
  Briefcase,
  Dog,
  ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProfileField {
  key: string;
  label: string;
  icon: React.ElementType;
  completed: boolean;
}

interface ProfileCompletenessCardProps {
  role: "sitter" | "owner";
  profile: {
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    city: string | null;
    country: string | null;
  } | null;
  sitterProfile?: {
    headline: string | null;
    bio: string | null;
    pet_types: string[] | null;
  } | null;
  ownerProfile?: {
    bio: string | null;
  } | null;
}

export const ProfileCompletenessCard = ({
  role,
  profile,
  sitterProfile,
  ownerProfile,
}: ProfileCompletenessCardProps) => {
  const fields: ProfileField[] = role === "sitter" 
    ? [
        { key: "name", label: "Full name", icon: User, completed: !!(profile?.first_name && profile?.last_name) },
        { key: "avatar", label: "Profile photo", icon: Image, completed: !!profile?.avatar_url },
        { key: "location", label: "Location", icon: MapPin, completed: !!(profile?.city && profile?.country) },
        { key: "headline", label: "Headline", icon: Briefcase, completed: !!sitterProfile?.headline },
        { key: "bio", label: "About me", icon: FileText, completed: !!sitterProfile?.bio },
        { key: "pet_types", label: "Pet experience", icon: Dog, completed: !!(sitterProfile?.pet_types && sitterProfile.pet_types.length > 0) },
      ]
    : [
        { key: "name", label: "Full name", icon: User, completed: !!(profile?.first_name && profile?.last_name) },
        { key: "avatar", label: "Profile photo", icon: Image, completed: !!profile?.avatar_url },
        { key: "location", label: "Location", icon: MapPin, completed: !!(profile?.city && profile?.country) },
        { key: "bio", label: "About me", icon: FileText, completed: !!ownerProfile?.bio },
      ];

  const completedCount = fields.filter(f => f.completed).length;
  const totalCount = fields.length;
  const percentage = Math.round((completedCount / totalCount) * 100);
  const isComplete = percentage === 100;

  const incompleteFields = fields.filter(f => !f.completed);
  const editLink = role === "sitter" ? "/edit-sitter-profile" : "/edit-owner-profile";

  if (isComplete) {
    return null; // Don't show if profile is complete
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span>Complete your profile</span>
          <span className="flex items-center gap-1.5">
            <HelpTooltip
              label="Why complete your profile"
              content="A fuller profile builds trust and helps you get more matches. Families are more likely to accept nomads and invites from complete profiles."
            />
            <span className="text-sm font-normal text-muted-foreground">
              {completedCount}/{totalCount}
            </span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={percentage} className="h-2" />
        
        <div className="space-y-2">
          {fields.map((field) => {
            const Icon = field.icon;
            return (
              <div
                key={field.key}
                className={cn(
                  "flex items-center gap-3 text-sm py-1",
                  field.completed ? "text-muted-foreground" : "text-foreground"
                )}
              >
                {field.completed ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <Icon className="w-4 h-4 shrink-0" />
                <span className={cn(field.completed && "line-through")}>{field.label}</span>
              </div>
            );
          })}
        </div>

        {incompleteFields.length > 0 && (
          <Link to={editLink}>
            <Button size="sm" className="w-full">
              Complete Profile
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
};
