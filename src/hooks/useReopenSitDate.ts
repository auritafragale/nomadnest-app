import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useReopenSitDate = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (sitDateId: string) => {
      const { error } = await supabase
        .from("sit_dates")
        .update({ status: "open" })
        .eq("id", sitDateId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner-listings"] });
      queryClient.invalidateQueries({ queryKey: ["listing"] });
      toast({
        title: "Sit date reopened",
        description: "The sit date is now open for applications again.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error reopening sit date",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};
