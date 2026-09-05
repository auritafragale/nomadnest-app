import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
serve((req) => {
  const tok = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const match = (k: string) => {
    const v = Deno.env.get(k) ?? "";
    return { k, len: v.length, matches: v === tok, head: v.slice(0, 10) };
  };
  return new Response(JSON.stringify([
    match("SUPABASE_ANON_KEY"),
    match("SUPABASE_PUBLISHABLE_KEYS"),
    { tokHead: tok.slice(0, 10), tokLen: tok.length },
  ]));
});
