import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import blackLogo from "@/assets/Black_Logo.png";
import whiteLogo from "@/assets/White_Logo.png";
import { useTheme } from "@/contexts/ThemeContext";

interface SharedStoryData {
  title: string | null;
  story: string | null;
  story_days: { date: string; text: string }[] | null;
  city: string | null;
  month: string | null;
  owner_first_name: string;
  sitter_name: string | null;
  photos: { url: string; alt: string }[];
}

/**
 * A Sit Story shared by its Pet Parent (/s/:token). Public, not indexed, no
 * analytics or third-party scripts, and nothing that links to anyone's
 * profile: city only, first names only, approved photos only.
 */
const SharedStory = () => {
  const { token } = useParams<{ token: string }>();
  const { theme } = useTheme();
  const [data, setData] = useState<SharedStoryData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "busy">("loading");

  useEffect(() => {
    let cancelled = false;
    supabase.functions
      .invoke("shared-story", { body: { token } })
      .then(({ data: body, error }) => {
        if (cancelled) return;
        const status = (error as { context?: { status?: number } } | null)?.context?.status;
        if (error || !body?.title) {
          setState(status === 429 ? "busy" : "missing");
          return;
        }
        setData(body as SharedStoryData);
        setState("ready");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const people = data ? [data.owner_first_name, data.sitter_name ?? "their NomadNest sitter"].join(" and ") : "";

  return (
    <div data-nn-role="owner" className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>{data?.title ? `${data.title} | A NomadNest Sit Story` : "A NomadNest Sit Story"}</title>
        <meta name="robots" content="noindex, nofollow, noarchive" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>
      <main className="mx-auto flex max-w-xl flex-col gap-5 px-5 pb-16 pt-8">
        <img src={theme === "dark" ? whiteLogo : blackLogo} alt="NomadNest" className="h-14 w-auto self-start" />

        {state === "loading" && <p className="text-sm text-muted-foreground">Loading the story…</p>}
        {state === "missing" && (
          <div className="rounded-[24px] border border-[var(--nn-border)] p-6">
            <h1 className="font-display text-2xl">This story isn't available</h1>
            <p className="mt-1 text-sm text-muted-foreground">The link may have been switched off.</p>
          </div>
        )}
        {state === "busy" && (
          <div className="rounded-[24px] border border-[var(--nn-border)] p-6">
            <h1 className="font-display text-2xl">Too many visits just now</h1>
            <p className="mt-1 text-sm text-muted-foreground">Please try again in a minute.</p>
          </div>
        )}

        {state === "ready" && data && (
          <article className="flex flex-col gap-5">
            {data.photos[0] && (
              <img src={data.photos[0].url} alt={data.photos[0].alt} className="h-[260px] w-full rounded-[24px] object-cover" />
            )}
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-brand-teal-text">
              A NomadNest Sit Story{data.city ? ` · ${data.city}` : ""}
              {data.month ? ` · ${data.month}` : ""}
            </p>
            <h1 className="font-display text-[34px] leading-[1.08]">{data.title}</h1>
            <p className="text-sm text-muted-foreground">{people}</p>
            <div className="flex flex-col gap-4">
              {data.story_days && data.story_days.length > 0
                ? data.story_days.map((d, i) => (
                    <div key={d.date} className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-teal-text">Day {i + 1}</span>
                      <p className="text-[16px] leading-relaxed">{d.text}</p>
                    </div>
                  ))
                : (data.story ?? "")
                    .split(/\n{2,}/)
                    .filter(Boolean)
                    .map((p, i) => (
                      <p key={i} className="text-[16px] leading-relaxed">
                        {p}
                      </p>
                    ))}
            </div>
            {data.photos.length > 1 && (
              <div className="grid grid-cols-2 gap-2">
                {data.photos.slice(1).map((p) => (
                  <img key={p.url} src={p.url} alt={p.alt} className="aspect-square w-full rounded-2xl object-cover" />
                ))}
              </div>
            )}
            <p className="border-t border-[var(--nn-line)] pt-4 text-sm text-muted-foreground">
              NomadNest connects Pet Parents with trusted Nomads who look after their pets and home.{" "}
              <a href="/" className="font-bold text-brand-teal-text">
                Learn more
              </a>
            </p>
          </article>
        )}
      </main>
    </div>
  );
};

export default SharedStory;
