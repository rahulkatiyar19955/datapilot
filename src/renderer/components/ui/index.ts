/**
 * Barrel for all atom primitives. Future shadcn-pulled components
 * (Dialog, DropdownMenu, Tooltip, etc.) should also re-export from here so
 * consumers have a single import path:
 *
 *   import { Button, Pill, Card } from '@renderer/components/ui'
 */

export { Pill, type PillProps } from "./Pill";
export { Button, type ButtonProps } from "./Button";
export { Card, type CardProps } from "./Card";
export { Panel, type PanelProps } from "./Panel";
export { SectionHeader, type SectionHeaderProps } from "./SectionHeader";
export { Input } from "./Input";
export { Tabs, Tab } from "./Tabs";
export { Toggle } from "./Toggle";
export { SeverityDot, type Severity } from "./SeverityDot";
export { StatusDot, type RobotStatus } from "./StatusDot";
export { Sparkline, type Trend } from "./Sparkline";
