import { type JSX } from "react";
import { Icon } from "@renderer/components/Icon";
import { useSessionStore } from "@renderer/stores/session";

const NAV_TOPIC_PATTERNS = [
  "/odom",
  "/tf",
  "/map",
  "/costmap",
  "/amcl",
  "/move_base",
  "/nav",
  "/path",
  "/cmd_vel",
];

export function MapView(): JSX.Element {
  const topics = useSessionStore((s) => s.topics);
  const sessionId = useSessionStore((s) => s.sessionId);

  // Find nav-related topics to show context
  const navTopics = topics.filter((t) =>
    NAV_TOPIC_PATTERNS.some((p) =>
      t.name.toLowerCase().includes(p.toLowerCase()),
    ),
  );

  if (!sessionId) {
    return (
      <div className="col flex1" style={{ minHeight: 0 }}>
        <div
          className="row gap-2"
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid var(--color-border-1)",
          }}
        >
          <span className="section-h">Map · trajectory</span>
        </div>
        <div
          className="flex1 col"
          style={{
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            color: "var(--color-text-3)",
          }}
        >
          <Icon.Map size={32} style={{ opacity: 0.3 }} />
          <span style={{ fontSize: 12 }}>No session loaded</span>
        </div>
      </div>
    );
  }

  return (
    <div className="col flex1" style={{ minHeight: 0 }}>
      {/* Toolbar */}
      <div
        className="row gap-2"
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--color-border-1)",
        }}
      >
        <span className="section-h">Map · trajectory</span>
        {navTopics.length > 0 && (
          <span className="pill sm ghost mono">
            {navTopics.length} nav topics
          </span>
        )}
        <div className="flex1" />
        <button
          className="btn ghost icon sm"
          title="Zoom (not available)"
          disabled
        >
          <Icon.Zoom size={13} />
        </button>
      </div>

      {/* Map body */}
      <div
        className="flex1"
        style={{
          position: "relative",
          background: "var(--color-map-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          className="col"
          style={{
            alignItems: "center",
            gap: 20,
            maxWidth: 480,
            padding: "32px 24px",
            textAlign: "center",
          }}
        >
          {/* Dotted grid illustration */}
          <div
            style={{
              width: 100,
              height: 100,
              borderRadius: 16,
              background: "var(--color-bg-1)",
              border: "1px dashed var(--color-border-2)",
              display: "grid",
              placeItems: "center",
              color: "var(--color-text-3)",
            }}
          >
            <Icon.Map size={36} style={{ opacity: 0.35 }} />
          </div>

          <div className="col gap-2">
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--color-text-1)",
              }}
            >
              Map view · coming soon
            </span>
            <span
              style={{
                fontSize: 12,
                color: "var(--color-text-3)",
                lineHeight: 1.5,
              }}
            >
              2D trajectory visualization with costmap overlay, odometry path,
              and anomaly markers will be rendered from your bag's navigation
              topics.
            </span>
          </div>

          {/* Available nav topics */}
          {navTopics.length > 0 ? (
            <div className="col" style={{ width: "100%", gap: 6 }}>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: "var(--color-text-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Navigation topics found in this bag
              </span>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  justifyContent: "center",
                }}
              >
                {navTopics.map((t) => (
                  <span
                    key={t.name}
                    className="pill sm ghost mono"
                    style={{ fontSize: 10.5 }}
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <span className="pill sm ghost" style={{ fontSize: 11 }}>
              No odometry / nav topics detected in this bag
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
