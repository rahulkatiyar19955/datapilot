import { useState, type JSX, type ReactNode } from "react";
import { Icon } from "@renderer/components/Icon";
import { useTheme } from "@renderer/hooks/useTheme";
import {
  WindowChrome,
  Titlebar,
  Traffic,
  Rail,
  RailButton,
} from "@renderer/components/chrome";
import {
  Button,
  Card,
  Input,
  Panel,
  Pill,
  SectionHeader,
  SeverityDot,
  Sparkline,
  StatusDot,
  Tab,
  Tabs,
  Toggle,
} from "@renderer/components/ui";

/**
 * Phase 2 validation screen. Renders one of every primitive so visual diffs
 * against `mock_design/*.jsx` can be done quickly. Hidden behind ⌘⇧D
 * (Ctrl+Shift+D on Win/Linux); registered in App.tsx.
 *
 * Dev-only by convention — App.tsx gates the mount under
 * `import.meta.env.DEV`, so this component never ships in production builds.
 */
export function DesignSystem({ onExit }: { onExit?: () => void }): JSX.Element {
  const { theme, toggle } = useTheme();
  const [toggleOn, setToggleOn] = useState(true);
  const [activeTab, setActiveTab] = useState<"a" | "b" | "c">("a");

  return (
    <WindowChrome>
      <Titlebar
        left={<Traffic />}
        center={
          <span>
            <b>DataPilot</b> · Design System · primitive gallery (dev only)
          </span>
        }
        right={
          <>
            <Button
              size="sm"
              variant="ghost"
              icon
              onClick={toggle}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            >
              {theme === "dark" ? (
                <Icon.Sun size={13} />
              ) : (
                <Icon.Moon size={13} />
              )}
            </Button>
            <Pill size="sm" tone="ghost" mono>
              {theme}
            </Pill>
            {onExit && (
              <Button size="sm" variant="ghost" onClick={onExit}>
                <Icon.X size={13} /> Exit
              </Button>
            )}
          </>
        }
      />

      <div className="body" style={{ overflow: "auto", padding: 24 }}>
        <div
          style={{
            maxWidth: 980,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: 32,
          }}
        >
          <Section title="Pills">
            <Row>
              <Pill>default</Pill>
              <Pill size="sm">small</Pill>
              <Pill tone="ghost">ghost</Pill>
              <Pill tone="ok" swatch>
                ok
              </Pill>
              <Pill tone="warn" swatch>
                warn
              </Pill>
              <Pill tone="danger" swatch>
                danger
              </Pill>
              <Pill tone="accent" swatch>
                accent
              </Pill>
              <Pill tone="ghost" mono size="sm">
                v0.18.4
              </Pill>
            </Row>
          </Section>

          <Section title="Buttons">
            <Row>
              <Button>default</Button>
              <Button variant="primary">primary</Button>
              <Button variant="ghost">ghost</Button>
              <Button size="sm">small</Button>
              <Button size="sm" variant="primary">
                small primary
              </Button>
              <Button icon size="sm">
                <Icon.Plus size={13} />
              </Button>
              <Button icon size="sm" variant="ghost">
                <Icon.X size={13} />
              </Button>
              <Button disabled>disabled</Button>
            </Row>
          </Section>

          <Section title="Inputs">
            <Row>
              <Input
                placeholder="Ask anything about this run…"
                leading={<Icon.Search size={13} />}
                trailing={
                  <span
                    className="mono"
                    style={{ fontSize: 10.5, opacity: 0.6 }}
                  >
                    ⌘K
                  </span>
                }
                style={{ width: 320 }}
              />
              <Input
                size="sm"
                placeholder="search in logs"
                leading={<Icon.Search size={12} />}
                style={{ width: 240 }}
              />
            </Row>
          </Section>

          <Section title="Tabs">
            <Tabs>
              <Tab
                icon={<Icon.Clock size={13} />}
                active={activeTab === "a"}
                count={12}
                onClick={() => setActiveTab("a")}
              >
                Timeline
              </Tab>
              <Tab
                icon={<Icon.Activity size={13} />}
                active={activeTab === "b"}
                count={4}
                onClick={() => setActiveTab("b")}
              >
                Metrics
              </Tab>
              <Tab
                icon={<Icon.Terminal size={13} />}
                active={activeTab === "c"}
                count={128}
                onClick={() => setActiveTab("c")}
              >
                Logs
              </Tab>
            </Tabs>
          </Section>

          <Section title="Toggle">
            <Row>
              <Toggle on={toggleOn} onChange={setToggleOn} label="enabled" />
              <span style={{ fontSize: 12, opacity: 0.7 }}>
                {toggleOn ? "enabled" : "disabled"}
              </span>
              <Toggle
                on={false}
                onChange={() => undefined}
                label="off (read-only)"
                disabled
              />
            </Row>
          </Section>

          <Section title="SeverityDot">
            <Row>
              <SeverityDot sev="critical" />
              <SeverityDot sev="warning" />
              <SeverityDot sev="info" />
              <SeverityDot sev="success" />
              <SeverityDot sev="ghost" />
              <SeverityDot sev="critical" label="3 errors" />
            </Row>
          </Section>

          <Section title="StatusDot">
            <Row>
              <StatusDot status="ok" /> <span style={{ fontSize: 12 }}>ok</span>
              <StatusDot status="warning" />{" "}
              <span style={{ fontSize: 12 }}>warning</span>
              <StatusDot status="critical" pulse />{" "}
              <span style={{ fontSize: 12 }}>critical (pulsing)</span>
              <StatusDot status="offline" />{" "}
              <span style={{ fontSize: 12 }}>offline</span>
            </Row>
          </Section>

          <Section title="Sparkline">
            <Row>
              <Sparkline trend="stable" />{" "}
              <span style={{ fontSize: 12, opacity: 0.7 }}>stable</span>
              <Sparkline trend="up" color="var(--color-ok)" />{" "}
              <span style={{ fontSize: 12, opacity: 0.7 }}>up</span>
              <Sparkline trend="down" color="var(--color-warn)" />{" "}
              <span style={{ fontSize: 12, opacity: 0.7 }}>down</span>
              <Sparkline trend="spike" color="var(--color-danger)" />{" "}
              <span style={{ fontSize: 12, opacity: 0.7 }}>spike</span>
            </Row>
          </Section>

          <Section title="Card / Panel / SectionHeader">
            <Row>
              <Card style={{ padding: 16, minWidth: 220 }}>
                <SectionHeader>Card</SectionHeader>
                <div style={{ fontSize: 12, marginTop: 6, opacity: 0.8 }}>
                  Standard surface — bg-2, 8px radius.
                </div>
              </Card>
              <Panel style={{ padding: 16, minWidth: 220 }}>
                <SectionHeader>Panel</SectionHeader>
                <div style={{ fontSize: 12, marginTop: 6, opacity: 0.8 }}>
                  Outer surface — bg-1, structural region.
                </div>
              </Panel>
            </Row>
          </Section>

          <Section title="Rail (in-place demo)">
            <div
              style={{
                display: "flex",
                alignItems: "stretch",
                gap: 16,
                height: 280,
                border: "1px solid var(--color-border-1)",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <Rail>
                <RailButton
                  icon={<Icon.Chat size={18} />}
                  label="Copilot"
                  active
                />
                <RailButton
                  icon={<Icon.Fleet size={18} />}
                  label="Fleet"
                  badge
                />
                <RailButton icon={<Icon.Search size={18} />} label="Search" />
                <RailButton icon={<Icon.Replay size={18} />} label="Replay" />
                <div className="rail-spacer" />
                <RailButton
                  icon={<Icon.Bot size={18} />}
                  label="Agents & MCP"
                />
                <RailButton
                  icon={<Icon.Settings size={18} />}
                  label="Settings"
                />
              </Rail>
              <div
                style={{
                  padding: 16,
                  fontSize: 12,
                  color: "var(--color-text-2)",
                }}
              >
                The Rail (left, 56 px) is the vertical navigation used in the
                Copilot Workspace (Phase 6+). Active state draws a 2-px accent
                bar; the Fleet button has a badge indicator (top-right red dot).
              </div>
            </div>
          </Section>

          <Section title="Icons (lucide-react under Icon.* namespace)">
            <Row>
              {(
                [
                  "Chat",
                  "Fleet",
                  "Search",
                  "Replay",
                  "Bot",
                  "Settings",
                  "Sparkles",
                  "Send",
                  "Mic",
                  "Upload",
                  "Download",
                  "Filter",
                  "Refresh",
                  "Layers",
                  "Check",
                  "Alert",
                  "File",
                  "Wifi",
                  "Battery",
                  "Cpu",
                  "Key",
                  "Database",
                  "Code",
                  "Pin",
                ] as const
              ).map((name) => {
                const Cmp = Icon[name];
                return (
                  <div
                    key={name}
                    title={`Icon.${name}`}
                    style={{
                      display: "inline-flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                      width: 56,
                    }}
                  >
                    <Cmp size={18} />
                    <span
                      className="mono"
                      style={{ fontSize: 9, color: "var(--color-text-3)" }}
                    >
                      {name}
                    </span>
                  </div>
                );
              })}
            </Row>
          </Section>
        </div>
      </div>
    </WindowChrome>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <SectionHeader>{title}</SectionHeader>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}
