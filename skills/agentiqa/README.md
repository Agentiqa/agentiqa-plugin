# Agentiqa agent skill

A user-facing [agent skill](https://docs.agentiqa.com/docs/agent-skill) that teaches
an AI coding agent (Claude Code and compatible agents) how to drive
[Agentiqa](https://agentiqa.com) — the AI QA agent for web apps — across all four
surfaces: the CLI, the web app, the desktop app, and the GitHub Action. That
includes the interactive plan-authoring loop — explore, review the draft in chat,
save on approval, run, and revise a saved plan by id.

Progressive disclosure: a compact `SKILL.md` with the essentials, bundled
`references/` files (CLI, service keys, JSON envelope, exit codes, quickstarts,
GitHub Action), and a delegation to `https://docs.agentiqa.com/llms-full.txt` for
anything unbundled.

## Install (Claude Code)

Ships with the Agentiqa plugin:

```
/plugin marketplace add Agentiqa/agentiqa-plugin
/plugin install agentiqa@agentiqa
```

The agent loads it on demand when you ask to test an app with Agentiqa, run
`agentiqa` in CI, or parse an Agentiqa result.

## Contents

```
agentiqa/
├── SKILL.md                 # entry point (progressive disclosure)
└── references/
    ├── quickstarts.md       # first-run for all four surfaces
    ├── cli.md               # explore / run / plan / runs / auth, flags, engine modes
    ├── service-keys.md      # minting + using sk_ keys
    ├── github-action.md     # agentiqa/qa-action@v1
    ├── json-envelope.md     # schemaVersion:1 result shape
    └── exit-codes.md        # the 4-code contract + retry-on-3
```

The stable essentials are bundled here; the live docs
(`https://docs.agentiqa.com`) are the source of truth for anything newer.
