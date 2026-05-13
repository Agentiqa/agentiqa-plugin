# Agentiqa for VS Code

AI-powered testing for web and mobile apps. An AI agent explores your app like a real user and reports bugs with reproduction steps, screenshots, and video.

## What it finds

- Visual bugs (layout issues, overflow, contrast problems)
- Logical bugs (broken validation, stale state, wrong behavior)
- UX issues (confusing flows, missing feedback)
- Accessibility problems

Each issue includes severity, category, confidence score, and step-by-step reproduction instructions.

## Quick start

1. Install the extension
2. On first activation, the extension automatically:
   - Installs the Agentiqa CLI
   - Opens browser for authentication
   - Installs Chromium for headless testing
   - Detects ffmpeg for video recording
3. **Cmd+Shift+P** → **"Agentiqa: Test URL"** → paste your URL
4. Results appear in the terminal with issues, screenshots, and video

## Usage

### Command Palette

- **Agentiqa: Test URL** — enter a URL to test, runs explore in terminal
- **Agentiqa: Setup** — manually re-run CLI install, auth, and browser setup

### Copilot Chat

Ask Copilot to test your app:

> "test https://example.com/pricing for bugs"

Copilot will run `agentiqa explore` in the terminal and present the results.

### MCP Tools (Agent Mode)

The extension registers an MCP server with these tools:

| Tool | Description |
|------|-------------|
| `startExplore` | Start an AI testing agent against a URL. Returns jobId immediately. |
| `checkExploreStatus` | Poll for progress and results of a running explore. |
| `startRun` | Start a test plan run against a URL. Returns jobId. |
| `checkRunStatus` | Poll for progress and results of a running test plan. |
| `getArtifacts` | List screenshots and video from a completed run. |

## Artifacts

Each test run produces:
- **Screenshots** — one per agent action (always saved)
- **Video** — MP4 recording of the full session (requires ffmpeg)

Install ffmpeg for video recording:
```bash
brew install ffmpeg
```

Without ffmpeg, tests still work — screenshots are saved as fallback.

## Requirements

- VS Code 1.99+
- Node.js 18+
- Internet connection (for CLI install and testing)

## Links

- [Agentiqa](https://agentiqa.com)
- [CLI on npm](https://www.npmjs.com/package/agentiqa)
- [Plugin repo](https://github.com/Agentiqa/agentiqa-plugin)
