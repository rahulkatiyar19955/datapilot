import type { JSX } from "react";
import { useSessionStore } from "@renderer/stores/session";
import { CopilotPanel } from "@renderer/components/copilot";
import { Workspace } from "@renderer/components/workspace";
import { useSession } from "@renderer/hooks/useSession";

export function Copilot(): JSX.Element {
  const pendingPath = useSessionStore((s) => s.pendingPath);

  // Drives session lifecycle: create → poll → fetch tab data
  useSession(pendingPath);

  return (
    <div
      className="flex1"
      style={{
        minWidth: 0,
        minHeight: 0,
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
      }}
    >
      <CopilotPanel />
      <Workspace />
    </div>
  );
}
