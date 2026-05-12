import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { spawn, type ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'

// ── Job tracking ──

interface Job {
  id: string
  type: 'explore' | 'run'
  status: 'running' | 'done' | 'error'
  process: ChildProcess
  stdout: string
  stderr: string
  result: any | null
  startedAt: number
  actions: number
  issues: number
}

const jobs = new Map<string, Job>()
let jobCounter = 0

function generateJobId(): string {
  return `job_${++jobCounter}_${Date.now().toString(36)}`
}

function parseProgressFromStderr(stderr: string): { actions: number; issues: number } {
  let actions = 0
  let issues = 0
  const lines = stderr.split('\n')
  for (const line of lines) {
    const actionMatch = line.match(/\((\d+) actions,/)
    if (actionMatch) actions = parseInt(actionMatch[1])
    if (line.includes('Found issue:')) issues++
  }
  return { actions, issues }
}

// ── MCP Server ──

const server = new McpServer({
  name: 'agentiqa',
  version: '0.1.0',
})

// Tool: startExplore
server.tool(
  'startExplore',
  'Start an AI testing agent that explores a web app and finds bugs. Returns a jobId immediately — use checkExploreStatus to poll for results. The agent navigates the app like a real user and reports visual, logical, and UX issues.',
  {
    url: z.string().describe('URL of the web app to test'),
    prompt: z.string().describe('What to test, e.g. "Test the login page for bugs"'),
    credentials: z
      .array(
        z.object({
          name: z.string(),
          secret: z.string(),
        }),
      )
      .optional()
      .describe('Login credentials to provide to the agent'),
  },
  async ({ url, prompt, credentials }) => {
    const jobId = generateJobId()

    const args = [
      'explore',
      prompt,
      '--url', url,
      '--auto-approve',
      '--json',
    ]

    if (credentials) {
      for (const cred of credentials) {
        args.push('--credential', `${cred.name}:${cred.secret}`)
      }
    }

    const proc = spawn('agentiqa', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    const job: Job = {
      id: jobId,
      type: 'explore',
      status: 'running',
      process: proc,
      stdout: '',
      stderr: '',
      result: null,
      startedAt: Date.now(),
      actions: 0,
      issues: 0,
    }

    proc.stdout?.on('data', (chunk: Buffer) => {
      job.stdout += chunk.toString()
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      job.stderr += chunk.toString()
      const progress = parseProgressFromStderr(job.stderr)
      job.actions = progress.actions
      job.issues = progress.issues
    })

    proc.on('close', (code) => {
      if (code === 0 && job.stdout) {
        try {
          job.result = JSON.parse(job.stdout)
          job.status = 'done'
        } catch {
          job.status = 'error'
          job.result = { error: 'Failed to parse JSON output' }
        }
      } else {
        job.status = 'error'
        job.result = { error: job.stderr.split('\n').filter(Boolean).pop() || `Exit code ${code}` }
      }
    })

    proc.on('error', (err) => {
      job.status = 'error'
      job.result = { error: err.message }
    })

    jobs.set(jobId, job)

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            jobId,
            status: 'started',
            message: `Agentiqa explore started against ${url}. Use checkExploreStatus("${jobId}") to poll for progress and results. Typical runs take 2-8 minutes.`,
          }),
        },
      ],
    }
  },
)

// Tool: checkExploreStatus
server.tool(
  'checkExploreStatus',
  'Check the status of a running Agentiqa explore job. Poll this every 10-15 seconds until status is "done" or "error".',
  {
    jobId: z.string().describe('The jobId returned by startExplore'),
  },
  async ({ jobId }) => {
    const job = jobs.get(jobId)

    if (!job) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: `Job ${jobId} not found` }) }],
      }
    }

    if (job.status === 'running') {
      const elapsed = Math.round((Date.now() - job.startedAt) / 1000)
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              jobId,
              status: 'running',
              actions: job.actions,
              issues: job.issues,
              elapsedSeconds: elapsed,
              message: `Exploring... ${job.actions} actions, ${job.issues} issues found so far (${elapsed}s elapsed)`,
            }),
          },
        ],
      }
    }

    // Done or error — return full result
    const result = job.result || {}
    const artifactsDir = result.artifactsDir
    const videoPath = result.videoPath
    const screenshotCount = result.screenshotCount

    // Clean up job after delivering result
    jobs.delete(jobId)

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            jobId,
            status: job.status,
            summary: result.summary,
            issues: result.issues,
            verdict: result.verdict,
            actionsTaken: result.actionsTaken,
            durationSeconds: result.durationSeconds,
            artifactsDir,
            videoPath,
            screenshotCount,
            testPlan: result.testPlan,
            suggestions: result.suggestions,
          }),
        },
      ],
    }
  },
)

// Tool: startRun
server.tool(
  'startRun',
  'Start an Agentiqa test plan run against a URL. Returns a jobId immediately — use checkRunStatus to poll for results.',
  {
    url: z.string().describe('URL of the web app to test'),
    planPath: z.string().describe('Path to the test plan JSON file'),
  },
  async ({ url, planPath }) => {
    const jobId = generateJobId()

    const proc = spawn('agentiqa', ['run', '--url', url, '--plan', planPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    const job: Job = {
      id: jobId,
      type: 'run',
      status: 'running',
      process: proc,
      stdout: '',
      stderr: '',
      result: null,
      startedAt: Date.now(),
      actions: 0,
      issues: 0,
    }

    proc.stdout?.on('data', (chunk: Buffer) => {
      job.stdout += chunk.toString()
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      job.stderr += chunk.toString()
    })

    proc.on('close', (code) => {
      job.status = code === 0 ? 'done' : 'error'
      job.result = { exitCode: code, output: job.stdout, stderr: job.stderr }
    })

    proc.on('error', (err) => {
      job.status = 'error'
      job.result = { error: err.message }
    })

    jobs.set(jobId, job)

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            jobId,
            status: 'started',
            message: `Test plan run started. Use checkRunStatus("${jobId}") to poll.`,
          }),
        },
      ],
    }
  },
)

// Tool: checkRunStatus
server.tool(
  'checkRunStatus',
  'Check the status of a running Agentiqa test plan run.',
  {
    jobId: z.string().describe('The jobId returned by startRun'),
  },
  async ({ jobId }) => {
    const job = jobs.get(jobId)

    if (!job) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: `Job ${jobId} not found` }) }],
      }
    }

    if (job.status === 'running') {
      const elapsed = Math.round((Date.now() - job.startedAt) / 1000)
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              jobId,
              status: 'running',
              elapsedSeconds: elapsed,
            }),
          },
        ],
      }
    }

    const result = job.result || {}
    jobs.delete(jobId)

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            jobId,
            status: job.status,
            ...result,
          }),
        },
      ],
    }
  },
)

// Tool: getArtifacts
server.tool(
  'getArtifacts',
  'List artifact files (screenshots, video) from a completed Agentiqa run.',
  {
    artifactsDir: z.string().describe('Path to the artifacts directory from the explore/run result'),
  },
  async ({ artifactsDir }) => {
    try {
      if (!fs.existsSync(artifactsDir)) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Directory not found' }) }],
        }
      }

      const files = fs.readdirSync(artifactsDir).map((f) => {
        const stat = fs.statSync(path.join(artifactsDir, f))
        return { name: f, sizeBytes: stat.size }
      })

      const video = files.find((f) => f.name.endsWith('.mp4'))
      const screenshots = files.filter((f) => f.name.endsWith('.png'))

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              artifactsDir,
              videoPath: video ? path.join(artifactsDir, video.name) : null,
              screenshots: screenshots.map((s) => path.join(artifactsDir, s.name)),
              totalFiles: files.length,
            }),
          },
        ],
      }
    } catch (err: any) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }],
      }
    }
  },
)

// ── Start server ──

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(console.error)
