import * as vscode from 'vscode'
import * as path from 'path'
import { exec } from 'child_process'

function runCmd(cmd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 300_000 }, (err, stdout, stderr) => {
      resolve({ stdout: stdout || '', stderr: stderr || '', code: err?.code ?? 0 })
    })
  })
}

async function ensureSetup(channel: vscode.OutputChannel): Promise<boolean> {
  // 1. Check CLI
  const cliCheck = await runCmd('agentiqa whoami')
  if (cliCheck.code !== 0 && cliCheck.stderr.includes('not found')) {
    channel.appendLine('[agentiqa] Installing CLI...')
    const install = await runCmd('npm install -g agentiqa')
    if (install.code !== 0) {
      vscode.window.showErrorMessage(
        'Agentiqa: Failed to install CLI. Run manually: npm install -g agentiqa',
      )
      return false
    }
    channel.appendLine('[agentiqa] CLI installed')
  }

  // 2. Check auth
  const authCheck = await runCmd('agentiqa whoami')
  if (authCheck.code !== 0) {
    channel.appendLine('[agentiqa] Not logged in — opening browser for auth...')
    vscode.window.showInformationMessage(
      'Agentiqa: Please log in. A browser window will open.',
    )
    const login = await runCmd('agentiqa login')
    if (login.code !== 0) {
      vscode.window.showWarningMessage(
        'Agentiqa: Login failed or timed out. Run manually: agentiqa login',
      )
      return false
    }
    channel.appendLine('[agentiqa] Logged in')
  } else {
    channel.appendLine(`[agentiqa] Logged in as ${authCheck.stdout.trim().split('\n')[0]}`)
  }

  // 3. Install Chromium headless shell using CLI's bundled Playwright version
  const agentiqaPath = (await runCmd('which agentiqa')).stdout.trim()
  // Resolve symlink: /opt/homebrew/bin/agentiqa -> ../lib/node_modules/agentiqa/dist/cli.js
  const realPath = (await runCmd(`readlink -f "${agentiqaPath}" 2>/dev/null || readlink "${agentiqaPath}" 2>/dev/null || echo "${agentiqaPath}"`)).stdout.trim()
  // Walk up from dist/cli.js to package root
  const agentiqaDir = realPath.includes('/dist/cli.js')
    ? realPath.replace(/\/dist\/cli\.js$/, '')
    : agentiqaPath.replace(/\/bin\/agentiqa$/, '/lib/node_modules/agentiqa')

  channel.appendLine('[agentiqa] Installing Chromium browser...')
  // Use CLI's own playwright binary to install the exact version it needs
  const pwBin = `${agentiqaDir}/node_modules/.bin/playwright`
  const pwExists = (await runCmd(`test -f "${pwBin}" && echo ok`)).stdout.trim() === 'ok'
  const installCmd = pwExists
    ? `"${pwBin}" install chromium-headless-shell`
    : `cd "${agentiqaDir}" && npx playwright install chromium-headless-shell`
  const pwInstall = await runCmd(installCmd)
  if (pwInstall.code !== 0) {
    // Fallback: try regular chromium from CLI's playwright
    const fallbackCmd = pwExists
      ? `"${pwBin}" install chromium`
      : 'npx playwright install chromium'
    const fallback = await runCmd(fallbackCmd)
    if (fallback.code !== 0) {
      channel.appendLine('[agentiqa] Chromium install failed — will install on first run')
    } else {
      channel.appendLine('[agentiqa] Chromium installed (fallback)')
    }
  } else {
    channel.appendLine('[agentiqa] Chromium headless shell installed')
  }

  // 4. Check ffmpeg (optional)
  const ffmpegCheck = await runCmd('which ffmpeg')
  if (ffmpegCheck.code !== 0) {
    channel.appendLine('[agentiqa] ffmpeg not found — video recording disabled. Install with: brew install ffmpeg')
  } else {
    channel.appendLine('[agentiqa] ffmpeg available — video recording enabled')
  }

  return true
}

export function activate(context: vscode.ExtensionContext) {
  const channel = vscode.window.createOutputChannel('Agentiqa')
  const serverPath = path.join(context.extensionPath, 'dist', 'server.js')
  const didChangeEmitter = new vscode.EventEmitter<void>()

  // Auto-setup on activation
  ensureSetup(channel).then((ok) => {
    if (ok) {
      channel.appendLine('[agentiqa] Ready — MCP server registered')
    } else {
      channel.appendLine('[agentiqa] Setup incomplete — some features may not work')
    }
  })

  // Register MCP server
  context.subscriptions.push(
    vscode.lm.registerMcpServerDefinitionProvider('agentiqa', {
      onDidChangeMcpServerDefinitions: didChangeEmitter.event,
      provideMcpServerDefinitions: async () => {
        return [
          new vscode.McpStdioServerDefinition({
            label: 'Agentiqa',
            command: 'node',
            args: [serverPath],
            version: '0.1.0',
          }),
        ]
      },
      resolveMcpServerDefinition: async (server) => {
        return server
      },
    }),
  )

  // Register manual setup command
  context.subscriptions.push(
    vscode.commands.registerCommand('agentiqa.setup', async () => {
      channel.show()
      const ok = await ensureSetup(channel)
      if (ok) {
        vscode.window.showInformationMessage('Agentiqa: Setup complete!')
      }
    }),
  )

  // Register test command
  context.subscriptions.push(
    vscode.commands.registerCommand('agentiqa.testUrl', async () => {
      const url = await vscode.window.showInputBox({
        prompt: 'Enter URL to test',
        placeHolder: 'https://example.com',
      })
      if (!url) return

      // Quick pre-flight: ensure CLI is installed and authenticated
      const cliOk = await runCmd('command -v agentiqa')
      if (cliOk.code !== 0) {
        channel.appendLine('[agentiqa] CLI not found — installing...')
        const install = await runCmd('npm install -g agentiqa')
        if (install.code !== 0) {
          vscode.window.showErrorMessage('Agentiqa: Failed to install CLI. Run: npm install -g agentiqa')
          return
        }
        channel.appendLine('[agentiqa] CLI installed')
      }

      const authOk = await runCmd('agentiqa whoami')
      if (authOk.code !== 0) {
        channel.appendLine('[agentiqa] Not logged in — opening browser...')
        vscode.window.showInformationMessage('Agentiqa: Please log in. A browser window will open.')
        await runCmd('agentiqa login')
      }

      const terminal = vscode.window.createTerminal('Agentiqa')
      terminal.show()
      terminal.sendText(`agentiqa explore "Test this page for bugs" --url "${url}" --auto-approve --json`)
    }),
  )
}

export function deactivate() {}
