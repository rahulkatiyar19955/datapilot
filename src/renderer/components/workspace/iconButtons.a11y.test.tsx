import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataSourceBar } from "./DataSourceBar";
import { TimelineView } from "./TimelineView";
import { KGraphView } from "./KGraphView";
import { useSessionStore } from "@renderer/stores/session";
import type { KGraphData } from "@shared/types";

/**
 * issue #49 — icon-only buttons in the workspace views must carry an explicit
 * `aria-label` rather than relying on `title=` alone, so they expose an
 * accessible name to assistive tech that does not depend on tooltip support.
 */

// jsdom does not implement ResizeObserver; KGraphView observes its container.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
    ResizeObserverStub;
}

beforeEach(() => {
  useSessionStore.setState({
    sessionId: null,
    status: "idle",
    meta: null,
    timeline: [],
    kgraph: null,
  });
});

function expectLabel(name: RegExp): void {
  const btn = screen.getByRole("button", { name });
  // The accessible name must come from an explicit aria-label, not `title`.
  expect(btn).toHaveAttribute("aria-label");
}

describe("DataSourceBar icon-only buttons (issue #49)", () => {
  it("gives Share and Download an explicit aria-label", () => {
    render(<DataSourceBar />);
    expectLabel(/share/i);
    expectLabel(/download/i);
  });
});

describe("TimelineView icon-only buttons (issue #49)", () => {
  it("gives Filter and Refresh an explicit aria-label", () => {
    render(<TimelineView />);
    expectLabel(/filter/i);
    expectLabel(/refresh/i);
  });
});

describe("KGraphView icon-only buttons (issue #49)", () => {
  it("gives zoom/refresh controls an explicit aria-label", () => {
    const kgraph: KGraphData = {
      nodes: [{ id: "s1", label: "Session", group: "session" }],
      edges: [],
    };
    useSessionStore.setState({ sessionId: "s1", kgraph });
    render(<KGraphView />);
    expectLabel(/zoom in/i);
    expectLabel(/zoom out/i);
    expectLabel(/refresh/i);
  });
});
