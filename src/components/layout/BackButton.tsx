import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Back": to the page the member came from in the app. Opened directly (a
 * link, a notification, a new tab), there is no in-app history, so it goes to
 * the fallback instead. The dashboard's Nomad / Pet Parent mode lives in app
 * state, so going back keeps it.
 */
export const BackButton = ({
  fallback,
  label = "Back",
  className,
}: {
  fallback: string;
  label?: string;
  className?: string;
}) => {
  const navigate = useNavigate();
  const goBack = () => {
    // React Router keeps the position in its history stack in history.state.idx.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  };
  return (
    <Button variant="ghost" onClick={goBack} className={cn("-ml-2", className)}>
      <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
      {label}
    </Button>
  );
};
