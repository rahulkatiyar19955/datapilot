import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "datapilot.theme";
const DEFAULT_THEME: Theme = "dark";

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // localStorage can throw in private-mode / sandboxed contexts. Fall through.
  }
  // Respect OS preference on first run.
  if (window.matchMedia?.("(prefers-color-scheme: light)").matches)
    return "light";
  return DEFAULT_THEME;
}

function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

/**
 * Single source of truth for the active theme.
 * - Reads localStorage on first mount (`datapilot.theme`).
 * - Falls back to `prefers-color-scheme` if no stored preference.
 * - Applies `data-theme` to `<html>` so the OKLCH `[data-theme="light"]`
 *   overrides in globals.css activate without a reload.
 * - Best-effort sync to the Electron main process via `window.datapilot.theme.set`
 *   so future native title-bar styling (macOS vibrancy, Windows accent) can
 *   react. Ignored gracefully if the IPC bridge isn't available (e.g. test
 *   harnesses or the DesignSystem screen pre-Phase-6).
 */
export function useTheme(): {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
} {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  // Apply on mount so first paint is correct.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore quota / sandbox errors
    }
    // IPC mirror — main process persists in settings.json and may update native chrome.
    try {
      void window.datapilot?.theme?.set?.(next);
    } catch {
      // bridge not available (e.g. DesignSystem rendered without preload) — fine
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, setTheme, toggle };
}
