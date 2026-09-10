#!/usr/bin/env node
/**
 * Freshness gate: every `agentiqa <noun> [<verb>]` and every `--flag` the skills
 * document must exist in the CLI.
 *
 * The failure this prevents is specific and has happened: a skill documents a verb
 * a user's installed CLI does not have, the command exits 2 with `unknown
 * subcommand`, and it reads like a broken product rather than a stale install (the
 * `agentiqa labels create` case that motivated hooks/session-start). The skill text
 * and the CLI surface are in two repos, so nothing but a gate keeps them together.
 *
 * Two modes:
 *
 *   node scripts/check-skill-cli-freshness.mjs
 *       Hermetic. Checks against the committed fixtures/cli-help.txt snapshot.
 *       This is what CI runs — no network, no npm, no install.
 *
 *   node scripts/check-skill-cli-freshness.mjs --live
 *       Checks against the `agentiqa` binary on PATH: `agentiqa --help` plus
 *       `agentiqa <command> --help` for each documented command. Also asserts the
 *       binary is at least cli-requirements.json's minCliVersion. Use this before
 *       bumping the snapshot, and to prove the pinned version really carries what
 *       the skills claim.
 *
 * Extra flags: --snapshot <path>, --json, --verbose.
 *
 * Exit 0 clean · 1 drift found · 2 usage/environment problem.
 */

import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

/** Skill files whose prose is checked. Add new skill docs here. */
const SKILL_FILES = [
  'skills/agentiqa/SKILL.md',
  'skills/agentiqa/references/cli.md',
  'skills/agentiqa/references/cli-projects.md',
  'skills/agentiqa/references/exit-codes.md',
  'skills/agentiqa/references/json-envelope.md',
  'skills/agentiqa/references/quickstarts.md',
  'skills/agentiqa/references/service-keys.md',
  'skills/agentiqa/references/github-action.md',
  'skills/agentiqa-test/SKILL.md',
  'docs/ci-quickstart.md',
]

/**
 * Flags that appear in skill prose but belong to another tool, and command words
 * that are prose rather than CLI nouns. Each entry needs a reason — an allowlist
 * that grows without justification is how a gate stops gating.
 */
const FLAG_ALLOWLIST = new Map([
  ['--help', 'universal; not declared per-command in the schema'],
  ['--version', 'universal'],
  ['--file', 'declared under `plan`, also written bare in prose'],
  ['-y', 'npx flag, not an agentiqa flag'],
  ['--dry-run', 'declared under `explore`; also used in npx/playwright examples'],
  ['--config', 'GitHub Action input example, not a CLI flag'],
])

/** Words that follow `agentiqa` in prose but are not commands. */
const NOT_A_COMMAND = new Set([
  'skill',
  'project.', // sentence-final prose
  'cli',
  'run.', // prose
])

function fail(msg) {
  process.stderr.write(`check-skill-cli-freshness: ${msg}\n`)
  process.exit(2)
}

// ── the CLI surface ─────────────────────────────────────────────────────────

/**
 * The usage synopsis nests placeholders inside the subcommand alternation —
 * `<list | use <id|name> | current | get <id|name> | create --url <url>>` — so a
 * non-greedy `<([^>]*)>` truncates it at the first inner `>` and silently loses
 * every verb after the first one that takes an argument. Walk the angle brackets
 * with a depth counter instead, and split on `|` only at depth 0.
 *
 * Returns null when `rest` does not open with an alternation.
 */
function topLevelAlternatives(rest) {
  if (rest[0] !== '<') return null
  let depth = 0
  let inner = ''
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i]
    if (ch === '<') {
      depth++
      if (depth === 1) continue
    } else if (ch === '>') {
      depth--
      if (depth === 0) {
        const parts = []
        let buf = ''
        let d = 0
        for (const c of inner) {
          if (c === '<') d++
          else if (c === '>') d--
          if (c === '|' && d === 0) {
            parts.push(buf)
            buf = ''
            continue
          }
          buf += c
        }
        parts.push(buf)
        return parts
      }
    }
    inner += ch
  }
  return null
}

/**
 * Parse a `--help` dump into { commands: Map<name, Set<flag>>, common: Set<flag> }.
 *
 * The renderer (apps/cli/src/argSchema.ts:renderUsage) emits, in order:
 *   "Commands:" then two-column `<name>  <summary>` rows,
 *   "<Command> flags:" blocks, and a "Common flags:" block.
 * Flags are matched anywhere in a block by the leading-`--` token, which keeps the
 * parse tolerant of wrapped descriptions that themselves mention flags: a wrapped
 * description line is indented past the flag column, so it is only ever read for
 * flags of the block it is already in — and every flag it names is by construction
 * a real one.
 */
function parseHelp(text) {
  const commands = new Map()
  const subverbs = new Map()
  const common = new Set()
  let section = null // { kind: 'commands' | 'usage' } | { kind: 'flags', target: Set }
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\s+$/, '')
    if (!line) continue
    if (/^Usage:\s*$/.test(line)) {
      section = { kind: 'usage' }
      continue
    }
    if (/^Commands:\s*$/.test(line)) {
      section = { kind: 'commands' }
      continue
    }
    const flagsHeader = /^(.+) flags:\s*$/.exec(line)
    if (flagsHeader) {
      const label = flagsHeader[1].trim().toLowerCase()
      if (label === 'common') {
        section = { kind: 'flags', target: common }
      } else {
        if (!commands.has(label)) commands.set(label, new Set())
        section = { kind: 'flags', target: commands.get(label) }
      }
      continue
    }
    if (/^[A-Z][A-Za-z ()/<>|=-]*:\s*$/.test(line) && !/flags:$/.test(line)) {
      // "Usage:", "Environment variables:", "Exit codes:", "JSON output (…):"
      section = null
      continue
    }
    if (!section) continue
    if (section.kind === 'usage') {
      // "  agentiqa project <list | use <id|name> | current | get <id|name> | …>"
      const m = /^\s{2}agentiqa\s+([a-z][a-z-]*)\s*(.*)$/.exec(line)
      if (m) {
        const [, cmd, rest] = m
        if (!commands.has(cmd)) commands.set(cmd, new Set())
        if (!subverbs.has(cmd)) subverbs.set(cmd, new Set())
        const alternation = topLevelAlternatives(rest)
        if (alternation) {
          for (const alt of alternation) {
            const word = /^\s*([a-z][a-z-]*)/.exec(alt)
            if (word) subverbs.get(cmd).add(word[1])
          }
        } else {
          // "agentiqa runs get <plan-id> …" — a single mandatory subverb.
          const word = /^([a-z][a-z-]*)(?=\s|$)/.exec(rest)
          if (word) subverbs.get(cmd).add(word[1])
        }
      }
      continue
    }
    if (section.kind === 'commands') {
      const m = /^\s{2}([a-z][a-z-]*)\s{2,}\S/.exec(line)
      if (m && !commands.has(m[1])) commands.set(m[1], new Set())
      continue
    }
    for (const m of line.matchAll(/(?<![\w-])--([a-z][a-z0-9-]*)/g)) {
      section.target.add(`--${m[1]}`)
    }
  }
  return { commands, subverbs, common }
}

function helpFromSnapshot(snapshotPath) {
  if (!existsSync(snapshotPath)) fail(`snapshot not found: ${snapshotPath}`)
  return { text: readFileSync(snapshotPath, 'utf8'), label: relative(ROOT, snapshotPath) }
}

/**
 * Both streams, always. `agentiqa --help` prints its usage to STDERR and exits 0
 * (verified against 1.1.50), while `--version` prints to stdout — reading only one
 * stream makes the live mode silently see an empty CLI surface and "pass".
 */
function runCli(args) {
  const res = spawnSync('agentiqa', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  if (res.error) fail(`\`agentiqa ${args.join(' ')}\` failed: ${res.error.message}`)
  const out = `${res.stdout ?? ''}\n${res.stderr ?? ''}`
  if (!out.trim()) fail(`\`agentiqa ${args.join(' ')}\` produced no output`)
  return out
}

/**
 * `agentiqa <cmd> --help` currently renders the SAME global usage as `agentiqa
 * --help` (one schema, one renderer), so the per-command calls are belt-and-braces
 * against a future split into per-command help. `login` / `logout` are skipped: they
 * have side effects, and no `--help` contract is worth opening a browser over.
 */
const SIDE_EFFECTING = new Set(['login', 'logout', 'whoami'])

function helpFromLive(documentedCommands) {
  const parts = [runCli(['--help'])]
  for (const cmd of documentedCommands) {
    if (SIDE_EFFECTING.has(cmd)) continue
    parts.push(runCli([cmd, '--help']))
  }
  return { text: parts.join('\n'), label: 'live `agentiqa --help`' }
}

// ── the skills' claims ──────────────────────────────────────────────────────

/** Strip fenced code blocks? No — the recipes ARE the claims. Only drop URLs. */
function scrubbed(text) {
  return text.replace(/https?:\/\/\S+/g, ' ')
}

/**
 * Drop a skill file's YAML frontmatter before collecting claims, keeping the line
 * numbers of everything after it. `description:` is a trigger blurb aimed at the
 * skill router — "'agentiqa github action', 'agentiqa service key'" are phrases a
 * user might type, not commands the CLI has to implement. Grading them as claims
 * would make the gate fire on English.
 */
function stripFrontmatter(lines) {
  if (lines[0]?.trim() !== '---') return lines
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  if (end < 0) return lines
  return lines.map((l, i) => (i <= end ? '' : l))
}

/**
 * Every `agentiqa <command> [<subcommand>]` and every `--flag` a skill file writes,
 * with the file and line so a failure points at the sentence to fix.
 *
 * SUBCOMMANDS are collected only from CODE CONTEXTS — fenced blocks and inline
 * `code spans`. In prose, the word after a command is usually English ("run
 * `agentiqa project` in CI"), and grading that would make the gate fire on
 * sentences. In a code span it is a command the reader will paste.
 */
function collectClaims(files) {
  const commandClaims = [] // { command, subcommand, file, line, text }
  const flagClaims = [] // { flag, file, line, text }
  for (const rel of files) {
    const abs = join(ROOT, rel)
    if (!existsSync(abs)) continue
    const lines = stripFrontmatter(readFileSync(abs, 'utf8').split('\n'))
    let inFence = false
    lines.forEach((raw, i) => {
      if (/^\s*```/.test(raw)) {
        inFence = !inFence
        return
      }
      const line = scrubbed(raw)
      const codeText = inFence
        ? line
        : [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]).join(' \u0000 ')

      const record = (text, withSub) => {
        for (const m of text.matchAll(
          /(?<![\w-])agentiqa(?:@[\w.-]+)?\s+([a-z][a-z-]*)(?:\s+([a-z][a-z-]*))?/g,
        )) {
          const command = m[1]
          if (NOT_A_COMMAND.has(command)) continue
          commandClaims.push({
            command,
            subcommand: withSub ? (m[2] ?? null) : null,
            file: rel,
            line: i + 1,
            text: raw.trim(),
          })
        }
      }
      record(line, false)
      if (codeText) record(codeText, true)

      for (const m of line.matchAll(/(?<![\w-`])--([a-z][a-z0-9-]*)/g)) {
        flagClaims.push({ flag: `--${m[1]}`, file: rel, line: i + 1, text: raw.trim() })
      }
    })
  }
  return { commandClaims, flagClaims }
}

// ── main ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const live = argv.includes('--live')
const asJson = argv.includes('--json')
const verbose = argv.includes('--verbose')
const snapIdx = argv.indexOf('--snapshot')
const snapshotPath =
  snapIdx >= 0 ? join(ROOT, argv[snapIdx + 1] ?? '') : join(ROOT, 'fixtures/cli-help.txt')

const requirements = JSON.parse(readFileSync(join(ROOT, 'cli-requirements.json'), 'utf8'))
const minVersion = requirements.minCliVersion

const { commandClaims, flagClaims } = collectClaims(SKILL_FILES)
const documented = [...new Set(commandClaims.map((c) => c.command))]

const problems = []

if (live) {
  const raw = runCli(['--version']).trim().split('\n')[0].trim()
  const release = raw.split('-')[0]
  const cmp = (a, b) => {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < 3; i++) {
      if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
    }
    return 0
  }
  if (!/^\d+\.\d+\.\d+$/.test(release)) {
    problems.push({
      kind: 'version',
      message: `could not parse \`agentiqa --version\` output "${raw}"`,
    })
  } else if (cmp(release, minVersion) < 0) {
    problems.push({
      kind: 'version',
      message: `installed agentiqa ${raw} is below cli-requirements.json minCliVersion ${minVersion} — the skills document verbs it does not have. Run: npm install -g agentiqa@latest`,
    })
  }
}

const { text: helpText, label: helpLabel } = live
  ? helpFromLive(documented)
  : helpFromSnapshot(snapshotPath)
const surface = parseHelp(helpText)

if (surface.commands.size === 0) {
  fail(`parsed no commands out of ${helpLabel} — the help format changed, fix the parser`)
}

const knownFlags = new Set(surface.common)
for (const flags of surface.commands.values()) for (const f of flags) knownFlags.add(f)

for (const claim of commandClaims) {
  if (!surface.commands.has(claim.command)) {
    problems.push({
      kind: 'command',
      message: `\`agentiqa ${claim.command}\` is documented but absent from ${helpLabel}`,
      file: claim.file,
      line: claim.line,
      text: claim.text,
    })
    continue
  }
  // A subcommand is graded only when the CLI declares subcommands for that command
  // at all — `agentiqa run --json` has none, so the word after `run` is never one.
  const known = surface.subverbs.get(claim.command)
  if (claim.subcommand && known && known.size > 0 && !known.has(claim.subcommand)) {
    problems.push({
      kind: 'subcommand',
      message: `\`agentiqa ${claim.command} ${claim.subcommand}\` is documented but ${helpLabel} declares only: ${[...known].sort().join(' | ')}`,
      file: claim.file,
      line: claim.line,
      text: claim.text,
    })
  }
}

for (const claim of flagClaims) {
  if (FLAG_ALLOWLIST.has(claim.flag)) continue
  if (knownFlags.has(claim.flag)) continue
  problems.push({
    kind: 'flag',
    message: `\`${claim.flag}\` is documented but absent from ${helpLabel}`,
    file: claim.file,
    line: claim.line,
    text: claim.text,
  })
}

// Deduplicate: the same claim repeated across a file is one problem to fix.
const seen = new Set()
const unique = problems.filter((p) => {
  const key = `${p.kind}|${p.message}|${p.file ?? ''}|${p.line ?? ''}`
  if (seen.has(key)) return false
  seen.add(key)
  return true
})

if (asJson) {
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: unique.length === 0,
        mode: live ? 'live' : 'snapshot',
        source: helpLabel,
        minCliVersion: minVersion,
        commandsChecked: documented.sort(),
        subcommandsChecked: [
          ...new Set(
            commandClaims.filter((c) => c.subcommand).map((c) => `${c.command} ${c.subcommand}`),
          ),
        ].sort(),
        flagsChecked: [...new Set(flagClaims.map((f) => f.flag))].sort(),
        problems: unique,
      },
      null,
      2,
    )}\n`,
  )
} else {
  if (verbose) {
    process.stderr.write(
      `source: ${helpLabel}\ncommands in CLI: ${[...surface.commands.keys()].sort().join(', ')}\n` +
        `subcommands in CLI: ${[...surface.subverbs.entries()].filter(([, v]) => v.size).map(([k, v]) => `${k} <${[...v].sort().join('|')}>`).join(', ')}\n` +
        `commands documented: ${documented.sort().join(', ')}\n` +
        `flags documented: ${[...new Set(flagClaims.map((f) => f.flag))].sort().join(' ')}\n\n`,
    )
  }
  for (const p of unique) {
    const where = p.file ? `${p.file}:${p.line}: ` : ''
    process.stderr.write(`  ${where}${p.message}\n`)
    if (p.text) process.stderr.write(`      ${p.text}\n`)
  }
  if (unique.length === 0) {
    process.stdout.write(
      `OK — ${documented.length} commands and ${new Set(flagClaims.map((f) => f.flag)).size} flags documented by the skills all exist in ${helpLabel}.\n`,
    )
  } else {
    process.stderr.write(
      `\n${unique.length} problem(s). Either the skill text is ahead of the CLI, or ` +
        `fixtures/cli-help.txt is stale — refresh it with \`agentiqa --help > fixtures/cli-help.txt\` ` +
        `and bump cli-requirements.json's minCliVersion in the same commit.\n`,
    )
  }
}

process.exit(unique.length === 0 ? 0 : 1)
