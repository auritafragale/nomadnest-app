import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { clearAllGuideCaches } from "@/lib/guideCache";
import { browserLanguage } from "@/lib/dailyUpdate";
import { markIntentionalSignOut, resetSignInEnded } from "@/lib/signInEnded";

type AppRole = "sitter" | "owner" | "both" | null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: AppRole;
  roleLoading: boolean;
  onboardingCompleted: boolean;
  signUp: (email: string, password: string, firstName?: string, lastName?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);

  const fetchUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role, onboarding_completed")
        .eq("user_id", userId)
        .maybeSingle();

      if (data && !error) {
        setRole(data.role as AppRole);
        setOnboardingCompleted(data.onboarding_completed ?? false);
      } else {
        setRole(null);
        setOnboardingCompleted(false);
      }
    } finally {
      setRoleLoading(false);
    }
  };

  const refreshRole = async () => {
    if (user) {
      await fetchUserRole(user.id);
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN") resetSignInEnded();
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer role fetching with setTimeout to avoid deadlock
        if (session?.user) {
          setRoleLoading(true);
          setTimeout(() => {
            fetchUserRole(session.user.id);
          }, 0);
        } else {
          setRole(null);
          setOnboardingCompleted(false);
          setRoleLoading(false);
        }
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setRoleLoading(true);
        fetchUserRole(session.user.id);
      } else {
        setRoleLoading(false);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // First sign-in on this device: fill preferred_language from the browser if
  // it's still empty (never overwrites a choice made in Settings).
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const key = `nn_lang_autofill_${userId}`;
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      /* storage unavailable: try anyway, the server keeps it idempotent */
    }
    const markDone = () => {
      try {
        localStorage.setItem(key, "1");
      } catch {
        /* ignore */
      }
    };
    const language = browserLanguage();
    if (!language) {
      markDone();
      return;
    }
    supabase
      .rpc("set_my_preferred_language", { p_language: language, p_only_if_empty: true })
      .then(({ error }) => {
        if (!error) markDone();
      });
  }, [userId]);


  // The member's time zone (IANA name, e.g. "Europe/Lisbon"), so a daily
  // message email arrives in their morning. Saved once per device and
  // whenever it changes.
  useEffect(() => {
    if (!userId) return;
    let tz = "";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch {
      return;
    }
    if (!tz) return;
    const key = `nn_tz_${userId}`;
    try {
      if (localStorage.getItem(key) === tz) return;
    } catch {
      /* storage unavailable: save anyway */
    }
    supabase.rpc("set_my_timezone", { p_timezone: tz }).then(({ error }) => {
      if (error) return;
      try {
        localStorage.setItem(key, tz);
      } catch {
        /* ignore */
      }
    });
  }, [userId]);

  const signUp = async (email: string, password: string, firstName?: string, lastName?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          first_name: firstName,
          last_name: lastName,
        },
      },
    });
    
    return { error: error ? new Error(error.message) : null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    return { error: error ? new Error(error.message) : null };
  };

  const signOut = async () => {
    // Clean up the push subscription for this device before the session is
    // cleared — the DELETE needs a valid session to satisfy the RLS policy.
    // navigator.serviceWorker.ready never resolves when no worker is registered,
    // so this is time-boxed: sign out must never hang on it.
    if (user && "serviceWorker" in navigator) {
      try {
        const registration = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
        ]);
        const pushSub = await registration?.pushManager.getSubscription();
        if (pushSub) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('user_id', user.id)
            .eq('endpoint', pushSub.endpoint);
          await pushSub.unsubscribe();
        }
      } catch (err) {
        console.error('Error cleaning up push subscription on sign out:', err);
      }
    }
    markIntentionalSignOut();
    await supabase.auth.signOut();
    clearAllGuideCaches();
    setRole(null);
    setOnboardingCompleted(false);
  };


  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        role,
        roleLoading,
        onboardingCompleted,
        signUp,
        signIn,
        signOut,
        refreshRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
