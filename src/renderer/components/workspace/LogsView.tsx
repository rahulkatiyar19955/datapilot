import { useState, useEffect, useCallback, useRef, type JSX } from "react";
import { Icon } from "@renderer/components/Icon";
import { Input } from "@renderer/components/ui/Input";
import { useSessionStore } from "@renderer/stores/session";
import * as api from "@renderer/services/api";
import type { LogItem } from "@shared/types";

type SevFilter = "ERROR" | "WARN" | "INFO" | "DEBUG";

const ALL_SEVERITIES: SevFilter[] = ["ERROR", "WARN", "INFO", "DEBUG"];
const PAGE_SIZE = 100;

function sevColor(sev: LogItem["sev"]): string {
  if (sev === "ERROR") return "var(--color-danger)";
  if (sev === "WARN") return "var(--color-warn)";
  if (sev === "INFO") return "var(--color-accent)";
  return "var(--color-text-3)";
}

function sevPillClass(sev: SevFilter): string {
  if (sev === "ERROR") return "pill sm danger";
  if (sev === "WARN") return "pill sm warn";
  if (sev === "INFO") return "pill sm accent";
  return "pill sm ghost";
}

function countBySev(logs: LogItem[], sev: SevFilter): number {
  return logs.filter((l) => l.sev === sev).length;
}

export function LogsView(): JSX.Element {
  const sessionId = useSessionStore((s) => s.sessionId);
  const initialLogs = useSessionStore((s) => s.logs);

  const [active, setActive] = useState<Set<SevFilter>>(new Set(ALL_SEVERITIES));
  const [search, setSearch] = useState("");
  const [displayedLogs, setDisplayedLogs] = useState<LogItem[]>(initialLogs);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(initialLogs.length === PAGE_SIZE);

  // Skip the first debounced fetch per session: useSession already loaded the
  // first page into the store, so there's nothing to re-fetch until the user
  // changes the query or filters.
  const didInit = useRef(false);
  const prevSessionId = useRef<string | null>(sessionId);

  // Reset filters/search only when the session actually changes (not on first
  // mount, and not when the store's logs array reference churns). Resetting
  // `active` to a fresh Set on every store-logs change would retrigger the
  // debounced-fetch effect and spin an infinite refetch loop.
  useEffect(() => {
    if (prevSessionId.current === sessionId) return;
    prevSessionId.current = sessionId;
    setSearch("");
    setActive(new Set(ALL_SEVERITIES));
    didInit.current = false;
  }, [sessionId]);

  // Sync displayed rows with the store when the base logs change (e.g. when
  // ingestion finishes and useSession populates them). Only adopt the store's
  // first page in the default view — never overwrite an active search/filter
  // result (which is driven by the debounced backend fetch below).
  useEffect(() => {
    const isDefaultFilter = active.size === ALL_SEVERITIES.length;
    if (search || !isDefaultFilter) return;
    setDisplayedLogs(initialLogs);
    setOffset(initialLogs.length);
    setHasMore(initialLogs.length === PAGE_SIZE);
  }, [initialLogs, search, active]);

  const toggleSev = (sev: SevFilter) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(sev)) next.delete(sev);
      else next.add(sev);
      return next;
    });
  };

  // Debounced backend search
  const fetchLogs = useCallback(
    (q: string, severities: Set<SevFilter>, newOffset = 0) => {
      if (!sessionId) return;
      setLoading(true);
      const severityParam = ALL_SEVERITIES.filter((s) =>
        severities.has(s),
      ).join(",");
      api
        .getLogs(sessionId, {
          q: q || undefined,
          severity: severityParam || undefined,
          limit: PAGE_SIZE,
          offset: newOffset,
        })
        .then((results) => {
          if (newOffset === 0) {
            setDisplayedLogs(results);
          } else {
            setDisplayedLogs((prev) => [...prev, ...results]);
          }
          setOffset(newOffset + results.length);
          setHasMore(results.length === PAGE_SIZE);
        })
        .catch(() => {
          /* keep previous results on error */
        })
        .finally(() => setLoading(false));
    },
    [sessionId],
  );

  // Debounce search + severity changes. Skip the very first run per session so
  // we render the store's already-loaded first page instead of immediately
  // re-fetching it (which previously fed an infinite refresh loop).
  useEffect(() => {
    if (!sessionId) return;
    if (!didInit.current) {
      didInit.current = true;
      return;
    }
    const timer = setTimeout(() => {
      fetchLogs(search, active, 0);
    }, 350);
    return () => clearTimeout(timer);
  }, [search, active, sessionId, fetchLogs]);

  const loadMore = () => {
    fetchLogs(search, active, offset);
  };

  const filtered = displayedLogs;

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
        <span className="section-h">Logs</span>
        <Input
          size="sm"
          placeholder="Semantic search… e.g. 'planner abort'"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leading={<Icon.Search size={12} />}
          trailing={
            loading ? (
              <span className="pulse dim mono" style={{ fontSize: 10 }}>
                …
              </span>
            ) : (
              <span className="dim mono" style={{ fontSize: 10 }}>
                ⌘K
              </span>
            )
          }
          style={{ minWidth: 280 }}
        />
        <div className="flex1" />
        <div className="row gap-1">
          {ALL_SEVERITIES.map((sev) => (
            <button
              key={sev}
              className={`${sevPillClass(sev)}${active.has(sev) ? "" : " ghost"}`}
              style={{ cursor: "pointer", opacity: active.has(sev) ? 1 : 0.45 }}
              onClick={() => toggleSev(sev)}
            >
              {active.has(sev) && sev !== "DEBUG" && (
                <span className="swatch" />
              )}
              {sev} ·{countBySev(displayedLogs, sev)}
            </button>
          ))}
        </div>
      </div>

      {/* Log table */}
      <div className="flex1" style={{ overflow: "auto" }}>
        <table
          className="mono"
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}
        >
          <thead>
            <tr
              style={{
                background: "var(--color-bg-1)",
                position: "sticky",
                top: 0,
                zIndex: 1,
              }}
            >
              {["Timestamp", "Severity", "Node", "Message"].map((h, i) => (
                <th
                  key={i}
                  style={{
                    textAlign: "left",
                    padding: "8px 12px",
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--color-text-3)",
                    borderBottom: "1px solid var(--color-border-1)",
                    fontFamily: "var(--font-ui)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={4}
                  style={{
                    padding: "24px 12px",
                    textAlign: "center",
                    color: "var(--color-text-3)",
                    fontFamily: "var(--font-ui)",
                  }}
                >
                  {!sessionId
                    ? "No session loaded"
                    : search
                      ? "No matching log entries"
                      : "No logs in this session"}
                </td>
              </tr>
            )}
            {filtered.map((l, i) => (
              <tr
                key={i}
                style={{ borderBottom: "1px solid var(--color-border-1)" }}
              >
                <td
                  style={{
                    padding: "7px 12px",
                    color: "var(--color-text-3)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {l.t}
                </td>
                <td style={{ padding: "7px 12px", whiteSpace: "nowrap" }}>
                  <span
                    style={{
                      color: sevColor(l.sev),
                      fontWeight: 600,
                      fontSize: 11,
                    }}
                  >
                    {l.sev.padEnd(5, " ")}
                  </span>
                </td>
                <td
                  style={{
                    padding: "7px 12px",
                    color: "var(--color-accent)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {l.node}
                </td>
                <td
                  style={{ padding: "7px 12px", color: "var(--color-text-1)" }}
                >
                  {l.text}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Load more */}
        {hasMore && !loading && (
          <div style={{ padding: "12px 14px", textAlign: "center" }}>
            <button className="btn ghost sm" onClick={loadMore}>
              <Icon.ChevronDown size={12} />
              Load more logs
            </button>
          </div>
        )}
        {loading && filtered.length > 0 && (
          <div
            style={{
              padding: "12px 14px",
              textAlign: "center",
              fontSize: 11,
              color: "var(--color-text-3)",
            }}
          >
            <span className="pulse">Fetching…</span>
          </div>
        )}
      </div>
    </div>
  );
}
