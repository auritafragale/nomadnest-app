import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Single source of truth for admin status.
 * `is_admin` is not readable from the client, so this goes through the
 * secure `is_admin_user` database function.
 */
export const useIsAdmin = () => {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsAdmin(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("is_admin_user", { _user_id: user.id });
      if (!cancelled) setIsAdmin(data === true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  return { isAdmin, loading: authLoading || isAdmin === null, user };
};
