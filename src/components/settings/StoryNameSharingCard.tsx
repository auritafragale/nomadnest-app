import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookHeart } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/** Sitters: whether Pet Parents may put their first name on Sit Story share cards. */
export const StoryNameSharingCard = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: allow, isLoading } = useQuery({
    queryKey: ["my-settings", "share_name_in_stories", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_settings");
      if (error) throw error;
      return ((data as { share_name_in_stories?: boolean } | null)?.share_name_in_stories ?? true) as boolean;
    },
    enabled: !!user,
  });
  const save = useMutation({
    mutationFn: async (value: boolean) => {
      const { error } = await supabase.rpc("set_my_story_name_sharing", { p_allow: value });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-settings", "share_name_in_stories", user?.id] });
      toast.success("Saved");
    },
    onError: (err: Error) => toast.error(err.message || "Couldn't save that."),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookHeart className="h-5 w-5" />
          Sit Stories
        </CardTitle>
        <CardDescription>
          After a sit, Pet Parents get a Sit Story they can turn into an image to share. When this is off, the image
          says "our NomadNest sitter" instead of your name.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium">Allow Pet Parents to share my name in Sit Stories</span>
          <Switch
            checked={allow ?? true}
            disabled={isLoading || save.isPending}
            onCheckedChange={(v) => save.mutate(v)}
            aria-label="Allow Pet Parents to share my name in Sit Stories"
          />
        </label>
      </CardContent>
    </Card>
  );
};
