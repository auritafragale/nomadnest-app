import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/Black_Logo.png";

interface SharedStoryData {
  title: string | null;
  story: string | null;
  story_days: { date: string; text: string }[] | null;
  city: string | null;
  month: string | null;
  owner_first_name: string;
  sitter_name: string | null;
  photos: string[];
}

/**
 * A Sit Story shared by its Pet Parent (/s/:token). Public, not indexed, no
 * analytics or third-party scripts, and nothing that links to anyone's
 * profile: city only, first names only, approved photos only.
 */
const SharedStory = () => {
  const { token } = useParams<{ token: string }>();
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
    <div className="min-h-screen bg-white text-[#1F1B16]">
      <Helmet>
        <title>{data?.title ? `${data.title} | A NomadNest Sit Story` : "A NomadNest Sit Story"}</title>
        <meta name="robots" content="noindex, nofollow, noarchive" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>
      <main className="mx-auto flex max-w-xl flex-col gap-5 px-5 pb-16 pt-8">
        <img src={logo} alt="NomadNest" className="h-14 w-auto self-start" />

        {state === "loading" && <p className="text-sm text-[#656B74]">Loading the story…</p>}
        {state === "missing" && (
          <div className="rounded-[24px] border border-[#D3E7E1] p-6">
            <h1 className="font-display text-2xl">This story isn't available</h1>
            <p className="mt-1 text-sm text-[#656B74]">The link may have been switched off.</p>
          </div>
        )}
        {state === "busy" && (
          <div className="rounded-[24px] border border-[#D3E7E1] p-6">
            <h1 className="font-display text-2xl">Too many visits just now</h1>
            <p className="mt-1 text-sm text-[#656B74]">Please try again in a minute.</p>
          </div>
        )}

        {state === "ready" && data && (
          <article className="flex flex-col gap-5">
            {data.photos[0] && (
              <img src={data.photos[0]} alt="" className="h-[260px] w-full rounded-[24px] object-cover" />
            )}
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#1E6B5F]">
              A NomadNest Sit Story{data.city ? ` · ${data.city}` : ""}
              {data.month ? ` · ${data.month}` : ""}
            </p>
            <h1 className="font-display text-[34px] leading-[1.08]">{data.title}</h1>
            <p className="text-sm text-[#656B74]">{people}</p>
            <div className="flex flex-col gap-4">
              {data.story_days && data.story_days.length > 0
                ? data.story_days.map((d, i) => (
                    <div key={d.date} className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#1E6B5F]">Day {i + 1}</span>
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
                {data.photos.slice(1).map((u) => (
                  <img key={u} src={u} alt="" className="aspect-square w-full rounded-2xl object-cover" />
                ))}
              </div>
            )}
            <p className="border-t border-[#E4F0EC] pt-4 text-sm text-[#656B74]">
              NomadNest connects Pet Parents with trusted Nomads who look after their pets and home.{" "}
              <a href="/" className="font-bold text-[#237A6D]">
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
