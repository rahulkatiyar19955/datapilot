/**
 * Icon namespace — re-exports lucide-react components under the mock's
 * `Icon.*` names so renderer code reads identically to mock_design/*.jsx.
 *
 * Why a namespace object instead of named exports?
 *   - Matches `mock_design/icons.jsx` (which uses `Icon = { Chat, Fleet, … }`).
 *   - Single import: `import { Icon } from '@renderer/components/Icon'`.
 *   - Easy to swap a mapping later (e.g. point `Icon.Chat` at a custom SVG)
 *     without touching call sites.
 *
 * Lucide doesn't have a 1:1 match for every mock icon; the picks below are
 * the closest semantic equivalents. Replace with custom SVGs in Phase 6+ if
 * visual fidelity becomes an issue for a specific screen.
 */
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Battery,
  Bot,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Code,
  Copy,
  Cpu,
  Database,
  Download,
  Eye,
  EyeOff,
  File,
  Filter,
  Globe,
  Key,
  Layers,
  LayoutGrid,
  Map,
  MessageCircle,
  Mic,
  Moon,
  Network,
  Pause,
  Pin,
  Play,
  Plug,
  Plus,
  Power,
  RefreshCw,
  Search,
  Send,
  Settings,
  Share2,
  Sparkles,
  Square,
  Sun,
  Tag,
  Terminal,
  Trash2,
  Upload,
  Wifi,
  X,
  ZoomIn,
} from "lucide-react";

export const Icon = {
  // Rail / nav
  Chat: MessageCircle,
  Fleet: LayoutGrid,
  Search,
  Replay: Play,
  Bot,
  Settings,

  // Theme
  Sun,
  Moon,

  // Generic UI / actions
  Sparkles,
  Plus,
  X,
  Send,
  Stop: Square,
  Mic,
  Upload,
  Download,
  Share: Share2,
  Filter,
  Refresh: RefreshCw,
  Zoom: ZoomIn,
  Layers,
  ArrowRight,
  Check,
  Alert: AlertTriangle,
  File,
  Pin,
  Tag,
  ChevronDown,
  ChevronRight,

  // Media / playback
  Play,
  Pause,
  Clock,
  Activity,

  // Data / viz
  Map,
  Terminal,
  Graph: Network,

  // System / hardware
  Wifi,
  Battery,
  Cpu,
  Power,

  // Settings categories
  Box,
  Database,
  Key,
  Code,
  Globe,

  // MCP / integrations
  Plug,

  // API key management
  Eye,
  EyeOff,
  Copy,
  Trash: Trash2,
} as const;

export type IconName = keyof typeof Icon;
