import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useGlobalShortcut } from "./useGlobalShortcut";

/**
 * NOTE: issue #43 — useGlobalShortcut is intentionally an empty no-op while
 * Phase 10 (Semantic Search) is shelved. These tests characterize the CURRENT
 * behavior: the hook renders without error, returns nothing, and registers no
 * keyboard / IPC listeners. They are a tripwire so the eventual implementation
 * is added deliberately rather than by accident.
 */
describe("useGlobalShortcut (issue #43 — no-op placeholder)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders without throwing", () => {
    expect(() => renderHook(() => useGlobalShortcut())).not.toThrow();
  });

  it("returns undefined (void)", () => {
    const { result } = renderHook(() => useGlobalShortcut());
    expect(result.current).toBeUndefined();
  });

  it("registers no window keydown/keyup listeners (issue #43)", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    renderHook(() => useGlobalShortcut());

    const keyboardRegistrations = addSpy.mock.calls.filter(
      ([type]) => type === "keydown" || type === "keyup" || type === "keypress",
    );
    expect(keyboardRegistrations).toHaveLength(0);
  });

  it("does not touch the Electron IPC bridge (issue #43)", () => {
    const datapilot = { shortcut: { register: vi.fn() } };
    (window as unknown as { datapilot: unknown }).datapilot = datapilot;

    renderHook(() => useGlobalShortcut());

    expect(datapilot.shortcut.register).not.toHaveBeenCalled();
    delete (window as unknown as { datapilot?: unknown }).datapilot;
  });

  it("unmounts cleanly without error", () => {
    const { unmount } = renderHook(() => useGlobalShortcut());
    expect(() => unmount()).not.toThrow();
  });
});
