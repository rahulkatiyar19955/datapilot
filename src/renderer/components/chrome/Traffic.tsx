import { useEffect, useState, type JSX } from 'react'

/**
 * Painted clones of macOS traffic-light dots, rendered on Windows / Linux
 * where there is no native control. On macOS, `titleBarStyle: 'hiddenInset'`
 * positions the real OS buttons, so we render a spacer instead.
 *
 * Platform detection runs once on mount via the preload IPC bridge; before
 * the answer arrives we render the spacer (matches macOS — the most common
 * dev platform — and is invisible on the others until the swap).
 */
export function Traffic(): JSX.Element {
  const [platform, setPlatform] = useState<NodeJS.Platform | 'unknown'>('unknown')

  useEffect(() => {
    void window.datapilot?.app
      ?.platform?.()
      .then((p) => setPlatform(p))
      .catch(() => setPlatform('unknown'))
  }, [])

  // If we are in a web browser (e.g., standard Chrome/Safari dev viewport),
  // window.datapilot is undefined. We show simulated traffic lights so they
  // can be inspected and styled on macOS.
  const isBrowser = typeof window === 'undefined' || !window.datapilot

  // On macOS in Electron, the OS draws the native buttons — render a spacer.
  if (platform === 'darwin' || (platform === 'unknown' && !isBrowser)) {
    return <div style={{ width: 72, height: 12 }} aria-hidden />
  }

  return (
    <div className="traffic" aria-hidden>
      <span className="dot red" />
      <span className="dot yellow" />
      <span className="dot green" />
    </div>
  )
}
