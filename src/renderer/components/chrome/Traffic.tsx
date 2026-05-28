import { useEffect, useState, type JSX } from "react";

/**
 * Painted clones of macOS traffic-light dots, rendered on Windows / Linux
 * where there is no native control. On macOS, `titleBarStyle: 'hidden'`
 * positions the real OS buttons, so we render a spacer instead.
 *
 * Platform detection runs once on mount via the preload IPC bridge; before
 * the answer arrives we render the spacer (matches macOS — the most common
 * dev platform — and is invisible on the others until the swap).
 */
export function Traffic(): JSX.Element {
  const [platform, setPlatform] = useState<NodeJS.Platform | "unknown">(
    "unknown",
  );

  useEffect(() => {
    // Guard explicitly: `a?.b?.c?.()` returns `undefined` (not a promise) when
    // any link in the chain is missing — `.then()` on that would throw a
    // TypeError. Bail out cleanly when the preload bridge isn't installed
    // (browser dev viewport, tests, DesignSystem-only renders).
    const platformFn = window.datapilot?.app?.platform;
    if (typeof platformFn !== "function") {
      setPlatform("unknown");
      return;
    }
    void platformFn()
      .then((p) => setPlatform(p))
      .catch(() => setPlatform("unknown"));
  }, []);

  // If we are in a web browser (e.g., standard Chrome/Safari dev viewport),
  // window.datapilot is undefined. We show simulated traffic lights so they
  // can be inspected and styled on macOS.
  const isBrowser = typeof window === "undefined" || !window.datapilot;

  // On macOS in Electron, the OS draws the native buttons — render a spacer.
  if (platform === "darwin" || (platform === "unknown" && !isBrowser)) {
    return <div style={{ width: 76, height: 16 }} aria-hidden />;
  }

  return (
    <div className="traffic" role="group" aria-label="Window controls">
      <span className="dot red" />
      <span className="dot yellow" />
      <span className="dot green" />
    </div>
  );
}
