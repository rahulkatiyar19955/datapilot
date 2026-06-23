import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "./useTheme";

const STORAGE_KEY = "datapilot.theme";

/**
 * Characterizes useTheme against current behavior:
 * - default theme is "dark"
 * - reads an existing preference from localStorage on mount
 * - persists to localStorage["datapilot.theme"] on change
 * - mirrors the active theme onto <html data-theme>
 * - best-effort IPC mirror via window.datapilot.theme.set
 *
 * matchMedia is stubbed by src/test/setup.ts to return { matches: false },
 * so prefers-color-scheme: light is never satisfied unless overridden here.
 */
describe("useTheme", () => {
  let originalDatapilot: unknown;

  beforeEach(() => {
    originalDatapilot = (window as unknown as { datapilot?: unknown }).datapilot;
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    // Reset the matchMedia stub to the default "no match" behavior each test.
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    // Remove any IPC bridge a prior test installed.
    delete (window as unknown as { datapilot?: unknown }).datapilot;
  });

  afterEach(() => {
    (window as unknown as { datapilot?: unknown }).datapilot = originalDatapilot;
    vi.restoreAllMocks();
  });

  it("defaults to dark when no stored preference and OS does not prefer light", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });

  it("reads an existing 'light' preference from localStorage on mount", () => {
    window.localStorage.setItem(STORAGE_KEY, "light");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
  });

  it("reads an existing 'dark' preference from localStorage on mount", () => {
    window.localStorage.setItem(STORAGE_KEY, "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });

  it("ignores a garbage stored value and falls back to the default", () => {
    window.localStorage.setItem(STORAGE_KEY, "neon");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });

  it("respects OS prefers-color-scheme: light when no stored preference", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("light"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
  });

  it("applies data-theme to <html> on mount", () => {
    renderHook(() => useTheme());
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("setTheme updates state, <html> attribute, and localStorage", () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme("light");
    });

    expect(result.current.theme).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("light");
  });

  it("toggle flips dark -> light -> dark", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");

    act(() => {
      result.current.toggle();
    });
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    act(() => {
      result.current.toggle();
    });
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("mirrors the new theme to the Electron IPC bridge when present", () => {
    const set = vi.fn().mockResolvedValue(undefined);
    (window as unknown as { datapilot: unknown }).datapilot = {
      theme: { set },
    };

    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme("light");
    });

    expect(set).toHaveBeenCalledWith("light");
  });

  it("does not throw when the IPC bridge is absent", () => {
    const { result } = renderHook(() => useTheme());
    expect(() => {
      act(() => {
        result.current.setTheme("light");
      });
    }).not.toThrow();
    expect(result.current.theme).toBe("light");
  });
});
