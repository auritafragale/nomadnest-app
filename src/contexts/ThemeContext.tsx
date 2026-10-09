import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Theme = "light" | "dark";
/** What the member chose in Settings, Appearance. */
export type ThemePreference = "light" | "dark" | "system";

interface ThemeContextType {
  /** The theme in use right now. */
  theme: Theme;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  preference: "light",
  setPreference: () => {},
  toggleTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

const STORAGE_KEY = "nomadnest-theme";

const readPreference = (): ThemePreference => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "dark" || stored === "system" ? stored : "light";
  } catch {
    return "light";
  }
};

const systemDark = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => !!systemDark());

  // "Match my phone": follow the device as it changes.
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const on = () => setSystemIsDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const theme: Theme = preference === "system" ? (systemIsDark ? "dark" : "light") : preference;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const setPreference = (p: ThemePreference) => {
    setPreferenceState(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      /* ignore */
    }
  };

  const toggleTheme = () => setPreference(theme === "light" ? "dark" : "light");

  return <ThemeContext.Provider value={{ theme, preference, setPreference, toggleTheme }}>{children}</ThemeContext.Provider>;
};
