import { useState, type JSX } from 'react'
import type { DockerStatus } from '@shared/ipc'
import {
  RefreshCw,
  Terminal,
  Copy,
  Check,
  Activity,
  AlertOctagon,
  ShieldAlert,
  Network,
  DownloadCloud
} from 'lucide-react'

interface SetupProps {
  status: DockerStatus
  onRetry: () => void
}

export function Setup({ status, onRetry }: SetupProps): JSX.Element {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (status.state === 'pending') {
    return (
      <div className="setup-container">
        <div className="setup-card items-center justify-center py-16 text-center">
          <div className="setup-logo pulse">D</div>
          <div className="flex flex-col gap-2 mt-6">
            <h1 className="setup-title pulse">Orchestrating Environment</h1>
            <p className="setup-subtitle">Initializing Neo4j database, FastAPI backend, and MCP workers...</p>
          </div>
          <div className="flex items-center gap-2 mt-8 px-4 py-2 rounded bg-bg-2 border border-border-1 text-text-3 font-mono text-xs">
            <RefreshCw className="animate-spin text-accent" size={14} />
            <span>docker compose status: pending</span>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (status.state !== 'error') {
    return (
      <div className="setup-container">
        <div className="setup-card items-center justify-center py-16 text-center">
          <p className="text-text-3">Status: {status.state}</p>
        </div>
      </div>
    )
  }

  const { code, message } = status
  let title = 'Environment Setup Error'
  let subtitle = 'DataPilot was unable to start the local Docker services stack.'
  let icon = <AlertOctagon size={24} className="text-danger" />
  let remediationTitle = 'Suggested Resolution'
  let remediationContent: JSX.Element | null = null
  let showOpenDockerBtn = false

  switch (code) {
    case 'daemon_off':
      title = 'Docker Daemon Offline'
      subtitle = 'Docker Desktop is not running on your host system.'
      icon = <AlertOctagon size={24} className="text-danger" />
      remediationContent = (
        <div className="flex flex-col gap-2">
          <p className="text-text-2">
            DataPilot requires Docker Desktop to orchestrate the local database, backend API, and worker nodes.
          </p>
          <p className="text-text-2 font-medium">
            Please start Docker Desktop and wait for it to become active, then retry.
          </p>
        </div>
      )
      showOpenDockerBtn = true
      break

    case 'permission_denied':
      title = 'Docker Socket Permission Denied'
      subtitle = 'Insufficient permissions to connect to the Docker socket.'
      icon = <ShieldAlert size={24} className="text-danger" />
      remediationTitle = 'Terminal Resolution'
      const chmodCmd = 'sudo chmod 666 /var/run/docker.sock'
      remediationContent = (
        <div className="flex flex-col gap-3">
          <p className="text-text-2">
            The application encountered an permission error (<code className="mono text-danger text-xs bg-bg-2 px-1 rounded">EACCES</code>) when trying to access the Unix domain socket. Run the following command in your terminal to grant read/write access:
          </p>
          <div className="setup-code-block">
            <span className="row gap-2">
              <Terminal size={14} className="text-text-3" />
              <span className="setup-code-cmd text-text-0 mono select-all">{chmodCmd}</span>
            </span>
            <button
              onClick={() => copyToClipboard(chmodCmd)}
              className="btn sm icon"
              title="Copy to clipboard"
            >
              {copied ? <Check size={13} className="text-ok" /> : <Copy size={13} />}
            </button>
          </div>
          <p className="text-text-3 text-xs italic">
            Note: This command changes the socket permissions locally to allow standard processes to connect.
          </p>
        </div>
      )
      break

    case 'port_conflict':
      title = 'Network Port Conflict'
      subtitle = 'Required ports (7474, 7687, or 8000) are already bound.'
      icon = <Network size={24} className="text-danger" />
      remediationTitle = 'Conflicting Processes'
      const conflictCmd = 'lsof -i :7474 -i :7687 -i :8000'
      remediationContent = (
        <div className="flex flex-col gap-3">
          <p className="text-text-2">
            Another service or background process on your machine is using the ports needed by Neo4j or FastAPI. Run this command to find the process ID:
          </p>
          <div className="setup-code-block">
            <span className="row gap-2">
              <Terminal size={14} className="text-text-3" />
              <span className="setup-code-cmd text-text-0 mono select-all">{conflictCmd}</span>
            </span>
            <button
              onClick={() => copyToClipboard(conflictCmd)}
              className="btn sm icon"
              title="Copy to clipboard"
            >
              {copied ? <Check size={13} className="text-ok" /> : <Copy size={13} />}
            </button>
          </div>
          <p className="text-text-2">
            Terminate the conflicting processes or services, then click retry.
          </p>
        </div>
      )
      break

    case 'image_pull_failed':
      title = 'Registry Ingestion Failure'
      subtitle = 'Unable to pull required docker images or build containers.'
      icon = <DownloadCloud size={24} className="text-danger" />
      remediationContent = (
        <div className="flex flex-col gap-2">
          <p className="text-text-2">
            The docker orchestrator was unable to pull <code className="mono text-xs bg-bg-2 px-1 rounded">neo4j:5-community</code> or build local images.
          </p>
          <p className="text-text-2 font-medium">
            Please verify you have a stable internet connection and that Docker has registry access.
          </p>
        </div>
      )
      break

    default:
      title = 'Integration Stack Failure'
      subtitle = 'An unexpected error occurred during container startup.'
      icon = <AlertOctagon size={24} className="text-danger" />
      remediationContent = (
        <div className="flex flex-col gap-2">
          <p className="text-text-2">
            The environment could not boot successfully. Details:
          </p>
          <pre className="mono text-xs text-danger bg-bg-2 p-3 rounded border border-border-1 max-h-36 overflow-y-auto whitespace-pre-wrap select-all">
            {message}
          </pre>
        </div>
      )
  }

  return (
    <div className="setup-container">
      <div className="setup-card fade-in">
        <div className="setup-header">
          <div className="setup-logo">D</div>
          <div className="setup-title-group">
            <h1 className="setup-title">Environment Setup</h1>
            <p className="setup-subtitle">Dependency & Stack Verification</p>
          </div>
        </div>

        <div className="setup-status error">
          <div className="row gap-2">
            {icon}
            <span className="setup-status-label">{title}</span>
          </div>
          <div className="setup-status-message mt-1">{subtitle}</div>
        </div>

        <div className="setup-remediation">
          <span className="setup-remediation-title">{remediationTitle}</span>
          <div className="mt-2 text-text-1">{remediationContent}</div>
        </div>

        <div className="setup-actions">
          {showOpenDockerBtn && (
            <button
              onClick={onRetry}
              className="btn primary"
              title="Open Docker Desktop and Retry"
            >
              <Activity size={14} className="mr-1" />
              Launch Docker & Retry
            </button>
          )}
          <button
            onClick={onRetry}
            className={`btn ${showOpenDockerBtn ? 'ghost border-border-1' : 'primary'}`}
            title="Retry connecting to Docker"
          >
            <RefreshCw size={14} className="mr-1" />
            Retry Connection
          </button>
        </div>
      </div>
    </div>
  )
}
