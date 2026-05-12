# Agentiqa CLI Plugin

AI-powered testing for web and mobile apps. An AI agent explores your app like a real user and reports bugs with reproduction steps + media artifacts (screenshots, video when ffmpeg is available).

Use it from a coding agent (Claude Code, Cursor), from a terminal, or as a CI step.

## What it finds

- Visual bugs (layout issues, overflow, contrast problems)
- Logical bugs (broken validation, stale state, wrong behavior)
- UX issues (confusing flows, missing feedback)
- Accessibility problems

Each issue includes severity, category, confidence score, and step-by-step reproduction instructions.

[Learn more](https://agentiqa.com/en)

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

### Other / Terminal

```bash
npm install -g agentiqa
agentiqa login
```

## Example

### Coding Agents

Once the plugin is installed, ask the assistant in natural language:

> "Test the login page for bugs"

> "QA the checkout flow on http://localhost:3000/checkout"

> "Find bugs in the Settings screen on Android"

The skill runs `agentiqa explore` in the background and presents results when done:

```
Done — 12 actions, 0 issues in 84s
Verdict: ship
Artifacts: /tmp/agentiqa-abc123 (12 screenshots)
```

### CI

Run saved test plans non-interactively with a service key — drop into any build step:

```bash
AGENTIQA_SERVICE_KEY=sk_… agentiqa run --label-ids regression
```

The Test Plans page in the [Agentiqa app](https://agentiqa.com) has a **CLI** button that builds the exact one-liner for the plans you select. See [`docs/ci-quickstart.md`](docs/ci-quickstart.md) for the full walkthrough.

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
