import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Settings } from "./Settings";
import { useUIStore } from "@renderer/stores/ui";

/**
 * issue #43 — the About screen's build string must come from a real build-time
 * constant (__BUILD_DATE__ injected via Vite `define`), NOT from `new Date()`
 * evaluated at render time. We pin a fixed build date and a far-off system
 * clock; the rendered build string must reflect the build date, proving it is
 * not derived from the current date.
 */
const BUILD_DATE = "2099-01-15";

describe("AboutSection build date (issue #43)", () => {
  beforeEach(() => {
    vi.stubGlobal("__BUILD_DATE__", BUILD_DATE);
    // System clock far from the injected build date.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2020-06-30T12:00:00Z"));
    // Land directly on the About section.
    useUIStore.setState({ settingsSectionTarget: "about" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    useUIStore.setState({ settingsSectionTarget: null });
  });

  it("renders the injected build date, not today's date", () => {
    render(<Settings />);
    // Build string should contain the injected date.
    expect(screen.getByText(/2099\.01\.15|2099-01-15/)).toBeInTheDocument();
    // And must NOT contain the (different) system-clock year.
    expect(screen.queryByText(/2020\.06\.30|2020-06-30/)).toBeNull();
  });
});
