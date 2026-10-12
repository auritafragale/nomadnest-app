import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/layout/Navbar";
import AdminNav from "@/components/admin/AdminNav";
import { Skeleton } from "@/components/ui/skeleton";
import { nnButton } from "@/components/nn/ui";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Level = "banned" | "swear";

const LEVELS: { id: Level; label: string; help: string }[] = [
  { id: "banned", label: "Banned", help: "Never allowed anywhere, private chats included: slurs, sexual words, threats." },
  { id: "swear", label: "Swearing", help: "Not allowed in reviews, replies, profiles, listings, Sit Stories or City Chats. Allowed in a private chat, with a note only the sender sees." },
];

/**
 * Founder admin: the word filter list (blocked_terms). Members can't read
 * it. Words match whole words (with common endings), so "class" never
 * matches "ass". Phrases match as written.
 */
const AdminWords = () => {
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");
  const [level, setLevel] = useState<Level>("swear");
  const [show, setShow] = useState<Level>("banned");

  const { data: terms = [], isLoading } = useQuery({
    queryKey: ["admin-blocked-terms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("blocked_terms").select("term, level, created_at").order("term");
      if (error) throw error;
      return data as { term: string; level: Level; created_at: string }[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("blocked_terms").insert({ term: term.trim(), level } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setTerm("");
      toast.success("Added.");
      void queryClient.invalidateQueries({ queryKey: ["admin-blocked-terms"] });
    },
    onError: (e: { code?: string; message?: string }) =>
      toast.error(e?.code === "23505" ? "That word is already on the list." : e?.message || "Couldn't add it. Please try again."),
  });

  const remove = useMutation({
    mutationFn: async (t: string) => {
      const { error } = await supabase.from("blocked_terms").delete().eq("term", t);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed.");
      void queryClient.invalidateQueries({ queryKey: ["admin-blocked-terms"] });
    },
    onError: () => toast.error("Couldn't remove it. Please try again."),
  });

  const shown = terms.filter((t) => t.level === show);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-3xl px-4 pb-8 pt-20">
        <AdminNav />
        <h1 className="font-display text-[30px] font-normal">Word filter</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">
          Checked automatically when members save text. Nobody reads messages for it, and nothing about the text is logged.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (term.trim()) add.mutate();
          }}
          className="mt-5 flex flex-col gap-3 rounded-[20px] border border-border bg-card p-4"
        >
          <label htmlFor="new-term" className="text-[15px] font-bold">
            Add a word or phrase
          </label>
          <input
            id="new-term"
            value={term}
            onChange={(e) => setTerm(e.target.value.slice(0, 80))}
            className="min-h-11 rounded-xl border-[1.5px] border-border bg-background px-3 text-[16px] outline-none focus:border-primary"
            autoComplete="off"
          />
          <div role="radiogroup" aria-label="Level" className="grid gap-2 sm:grid-cols-2">
            {LEVELS.map((l) => (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={level === l.id}
                onClick={() => setLevel(l.id)}
                className={cn(
                  "flex min-h-11 flex-col items-start gap-0.5 rounded-xl px-3 py-2 text-left",
                  level === l.id ? "border-2 border-foreground bg-muted" : "border-[1.5px] border-border",
                )}
              >
                <span className="text-[15px] font-bold">{l.label}</span>
                <span className="text-sm text-muted-foreground">{l.help}</span>
              </button>
            ))}
          </div>
          <button type="submit" disabled={!term.trim() || add.isPending} className={nnButton("primary", "self-start")}>
            {add.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Add
          </button>
        </form>

        <div role="tablist" aria-label="List" className="mt-6 grid grid-cols-2 rounded-full bg-muted p-1">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="tab"
              aria-selected={show === l.id}
              onClick={() => setShow(l.id)}
              className={cn("h-11 rounded-full text-sm font-bold", show === l.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
            >
              {l.label} ({terms.filter((t) => t.level === l.id).length})
            </button>
          ))}
        </div>

        {isLoading ? (
          <Skeleton className="mt-4 h-40 rounded-[20px]" />
        ) : shown.length === 0 ? (
          <p className="mt-4 rounded-[20px] bg-muted p-4 text-sm text-muted-foreground">Nothing on this list.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-[20px] border border-border bg-card">
            {shown.map((t) => (
              <li key={t.term} className="flex items-center justify-between gap-3 px-4 py-1.5">
                <span className="min-w-0 break-words text-[15px]">{t.term}</span>
                <button
                  type="button"
                  onClick={() => remove.mutate(t.term)}
                  disabled={remove.isPending}
                  aria-label={`Remove ${t.term}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default AdminWords;
