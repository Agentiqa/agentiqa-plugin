# Agentiqa Plugin

AI-powered testing for web and mobile apps. An AI agent explores your app like a real user and reports bugs with reproduction steps.

Three ways to use it:

- **From your terminal** — `agentiqa explore <url>`, `agentiqa run --plan ...`, or as a CI/CD step.
- **In your IDE** — Claude Code, Cursor, Codex (this repo ships the plugin).
- **From the [Agentiqa app](https://agentiqa.com)** — manage saved test plans visually, then trigger them from a terminal with one paste.

## What it finds

- Visual bugs (layout issues, overflow, contrast problems)
- Logical bugs (broken validation, stale state, wrong behavior)
- UX issues (confusing flows, missing feedback)
- Accessibility problems

Each issue includes severity, category, confidence score, and step-by-step reproduction instructions.

[Learn more](https://agentiqa.com/en)

## Quick start — terminal

```bash
npm install -g agentiqa
agentiqa login
agentiqa explore --url https://your-site.com
```

Playwright Chromium is auto-installed with the CLI. `agentiqa login` opens a browser to authenticate; the token persists in `~/.agentiqa/credentials.json`.

Example output:

```
Done — 12 actions, 0 issues in 84s
Verdict: ship
Artifacts: /tmp/agentiqa-abc123 (12 screenshots)
```

## CI/CD usage

Once logged in (or with `AGENTIQA_SERVICE_KEY` set), `agentiqa run` executes a saved plan and exits with a non-zero status on failure — drop it into any build step:

```bash
AGENTIQA_SERVICE_KEY=sk_… agentiqa run --label-ids regression
```

The Test Plans page in the [Agentiqa app](https://agentiqa.com) has a **CLI** button that generates the exact one-liner for the plans you select. See [`docs/cli-quickstart.md`](docs/cli-quickstart.md) for the walkthrough with screenshots.

## Use in your IDE

The CLI also powers a plugin for AI coding tools — once installed, you ask the assistant to test something in natural language and it runs `agentiqa explore` in the background.

### Claude Code

```
/plugin marketplace add agentiqa/agentiqa-plugin
/plugin install agentiqa@agentiqa
```

### Cursor

```
/add-plugin https://github.com/Agentiqa/agentiqa-plugin
```

The plugin auto-installs the Agentiqa CLI and prompts for `agentiqa login` on first use. If auto-install fails, install manually with the **Quick start — terminal** snippet above.

### Examples

> "Test the login page for bugs"

> "QA the checkout flow on http://localhost:3000/checkout"

> "Find bugs in the Settings screen on Android"

### Cursor notes

- Tests run in **background mode** — no shell timeout issues even for long runs (3-10 min).
- Parallel testing supported — ask Cursor to test multiple pages at once.
- Results include JSON with issues, severity, confidence, and reproduction steps.

## Setup details

### For mobile testing

- **Android**: Running emulator (`adb devices` shows it)
- **iOS**: Running simulator (`xcrun simctl list devices` shows it)

### For video recording (optional)

Install ffmpeg to enable video recording of test sessions:

```bash
brew install ffmpeg
```

Without ffmpeg, tests still work — screenshots are saved as fallback.

## Links

- [Agentiqa](https://agentiqa.com)
- [CLI on npm](https://www.npmjs.com/package/agentiqa)
