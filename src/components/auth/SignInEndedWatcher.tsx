import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SIGN_IN_ENDED_EVENT, SIGN_IN_ENDED_MESSAGE, signInEnded } from "@/lib/signInEnded";

/**
 * Shows "Your sign-in has ended" once and sends the member to sign in again,
 * with a link back to the page they were on. Also catches the auth client
 * signing out on its own (a failed token refresh).
 */
const SignInEndedWatcher = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let hadSession = false;
    supabase.auth.getSession().then(({ data }) => {
      hadSession = !!data.session;
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) hadSession = true;
      // The client gave up refreshing the session: not our own Log out.
      if (event === "SIGNED_OUT" && hadSession) signInEnded();
      if (event === "SIGNED_OUT") hadSession = false;
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const onEnded = async () => {
      const back = `${location.pathname}${location.search}`;
      toast(SIGN_IN_ENDED_MESSAGE, { id: "sign-in-ended", duration: 8000 });
      // Clear what's left of the old session on this device only.
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      if (!location.pathname.startsWith("/auth")) {
        navigate(`/auth?return=${encodeURIComponent(back)}`, { replace: true });
      }
    };
    window.addEventListener(SIGN_IN_ENDED_EVENT, onEnded);
    return () => window.removeEventListener(SIGN_IN_ENDED_EVENT, onEnded);
  }, [location.pathname, location.search, navigate]);

  return null;
};

export default SignInEndedWatcher;
