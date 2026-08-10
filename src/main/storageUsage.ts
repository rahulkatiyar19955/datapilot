/**
 * Bounded, allow-listed filesystem usage walker (issue #37).
 *
 * The previous `storage:usage` handler resolved any renderer-supplied path and
 * walked it with synchronous `fs` calls. That allowed (a) probing the existence
 * and size of arbitrary host paths and (b) freezing the Electron main thread on
 * a huge or pathological tree. This module:
 *
 *   - constrains the (canonicalized) target to an allow-list of roots,
 *   - walks asynchronously via `fs.promises` so the event loop stays responsive,
 *   - bounds the walk by directory depth and total entries, reporting
 *     `truncated: true` when a cap is hit.
 */
import { promises as fsp } from "fs";
import path from "path";
import { IpcValidationError, isPathWithinRoot } from "./ipcValidation";

export interface UsageOptions {
  /** Canonicalized roots the target must live within. */
  allowedRoots: readonly string[];
  /** Maximum directory depth to descend (root is depth 0). */
  maxDepth: number;
  /** Maximum number of filesystem entries to visit before bailing out. */
  maxEntries: number;
}

export interface BoundedUsage {
  exists: boolean;
  totalBytes: number;
  fileCount: number;
  /** True if a depth or entry cap stopped the walk before completion. */
  truncated: boolean;
}

function withinAllowed(p: string, roots: readonly string[]): boolean {
  return roots.some((root) => isPathWithinRoot(p, root, path.sep));
}

export async function getPathUsageBounded(
  targetPath: string,
  opts: UsageOptions,
): Promise<BoundedUsage> {
  const { allowedRoots, maxDepth, maxEntries } = opts;

  if (!targetPath || !withinAllowed(targetPath, allowedRoots)) {
    throw new IpcValidationError("path is outside the allowed directories");
  }

  // Resolve symlinks and re-check that the real path stays in-bounds, so a
  // symlink inside an allowed root cannot point the walk out of it. The roots
  // are canonicalized too (best-effort) so a symlinked root — e.g. macOS's
  // /var → /private/var — still matches the realpath'd target.
  let canonical: string;
  try {
    canonical = await fsp.realpath(targetPath);
  } catch {
    return { exists: false, totalBytes: 0, fileCount: 0, truncated: false };
  }
  const canonicalRoots = await Promise.all(
    allowedRoots.map(async (root) => {
      try {
        return await fsp.realpath(root);
      } catch {
        return root;
      }
    }),
  );
  if (!withinAllowed(canonical, canonicalRoots)) {
    throw new IpcValidationError("path is outside the allowed directories");
  }

  const acc = {
    totalBytes: 0,
    fileCount: 0,
    entries: 0,
    truncated: false,
    hardStop: false,
  };

  const walk = async (current: string, depth: number): Promise<void> => {
    if (acc.hardStop) return;
    if (acc.entries >= maxEntries) {
      acc.truncated = true;
      acc.hardStop = true;
      return;
    }
    acc.entries += 1;

    let stats;
    try {
      stats = await fsp.lstat(current);
    } catch {
      return;
    }

    if (stats.isSymbolicLink()) return; // never follow symlinks
    if (stats.isFile()) {
      acc.totalBytes += stats.size;
      acc.fileCount += 1;
      return;
    }
    if (!stats.isDirectory()) return;

    if (depth >= maxDepth) {
      // Too deep to list — flag truncation but keep scanning siblings.
      acc.truncated = true;
      return;
    }

    let entries: string[];
    try {
      entries = await fsp.readdir(current);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (acc.hardStop) break;
      await walk(path.join(current, entry), depth + 1);
    }
  };

  await walk(canonical, 0);

  return {
    exists: true,
    totalBytes: acc.totalBytes,
    fileCount: acc.fileCount,
    truncated: acc.truncated,
  };
}
