import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fsp } from "fs";
import os from "os";
import path from "path";
import { IpcValidationError } from "./ipcValidation";
import { getPathUsageBounded } from "./storageUsage";

let root: string;

beforeEach(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), "dp-usage-"));
});

afterEach(async () => {
  await fsp.rm(root, { recursive: true, force: true });
});

describe("getPathUsageBounded (#37)", () => {
  it("rejects a path outside the allow-listed roots", async () => {
    const outside = path.join(os.tmpdir(), "definitely-not-allowed");
    await expect(
      getPathUsageBounded(outside, {
        allowedRoots: [root],
        maxDepth: 10,
        maxEntries: 1000,
      }),
    ).rejects.toBeInstanceOf(IpcValidationError);
  });

  it("reports exists:false for a missing path within an allowed root", async () => {
    const missing = path.join(root, "nope");
    const usage = await getPathUsageBounded(missing, {
      allowedRoots: [root],
      maxDepth: 10,
      maxEntries: 1000,
    });
    expect(usage.exists).toBe(false);
    expect(usage.totalBytes).toBe(0);
    expect(usage.fileCount).toBe(0);
  });

  it("sums bytes and counts files across nested directories", async () => {
    await fsp.writeFile(path.join(root, "a.txt"), "hello"); // 5 bytes
    await fsp.mkdir(path.join(root, "sub"));
    await fsp.writeFile(path.join(root, "sub", "b.txt"), "world!"); // 6 bytes
    const usage = await getPathUsageBounded(root, {
      allowedRoots: [root],
      maxDepth: 10,
      maxEntries: 1000,
    });
    expect(usage.exists).toBe(true);
    expect(usage.fileCount).toBe(2);
    expect(usage.totalBytes).toBe(11);
    expect(usage.truncated).toBe(false);
  });

  it("stops and flags truncated when the entry cap is exceeded", async () => {
    for (let i = 0; i < 20; i++) {
      await fsp.writeFile(path.join(root, `f${i}.txt`), "x");
    }
    const usage = await getPathUsageBounded(root, {
      allowedRoots: [root],
      maxDepth: 10,
      maxEntries: 5,
    });
    expect(usage.truncated).toBe(true);
    expect(usage.fileCount).toBeLessThanOrEqual(5);
  });

  it("does not descend past the depth cap", async () => {
    // root/d1/d2/deep.txt — with maxDepth 1 the file at depth 2 is not counted.
    await fsp.mkdir(path.join(root, "d1"));
    await fsp.mkdir(path.join(root, "d1", "d2"));
    await fsp.writeFile(path.join(root, "d1", "d2", "deep.txt"), "deep");
    await fsp.writeFile(path.join(root, "top.txt"), "top"); // depth 1
    const usage = await getPathUsageBounded(root, {
      allowedRoots: [root],
      maxDepth: 1,
      maxEntries: 1000,
    });
    expect(usage.fileCount).toBe(1); // only top.txt
    expect(usage.truncated).toBe(true);
  });

  it("does not follow symlinks", async () => {
    await fsp.writeFile(path.join(root, "real.txt"), "real");
    await fsp.symlink(path.join(root, "real.txt"), path.join(root, "link.txt"));
    const usage = await getPathUsageBounded(root, {
      allowedRoots: [root],
      maxDepth: 10,
      maxEntries: 1000,
    });
    // Only the real file is counted; the symlink is skipped.
    expect(usage.fileCount).toBe(1);
  });
});
