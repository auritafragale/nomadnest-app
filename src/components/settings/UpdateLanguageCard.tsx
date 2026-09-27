import { Languages } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UPDATE_LANGUAGES } from "@/lib/dailyUpdate";
import { useMyPreferredLanguage, useSetPreferredLanguage } from "@/hooks/useDailyUpdates";

const NONE = "none";

/** The language sitters' daily updates are shown in (translated when needed). */
export const UpdateLanguageCard = () => {
  const { data: language, isLoading } = useMyPreferredLanguage();
  const setLanguage = useSetPreferredLanguage();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="h-5 w-5" />
          Language
        </CardTitle>
        <CardDescription>
          Daily updates from your sitters are shown in this language. You can always see the original.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Select
          value={language ?? NONE}
          disabled={isLoading || setLanguage.isPending}
          onValueChange={(value) =>
            setLanguage.mutate(value === NONE ? null : value, {
              onSuccess: () => toast.success("Language saved"),
              onError: (err) => toast.error(err.message || "Couldn't save your language."),
            })
          }
        >
          <SelectTrigger className="w-full sm:w-64" aria-label="Language for updates from sitters">
            <SelectValue placeholder="Choose a language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Don't translate</SelectItem>
            {UPDATE_LANGUAGES.map((l) => (
              <SelectItem key={l.code} value={l.code}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
};
