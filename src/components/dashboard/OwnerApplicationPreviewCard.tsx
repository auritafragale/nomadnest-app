import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Calendar, MapPin } from "lucide-react";
import type { Application } from "@/hooks/useApplications";

interface OwnerApplicationPreviewCardProps {
  application: Application;
}

const statusColors: Record<string, string> = {
  applied: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  shortlisted: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  accepted: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  declined: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  withdrawn: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

export const OwnerApplicationPreviewCard = ({ application }: OwnerApplicationPreviewCardProps) => {
  const sitter = application.sitter_user;
  const initials = sitter
    ? `${sitter.first_name?.[0] || ""}${sitter.last_name?.[0] || ""}`
    : "?";

  return (
    <Link 
      to="/applications" 
      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
    >
      <Avatar className="h-10 w-10">
        <AvatarImage src={sitter?.avatar_url || undefined} />
        <AvatarFallback className="bg-primary/10 text-primary text-sm">
          {initials.toUpperCase()}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-foreground truncate">
            {sitter?.first_name} {sitter?.last_name}
          </span>
          <Badge className={`${statusColors[application.status]} text-xs`}>
            {application.status}
          </Badge>
        </div>
        
        <p className="text-xs text-muted-foreground truncate">
          {application.listing?.title}
        </p>
        
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          {application.sit_dates && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(application.sit_dates.start_date), "MMM d")} - {format(new Date(application.sit_dates.end_date), "MMM d")}
            </span>
          )}
          {sitter?.city && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {sitter.city}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
};
