"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { ThemeName } from "@/lib/themes";

interface ThemeContextValue {
  activeTheme: ThemeName;
  setActiveTheme: (theme: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  activeTheme: "default",
  setActiveTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

const STORAGE_KEY = "deadmint-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [activeTheme, setActiveThemeState] = useState<ThemeName>("default");

  // Apply theme class to <html>
  const applyTheme = useCallback((theme: ThemeName) => {
    const el = document.documentElement;
    // Remove existing theme classes
    const existing = Array.from(el.classList).filter((c) =>
      c.startsWith("theme-")
    );
    for (const c of existing) {
      el.classList.remove(c);
    }
    // Apply new theme (skip for default — uses :root values)
    if (theme !== "default") {
      el.classList.add(`theme-${theme}`);
    }
  }, []);

  // Read from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeName | null;
    if (stored) {
      setActiveThemeState(stored);
      applyTheme(stored);
    }
  }, [applyTheme]);

  const setActiveTheme = useCallback(
    (theme: ThemeName) => {
      setActiveThemeState(theme);
      localStorage.setItem(STORAGE_KEY, theme);
      applyTheme(theme);
    },
    [applyTheme]
  );

  return (
    <ThemeContext.Provider value={{ activeTheme, setActiveTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
