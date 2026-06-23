import { describe, it, expect, beforeEach } from "vitest";
import { useSessionStore, setTopicsData } from "./session";
import type {
  SessionMeta,
  TimelineEvent,
  LogItem,
  KGraphData,
  TopicInfo,
} from "@shared/types";

const initial = useSessionStore.getState();

function meta(over: Partial<SessionMeta> = {}): SessionMeta {
  return {
    id: "s1",
    filename: "robot.mcap",
    robot: "r2d2",
    durationSeconds: 42,
    totalMessages: 100,
    topicsCount: 5,
    status: "ready",
    ...over,
  };
}

describe("useSessionStore", () => {
  beforeEach(() => {
    useSessionStore.setState(initial, true);
  });

  it("has sensible defaults", () => {
    const s = useSessionStore.getState();
    expect(s.pendingPath).toBeNull();
    expect(s.pendingSessionId).toBeNull();
    expect(s.sessionId).toBeNull();
    expect(s.status).toBe("idle");
    expect(s.meta).toBeNull();
    expect(s.timeline).toEqual([]);
    expect(s.topics).toEqual([]);
    expect(s.logs).toEqual([]);
    expect(s.kgraph).toBeNull();
  });

  describe("pending path / session id are mutually exclusive", () => {
    it("setPendingPath clears any pending session id", () => {
      useSessionStore.getState().setPendingSessionId("old-id");
      useSessionStore.getState().setPendingPath("/tmp/a.mcap");
      const s = useSessionStore.getState();
      expect(s.pendingPath).toBe("/tmp/a.mcap");
      expect(s.pendingSessionId).toBeNull();
    });

    it("setPendingSessionId clears any pending path", () => {
      useSessionStore.getState().setPendingPath("/tmp/a.mcap");
      useSessionStore.getState().setPendingSessionId("sess-9");
      const s = useSessionStore.getState();
      expect(s.pendingSessionId).toBe("sess-9");
      expect(s.pendingPath).toBeNull();
    });
  });

  describe("setSession", () => {
    it("stores id + meta and adopts the meta's status", () => {
      useSessionStore.getState().setSession("s1", meta({ status: "processing" }));
      const s = useSessionStore.getState();
      expect(s.sessionId).toBe("s1");
      expect(s.meta?.filename).toBe("robot.mcap");
      expect(s.status).toBe("processing");
    });
  });

  describe("setStatus", () => {
    it("updates only the status field", () => {
      useSessionStore.getState().setSession("s1", meta({ status: "ready" }));
      useSessionStore.getState().setStatus("error");
      const s = useSessionStore.getState();
      expect(s.status).toBe("error");
      expect(s.sessionId).toBe("s1");
    });
  });

  describe("setTabData", () => {
    it("routes timeline data to the timeline slice", () => {
      const events: TimelineEvent[] = [
        { t: 1, type: "log", sev: "info", topic: "/rosout", label: "boot" },
      ];
      useSessionStore.getState().setTabData("timeline", events);
      expect(useSessionStore.getState().timeline).toEqual(events);
    });

    it("routes logs data to the logs slice", () => {
      const logs: LogItem[] = [
        { t: "0.5", node: "/planner", sev: "ERROR", text: "abort" },
      ];
      useSessionStore.getState().setTabData("logs", logs);
      expect(useSessionStore.getState().logs).toEqual(logs);
    });

    it("routes kgraph data to the kgraph slice", () => {
      const kg: KGraphData = { nodes: [], edges: [] };
      useSessionStore.getState().setTabData("kgraph", kg);
      expect(useSessionStore.getState().kgraph).toEqual(kg);
    });

    it("ignores tabs without a dedicated slice (metrics, map)", () => {
      useSessionStore.getState().setTabData("metrics", [{ junk: true }]);
      useSessionStore.getState().setTabData("map", [{ junk: true }]);
      const s = useSessionStore.getState();
      // None of the data slices should have been touched.
      expect(s.timeline).toEqual([]);
      expect(s.logs).toEqual([]);
      expect(s.kgraph).toBeNull();
    });
  });

  describe("clearSession", () => {
    it("resets session/data fields back to idle defaults", () => {
      const store = useSessionStore.getState();
      store.setSession("s1", meta());
      store.setTabData("timeline", [
        { t: 1, type: "log", sev: "info", topic: "/x", label: "y" },
      ]);
      setTopicsData([{ name: "/t", type: "std_msgs/String", hz: 1, msgs: 9 }]);

      useSessionStore.getState().clearSession();
      const s = useSessionStore.getState();
      expect(s.sessionId).toBeNull();
      expect(s.status).toBe("idle");
      expect(s.meta).toBeNull();
      expect(s.timeline).toEqual([]);
      expect(s.topics).toEqual([]);
      expect(s.logs).toEqual([]);
      expect(s.kgraph).toBeNull();
    });
  });

  describe("setTopicsData helper", () => {
    it("writes topics directly onto the store", () => {
      const topics: TopicInfo[] = [
        { name: "/odom", type: "nav_msgs/Odometry", hz: 30, msgs: 900 },
      ];
      setTopicsData(topics);
      expect(useSessionStore.getState().topics).toEqual(topics);
    });
  });
});
