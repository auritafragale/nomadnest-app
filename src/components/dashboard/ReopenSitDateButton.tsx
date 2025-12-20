import { Button } from "@/components/ui/button";
import { RotateCcw, Loader2 } from "lucide-react";
import { useReopenSitDate } from "@/hooks/useReopenSitDate";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ReopenSitDateButtonProps {
  sitDateId: string;
  startDate: string;
  endDate: string;
}

export const ReopenSitDateButton = ({ sitDateId, startDate, endDate }: ReopenSitDateButtonProps) => {
  const { mutate: reopenSitDate, isPending } = useReopenSitDate();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={isPending}>
          {isPending ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <RotateCcw className="w-3 h-3 mr-1" />
          )}
          Reopen
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reopen these dates?</AlertDialogTitle>
          <AlertDialogDescription>
            This will make the sit dates ({startDate} - {endDate}) available for new applications again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => reopenSitDate(sitDateId)}>
            Reopen Dates
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
