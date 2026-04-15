# Agentiqa Plugin for Claude Code

AI-powered testing for web and mobile apps. An AI agent explores your app like a real user and reports bugs with reproduction steps.

## Install

```
/plugin marketplace add agentiqa/agentiqa-plugin
/plugin install agentiqa@agentiqa
```

## Setup

The plugin automatically installs the Agentiqa CLI and prompts for authentication on first session start. No manual setup required.

If auto-install fails, run manually:

```bash
npm install -g agentiqa
agentiqa login
```

### For mobile testing

- **Android**: Running emulator (`adb devices` shows it)
- **iOS**: Running simulator (`xcrun simctl list devices` shows it)

### For web testing

Playwright is auto-installed on first web test.

## Usage

Once installed, Claude Code automatically uses the skill when you ask it to test your app:

> "Test the login page for bugs"

> "QA the checkout flow on http://localhost:3000/checkout"

> "Find bugs in the Settings screen on Android"

The skill runs `agentiqa explore` in the background and presents results when done.

## What it finds

- Visual bugs (layout issues, overflow, contrast problems)
- Logical bugs (broken validation, stale state, wrong behavior)
- UX issues (confusing flows, missing feedback)
- Accessibility problems

Each issue includes severity, category, confidence score, and step-by-step reproduction instructions.

## Links

- [Agentiqa](https://agentiqa.com)
- [CLI on npm](https://www.npmjs.com/package/agentiqa)
