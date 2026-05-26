import { app, BrowserWindow } from 'electron'
import Docker from 'dockerode'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import http from 'http'
import yaml from 'yaml'
import type { DockerStatus, DockerErrorCode } from '@shared/ipc'

const execAsync = promisify(exec)

class DockerOrchestrator {
  private docker: Docker
  private socketPath: string
  private status: DockerStatus = { state: 'pending' }
  private activeContainers: string[] = []

  constructor() {
    this.socketPath = process.platform === 'win32'
      ? '\\\\.\\pipe\\docker_engine'
      : '/var/run/docker.sock'
    this.docker = new Docker({ socketPath: this.socketPath })
  }

  public getStatus(): DockerStatus {
    return this.status
  }

  private setStatus(status: DockerStatus) {
    this.status = status
    // Emit status change to all renderer windows
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('docker:status-changed', status)
    }
  }

  /**
   * Verifies connection to the Docker daemon.
   */
  public async verifySocket(): Promise<boolean> {
    try {
      await this.docker.ping()
      return true
    } catch (err: any) {
      console.error('Docker ping failed:', err)
      let code: DockerErrorCode = 'unknown'
      let message = err.message || 'Unknown Docker error'

      if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
        code = 'daemon_off'
        message = 'Docker Desktop is not running. Please open Docker Desktop and try again.'
      } else if (err.code === 'EACCES') {
        code = 'permission_denied'
        message = 'Permission denied accessing Docker socket. Ensure user has appropriate permissions.'
      }
      this.setStatus({ state: 'error', code, message })
      return false
    }
  }

  /**
   * Resolves docker-compose.yml for both dev (repo root via app.getAppPath())
   * and packaged builds (process.resourcesPath via electron-builder extraResources).
   */
  private resolveComposePath(): string {
    const candidates = app.isPackaged
      ? [
          path.join(process.resourcesPath, 'docker-compose.yml'),
          path.join(app.getAppPath(), 'docker-compose.yml'),
        ]
      : [
          path.join(app.getAppPath(), 'docker-compose.yml'),
        ]
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate
    }
    throw new Error(
      `docker-compose.yml not found. Searched: ${candidates.join(', ')}`,
    )
  }

  /**
   * Resolves a build context path from a docker-compose service definition,
   * accounting for asar-packaged builds where source dirs live next to the asar
   * inside extraResources rather than inside app.getAppPath().
   */
  private resolveBuildContext(buildRef: string): string {
    if (path.isAbsolute(buildRef)) return buildRef
    const composeDir = path.dirname(this.resolveComposePath())
    return path.resolve(composeDir, buildRef)
  }

  private getComposeData(): any {
    const composePath = this.resolveComposePath()
    const fileContent = fs.readFileSync(composePath, 'utf-8')
    return yaml.parse(fileContent)
  }

  /**
   * Ensures the DataPilot network exists.
   */
  public async ensureNetwork(): Promise<void> {
    const networks = await this.docker.listNetworks()
    const exists = networks.some((n) => n.Name === 'datapilot-net')
    if (!exists) {
      await this.docker.createNetwork({
        Name: 'datapilot-net',
        Driver: 'bridge'
      })
    }
  }

  /**
   * Ensures all DataPilot volumes exist.
   */
  public async ensureVolumes(): Promise<void> {
    const result = await this.docker.listVolumes()
    const volumes = result.Volumes || []
    const requiredVolumes = ['neo4j-data', 'neo4j-logs', 'app-data']
    for (const vol of requiredVolumes) {
      if (!volumes.some((v) => v.Name === vol)) {
        await this.docker.createVolume({ Name: vol })
      }
    }
  }

  /**
   * Ensures required images exist, pulling or building them if missing in parallel.
   */
  public async ensureImages(): Promise<void> {
    const composeData = this.getComposeData()
    const images = await this.docker.listImages()
    const existingTags = images.flatMap((img) => img.RepoTags || [])
    const jobs: Promise<void>[] = []

    for (const [serviceName, service] of Object.entries<any>(composeData.services)) {
      const imageTag = service.image
      if (!imageTag) continue

      if (existingTags.includes(imageTag)) {
        console.log(`Image ${imageTag} is already present.`)
        continue
      }

      if (service.build) {
        console.log(`Building image for service: ${serviceName} (${imageTag})...`)
        const buildContextRef = service.build.context || service.build
        const buildContext = this.resolveBuildContext(buildContextRef)

        if (!fs.existsSync(buildContext)) {
          throw Object.assign(
            new Error(`Build context not found: ${buildContext}`),
            { dpCode: 'image_pull_failed' as DockerErrorCode },
          )
        }

        const buildJob = new Promise<void>((resolve, reject) => {
          const child = spawn('docker', ['build', '-t', imageTag, '.'], { cwd: buildContext })

          child.stdout?.on('data', (data: Buffer) => {
            process.stdout.write(`[build:${serviceName}] ${data.toString()}`)
          })

          child.stderr?.on('data', (data: Buffer) => {
            process.stderr.write(`[build:${serviceName}] ${data.toString()}`)
          })

          child.on('close', (code) => {
            if (code === 0) {
              resolve()
            } else {
              reject(
                Object.assign(
                  new Error(`docker build for ${imageTag} exited with code ${code}`),
                  { dpCode: 'image_pull_failed' as DockerErrorCode },
                ),
              )
            }
          })

          child.on('error', (err) => {
            reject(Object.assign(err, { dpCode: 'image_pull_failed' as DockerErrorCode }))
          })
        })

        jobs.push(buildJob)
      } else {
        console.log(`Pulling remote image: ${imageTag}...`)
        const pullJob = new Promise<void>((resolve, reject) => {
          this.docker.pull(imageTag, {}, (err: any, stream: any) => {
            if (err) {
              return reject(Object.assign(err, { dpCode: 'image_pull_failed' as DockerErrorCode }))
            }
            this.docker.modem.followProgress(
              stream,
              (err2: any) => {
                if (err2) {
                  return reject(
                    Object.assign(err2, { dpCode: 'image_pull_failed' as DockerErrorCode }),
                  )
                }
                resolve()
              },
              (event: any) => {
                if (event.status) {
                  process.stdout.write(`[pull:${serviceName}] ${event.status} ${event.progress || ''}\n`)
                }
              }
            )
          })
        })

        jobs.push(pullJob)
      }
    }

    if (jobs.length > 0) {
      await Promise.all(jobs)
    }
  }

  /**
   * Maps a dockerode/spawn error to a DockerErrorCode.
   * Errors annotated with `.dpCode` (by ensureImages, startContainer etc.) win;
   * otherwise we inspect the message + statusCode heuristically.
   */
  private classifyError(err: any): { code: DockerErrorCode; message: string } {
    if (err?.dpCode) {
      return { code: err.dpCode, message: err.message || String(err) }
    }
    const raw: string = (err?.message || err?.json?.message || String(err) || '').toLowerCase()
    if (raw.includes('port is already allocated') || raw.includes('address already in use')) {
      return {
        code: 'port_conflict',
        message:
          'A required port (7474, 7687, or 8000) is already in use by another process. ' +
          'Stop the conflicting service and retry.',
      }
    }
    if (
      raw.includes('manifest unknown') ||
      raw.includes('pull access denied') ||
      raw.includes('no such image') ||
      raw.includes('error response from daemon: failed to pull')
    ) {
      return {
        code: 'image_pull_failed',
        message: err?.message || 'Docker was unable to pull or build one of the required images.',
      }
    }
    if (err?.code === 'EACCES') {
      return {
        code: 'permission_denied',
        message: 'Permission denied accessing the Docker socket.',
      }
    }
    if (err?.code === 'ENOENT' || err?.code === 'ECONNREFUSED') {
      return {
        code: 'daemon_off',
        message: 'Docker Desktop is not running. Open Docker Desktop and retry.',
      }
    }
    return { code: 'unknown', message: err?.message || String(err) }
  }

  /**
   * Polls a URL until it responds with a 200 status code.
   * Calls `response.resume()` so the socket is released back to the agent
   * pool — otherwise the unconsumed response body keeps it open and we
   * eventually exhaust the agent's connection limit.
   */
  private async pollLiveness(url: string, timeoutMs: number): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await new Promise<number>((resolve, reject) => {
          const req = http.get(url, (response) => {
            response.resume() // drain & free the socket
            resolve(response.statusCode || 0)
          })
          req.on('error', reject)
          req.end()
        })
        if (res === 200) {
          return true
        }
      } catch {
        // Ignore and retry
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
    return false
  }

  /**
   * Boots the full Docker stack.
   */
  public async ensureStackUp(): Promise<void> {
    const wasDaemonOff = this.status.state === 'error' && this.status.code === 'daemon_off'
    this.setStatus({ state: 'pending' })

    if (wasDaemonOff && process.platform === 'darwin') {
      console.log('Attempting to open Docker Desktop on macOS...')
      try {
        await execAsync('open -a Docker')
        // Wait 4s for daemon boot sequence
        await new Promise((r) => setTimeout(r, 4000))
      } catch (err) {
        console.error('Failed to open Docker Desktop:', err)
      }
    }

    const isDockerReady = await this.verifySocket()
    if (!isDockerReady) {
      return
    }

    try {
      console.log('Ensuring Docker network...')
      await this.ensureNetwork()
      console.log('Ensuring Docker volumes...')
      await this.ensureVolumes()
      console.log('Ensuring Docker images (build/pull)...')
      await this.ensureImages()

      const userHome = app.getPath('home')

      // Start services in order: Neo4j -> FastAPI Backend -> 5 workers
      console.log('Starting Neo4j...')
      await this.startContainer('neo4j', {
        Image: 'neo4j:5-community',
        Env: [
          'NEO4J_AUTH=neo4j/datapilot-local',
          'NEO4J_PLUGINS=["apoc"]',
          'NEO4J_dbms_security_procedures_unrestricted=apoc.*'
        ],
        HostConfig: {
          PortBindings: {
            '7474/tcp': [{ HostPort: '7474' }],
            '7687/tcp': [{ HostPort: '7687' }]
          },
          Binds: [
            'neo4j-data:/data',
            'neo4j-logs:/logs'
          ],
          NetworkMode: 'datapilot-net'
        }
      })

      // Wait for Neo4j liveness check
      console.log('Waiting for Neo4j to become healthy...')
      const neo4jHealthy = await this.pollLiveness('http://localhost:7474', 30000)
      if (!neo4jHealthy) {
        throw new Error('Neo4j database failed to become healthy within 30 seconds.')
      }

      console.log('Starting FastAPI Backend...')
      await this.startContainer('backend', {
        Image: 'datapilot/backend:local',
        Env: [
          'NEO4J_URI=bolt://datapilot-neo4j:7687',
          'NEO4J_USER=neo4j',
          'NEO4J_PASSWORD=datapilot-local',
          'DATAPILOT_HOST_MOUNT=/host',
          'DATAPILOT_DATA_DIR=/data'
        ],
        HostConfig: {
          PortBindings: {
            '8000/tcp': [{ HostPort: '8000' }]
          },
          Binds: [
            'app-data:/data',
            `${userHome}:/host:ro` // Read-only mount of user home directory
          ],
          NetworkMode: 'datapilot-net'
        }
      })

      // Wait for FastAPI backend liveness check
      console.log('Waiting for Backend to become healthy...')
      const backendHealthy = await this.pollLiveness('http://localhost:8000/health', 15000)
      if (!backendHealthy) {
        throw new Error('FastAPI backend failed to become healthy within 15 seconds.')
      }

      // Start the 5 MCP Workers in parallel
      console.log('Starting MCP workers...')
      const workers = [
        {
          name: 'rosbag-reader',
          image: 'datapilot/mcp-rosbag-reader:local',
          binds: [`${userHome}:/host:ro`],
          env: ['DATAPILOT_HOST_MOUNT=/host']
        },
        {
          name: 'trajectory-analyzer',
          image: 'datapilot/mcp-trajectory-analyzer:local',
          binds: [`${userHome}:/host:ro`],
          env: ['DATAPILOT_HOST_MOUNT=/host']
        },
        {
          name: 'planner-failure-inspector',
          image: 'datapilot/mcp-planner-failure-inspector:local',
          binds: [],
          env: [
            'NEO4J_URI=bolt://datapilot-neo4j:7687',
            'NEO4J_USER=neo4j',
            'NEO4J_PASSWORD=datapilot-local'
          ]
        },
        {
          name: 'anomaly-detector',
          image: 'datapilot/mcp-anomaly-detector:local',
          binds: [`${userHome}:/host:ro`],
          env: ['DATAPILOT_HOST_MOUNT=/host']
        },
        {
          name: 'report-composer',
          image: 'datapilot/mcp-report-composer:local',
          binds: [],
          env: []
        }
      ]

      await Promise.all(
        workers.map(async (worker) => {
          await this.startContainer(worker.name, {
            Image: worker.image,
            Env: worker.env,
            HostConfig: {
              Binds: worker.binds,
              NetworkMode: 'datapilot-net'
            }
          })
        })
      )

      console.log('All stack components started successfully.')
      this.setStatus({ state: 'ready' })
    } catch (err: any) {
      console.error('Stack boot failed:', err)
      const { code, message } = this.classifyError(err)
      this.setStatus({ state: 'error', code, message: `Stack boot failed: ${message}` })
    }
  }

  /**
   * Helper to create and start a container, managing existing ones if needed.
   */
  private async startContainer(serviceName: string, config: any): Promise<any> {
    const containerName = `datapilot-${serviceName}`
    const container = this.docker.getContainer(containerName)

    try {
      const info = await container.inspect()
      if (info.State.Running) {
        console.log(`Container ${containerName} is already running.`)
        if (!this.activeContainers.includes(containerName)) {
          this.activeContainers.push(containerName)
        }
        return container
      }
      console.log(`Container ${containerName} exists but is not running. Starting...`)
      await container.start()
      if (!this.activeContainers.includes(containerName)) {
        this.activeContainers.push(containerName)
      }
      return container
    } catch (err: any) {
      if (err.statusCode !== 404) {
        throw err
      }
    }

    // Configure network alias to match service name (e.g. 'neo4j', 'backend')
    const finalConfig = {
      ...config,
      name: containerName,
      NetworkingConfig: {
        EndpointsConfig: {
          'datapilot-net': {
            Aliases: [serviceName]
          }
        }
      }
    }

    console.log(`Creating container ${containerName}...`)
    try {
      const newContainer = await this.docker.createContainer(finalConfig)
      await newContainer.start()
      if (!this.activeContainers.includes(containerName)) {
        this.activeContainers.push(containerName)
      }
      return newContainer
    } catch (err: any) {
      // Tag port-bind / create errors so classifyError can route them to the
      // right Setup pane. Docker daemon reports port conflicts via 500-status
      // responses with messages like "port is already allocated".
      const msg = (err?.message || err?.json?.message || '').toLowerCase()
      if (msg.includes('port is already allocated') || msg.includes('address already in use')) {
        throw Object.assign(err, { dpCode: 'port_conflict' as DockerErrorCode })
      }
      throw err
    }
  }

  /**
   * Streams logs from a running container. Returns an unsubscribe function
   * that aborts the stream. `onChunk` is called per (newline-terminated)
   * batch of stdout/stderr output. Used by Settings → Docker (Phase 11) and
   * during development for debugging the stack.
   */
  public async streamLogs(
    serviceOrContainer: string,
    onChunk: (chunk: string) => void,
  ): Promise<() => void> {
    // Accept either a bare service name ("backend") or the prefixed container
    // name ("datapilot-backend"). Normalize.
    const containerName = serviceOrContainer.startsWith('datapilot-')
      ? serviceOrContainer
      : `datapilot-${serviceOrContainer}`
    const container = this.docker.getContainer(containerName)

    const stream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail: 200,
      timestamps: false,
    })

    let cancelled = false
    // Docker multiplexes stdout+stderr with an 8-byte header per frame when
    // TTY isn't allocated. TCP does NOT preserve message boundaries — any given
    // `data` event may carry a partial header or a partial payload, so we have
    // to accumulate across events and only emit complete frames.
    let logBuffer = Buffer.alloc(0)
    const onData = (buf: Buffer) => {
      if (cancelled) return
      logBuffer = Buffer.concat([logBuffer, buf])
      while (logBuffer.length >= 8) {
        // bytes 4..8 = big-endian payload length
        const len = logBuffer.readUInt32BE(4)
        if (logBuffer.length < 8 + len) break // wait for the rest of the payload
        const payload = logBuffer.subarray(8, 8 + len)
        if (payload.length > 0) onChunk(payload.toString('utf-8'))
        logBuffer = logBuffer.subarray(8 + len)
      }
    }

    ;(stream as NodeJS.ReadableStream).on('data', onData)

    return () => {
      cancelled = true
      try {
        ;(stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.()
      } catch {
        // already torn down
      }
    }
  }

  /**
   * Tears down the full Docker stack.
   */
  public async ensureStackDown(): Promise<void> {
    console.log('Tearing down DataPilot Docker stack...')
    const composeData = this.getComposeData()
    const containerNames = Object.keys(composeData.services).map((name) => `datapilot-${name}`)

    await Promise.all(
      containerNames.map(async (name) => {
        const container = this.docker.getContainer(name)
        try {
          console.log(`Stopping container ${name}...`)
          await container.stop({ t: 2 }) // Fast SIGTERM with 2s grace
        } catch (err: any) {
          // Ignore if already stopped (304) or not found (404)
          if (err.statusCode !== 304 && err.statusCode !== 404) {
            console.warn(`Failed to stop container ${name}:`, err.message)
          }
        }

        try {
          console.log(`Removing container ${name}...`)
          await container.remove({ force: true })
        } catch (err: any) {
          if (err.statusCode !== 404) {
            console.warn(`Failed to remove container ${name}:`, err.message)
          }
        }
      })
    )

    this.activeContainers = []
    this.setStatus({ state: 'pending' })
  }
}

export const dockerOrchestrator = new DockerOrchestrator()
