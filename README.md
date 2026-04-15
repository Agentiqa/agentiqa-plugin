# Agentiqa Plugin

AI-powered testing for web and mobile apps. An AI agent explores your app like a real user and reports bugs with reproduction steps.

Works with **Claude Code** and **Cursor**.

## Install

### Claude Code

```
/plugin marketplace add agentiqa/agentiqa-plugin
/plugin install agentiqa@agentiqa
```

### Cursor

```
/add-plugin https://github.com/Agentiqa/agentiqa-plugin
```

## Setup

The plugin automatically installs the Agentiqa CLI and prompts for authentication on first session start.

If auto-install fails, run manually:

```bash
npm install -g agentiqa
agentiqa login
```

### For mobile testing

- **Android**: Running emulator (`adb devices` shows it)
- **iOS**: Running simulator (`xcrun simctl list devices` shows it)

### For web testing

Playwright Chromium is auto-installed with the CLI (`npm install -g agentiqa`). No extra steps needed.

## Usage

Once installed, both Claude Code and Cursor automatically use the skill when you ask to test your app:

> "Test the login page for bugs"

> "QA the checkout flow on http://localhost:3000/checkout"

> "Find bugs in the Settings screen on Android"

> "Use agentiqa to test https://example.com/pricing"

The skill runs `agentiqa explore` in the background and presents results when done.

### Cursor notes

- Tests run in **background mode** — no shell timeout issues even for long runs (3-10 min)
- Parallel testing supported — ask Cursor to test multiple pages at once
- Results include JSON with issues, severity, confidence, and reproduction steps

## What it finds

- Visual bugs (layout issues, overflow, contrast problems)
- Logical bugs (broken validation, stale state, wrong behavior)
- UX issues (confusing flows, missing feedback)
- Accessibility problems

Each issue includes severity, category, confidence score, and step-by-step reproduction instructions.

## Example (Cursor)

```
use agentiqa to test https://s.agentiqa.com/en/pricing
```

Output:
```
Done — 12 actions, 0 issues in 84s
Verdict: ship
Artifacts: 12 screenshots saved
```

## Links

- [Agentiqa](https://agentiqa.com)
- [CLI on npm](https://www.npmjs.com/package/agentiqa)
