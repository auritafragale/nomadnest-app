import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { CheckinMessage } from "@/hooks/useSitCheckins";
import { useUpdatePhotoUrls } from "@/hooks/useDailyUpdates";
import { UpdateChips } from "./UpdatesTimeline";

/** The update row: its sit (for the link) and, for owners, the stored translation. */
const useUpdateRow = (checkinId: string | undefined) =>
  useQuery({
    queryKey: ["sit-checkin-translation", checkinId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sit_checkins")
        .select("sit_id, translated_message, translated_flag_note, translated_lang")
        .eq("id", checkinId!)
        .maybeSingle();
      return data;
    },
    enabled: !!checkinId,
    staleTime: 5 * 60 * 1000,
  });

/** Today's update as a compact card in the sit's chat. */
export const ChatUpdateCard = ({
  update,
  sitId,
  isOwn,
  viewerIsOwner,
  time,
  senderName,
}: {
  update: CheckinMessage;
  sitId: string | null;
  isOwn: boolean;
  viewerIsOwner: boolean;
  time: string;
  senderName: string;
}) => {
  const paths = update.photos ?? [];
  const { data: urls = {} } = useUpdatePhotoUrls(paths);
  const { data: row } = useUpdateRow(update.checkin_id);
  const translation = viewerIsOwner && row?.translated_lang ? row : null;
  const message = translation?.translated_message ?? update.note;
  const flagNote = translation?.translated_flag_note ?? update.flag_note;
  const link = sitId ?? row?.sit_id ?? null;
  const shown = paths.map((p) => urls[p]).filter((u): u is string => !!u);

  return (
    <div className={cn("w-full max-w-[85%] overflow-hidden rounded-2xl border bg-card shadow-sm sm:max-w-sm", isOwn ? "border-primary/30" : "border-border")}>
      {shown.length > 0 && (
        <div className={cn("grid gap-0.5", shown.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
          {shown.slice(0, 4).map((url) => (
            <img key={url} src={url} alt="" loading="lazy" className={cn("w-full object-cover", shown.length === 1 ? "max-h-64" : "aspect-square")} />
          ))}
        </div>
      )}
      <div className="space-y-2 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          {isOwn ? "Your daily update" : `Daily update from ${senderName}`}
        </p>
        {update.flagged && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-sm">
            <p className="font-medium text-amber-900 dark:text-amber-200">A note from {isOwn ? "you" : senderName}</p>
            {flagNote && <p className="mt-0.5 whitespace-pre-line">{flagNote}</p>}
          </div>
        )}
        <UpdateChips chips={update.chips ?? []} />
        {message && <p className="whitespace-pre-line text-sm">{message}</p>}
        <div className="flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
          <span>{time}</span>
          {link && (
            <Link to={`/sits/${link}`} className="inline-flex items-center gap-0.5 font-medium text-foreground hover:underline">
              See all updates
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};
