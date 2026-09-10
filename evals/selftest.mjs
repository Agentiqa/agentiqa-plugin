#!/usr/bin/env node
/**
 * Grader self-test — the check that keeps the eval suite honest without paying for
 * a model run.
 *
 * `claude plugin eval` scores a real agent. That is the point, but it also means a
 * grader that can never fail (a typo'd regex, a pattern that matches every log)
 * shows up as a green suite. This script proves DISCRIMINATION instead: for each
 * case it drives the recording stub through a KNOWN-GOOD transcript and one or more
 * KNOWN-BAD ones, then asserts that
 *
 *   - every log-reading grader passes on the good transcript,
 *   - each bad transcript is caught by at least one grader, and
 *   - an otherwise-perfect transcript that reaches around the stub (`npx -y
 *     agentiqa@latest …`) is caught too — the hermeticity shims in `_shim/`
 *     refuse it and leave a marker in the very log the graders read.
 *
 * It needs no plugin-eval access, no model, and no network — so it runs in CI and
 * it runs today, while `plugin eval` itself is early-access-gated.
 *
 *   node evals/selftest.mjs [--verbose]
 *
 * Exit 0 all cases discriminate · 1 a grader is vacuous or a good path is rejected.
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const EVALS = dirname(fileURLToPath(import.meta.url))
const STUB = join(EVALS, '_stub', 'agentiqa')
const SHIM = join(EVALS, '_shim')
const SHIMMED = ['npx', 'npm', 'pnpm', 'yarn', 'bunx', 'corepack', 'curl', 'wget']
const LOG_NAME = '.agentiqa-stub-log.jsonl'
const verbose = process.argv.includes('--verbose')

// ── a deliberately small case.yaml reader ───────────────────────────────────
//
// Not a YAML parser: it reads exactly the two blocks this suite authors —
// `execution.env` (flat EVAL_* string map) and `graders` (a list of flat maps).
// A general parser would be a dependency, and this file must stay dependency-free.

function unquote(v) {
  const s = v.trim()
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) {
    return s.slice(1, -1).replace(/''/g, "'")
  }
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) return s.slice(1, -1)
  return s
}

function readCase(dir) {
  const lines = readFileSync(join(dir, 'case.yaml'), 'utf8').split('\n')
  const env = {}
  const graders = []
  let mode = null
  let current = null
  let blockKey = null

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (!line) continue
    if (/^env:|^\s{2}env:/.test(line)) {
      mode = 'env'
      continue
    }
    if (/^graders:/.test(line)) {
      mode = 'graders'
      if (current) graders.push(current)
      current = null
      continue
    }
    if (/^[a-z_]+:/.test(line)) {
      // a new top-level key ends whatever block we were in
      if (mode === 'graders' && current) {
        graders.push(current)
        current = null
      }
      mode = null
      continue
    }
    if (mode === 'env') {
      const m = /^\s{4}([A-Z][A-Z0-9_]*):\s*(.*)$/.exec(line)
      if (m) env[m[1]] = unquote(m[2])
      continue
    }
    if (mode === 'graders') {
      const start = /^\s{2}-\s+([a-z_]+):\s*(.*)$/.exec(line)
      if (start) {
        if (current) graders.push(current)
        current = { [start[1]]: unquote(start[2]) }
        blockKey = null
        continue
      }
      const kv = /^\s{4}([a-z_]+):\s*(.*)$/.exec(line)
      if (kv && current) {
        const [, key, rawValue] = kv
        if (rawValue === '>' || rawValue === '|') {
          blockKey = key
          current[key] = ''
        } else {
          blockKey = null
          current[key] = unquote(rawValue)
        }
        continue
      }
      if (blockKey && current && /^\s{6}/.test(line)) {
        current[blockKey] += `${line.trim()} `
      }
    }
  }
  if (current) graders.push(current)
  return { env, graders }
}

/** Graders this script can evaluate: regex graders that read the stub's log. */
function logGraders(graders) {
  return graders.filter(
    (g) => g.type === 'regex' && (g.target ?? '').includes(LOG_NAME) && g.pattern,
  )
}

function gradeLog(grader, log) {
  const re = new RegExp(grader.pattern, grader.flags ?? '')
  const found = re.test(log)
  const match = grader.match ?? 'contains'
  if (match === 'contains') return found
  if (match === 'not_contains') return !found
  const count = /^count:(\d+)$/.exec(match)
  if (count) return (log.match(new RegExp(grader.pattern, `g${grader.flags ?? ''}`)) ?? []).length === Number(count[1])
  throw new Error(`unsupported match "${match}"`)
}

// ── replaying a transcript through the stub ─────────────────────────────────

function replay(env, transcript, { shimAttempt } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'agentiqa-eval-selftest-'))
  try {
    for (const argv of transcript) {
      const res = spawnSync(process.execPath, [STUB, ...argv], {
        cwd: dir,
        env: { ...process.env, ...env },
        encoding: 'utf8',
      })
      if (res.error) throw res.error
    }
    // The escape hatch the harness exists to close: a package runner reaching for
    // the published CLI. It appends its refusal to the same log.
    if (shimAttempt) {
      const [tool, ...args] = shimAttempt
      const res = spawnSync(join(SHIM, tool), args, {
        cwd: dir,
        env: { ...process.env, ...env },
        encoding: 'utf8',
      })
      if (res.error) throw res.error
    }
    const logPath = join(dir, LOG_NAME)
    return existsSync(logPath) ? readFileSync(logPath, 'utf8') : ''
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ── the hermeticity shims ───────────────────────────────────────────────────
//
// `_shim/*` is what stops the agent doing what it actually did once: bypassing
// the stub with `npx -y agentiqa@latest`, reaching the operator's real account,
// listing 16 live projects and rewriting ~/.agentiqa/config.json. Two properties
// have to hold or the shim is either useless or in the way:
//
//   refuses  — anything mentioning "agentiqa", exit 2, marker in the stub log
//   delegates — everything else, unchanged, to the real binary
//
// The second is checked against a fake binary planted on PATH, so this stays
// offline and does not depend on npx actually being installed.

const NPX_ESCAPE = ['npx', '-y', 'agentiqa@latest', 'project', 'list', '--json']

function checkShims() {
  let bad = 0
  const dir = mkdtempSync(join(tmpdir(), 'agentiqa-eval-shim-'))
  const fakeBin = mkdtempSync(join(tmpdir(), 'agentiqa-eval-fakebin-'))
  try {
    for (const tool of SHIMMED) {
      writeFileSync(join(fakeBin, tool), `#!/bin/sh\necho "FAKE-${tool}-OK $*"\n`, { mode: 0o755 })
      // PATH deliberately still contains SHIM: the guard has to strip itself out
      // when it resolves the real binary, or it re-execs forever.
      const PATH = [SHIM, fakeBin, process.env.PATH].join(':')

      const refused = spawnSync(join(SHIM, tool), NPX_ESCAPE.slice(1), {
        cwd: dir,
        env: { ...process.env, PATH },
        encoding: 'utf8',
      })
      if (refused.status !== 2) {
        console.error(`✗ shim ${tool}: an agentiqa invocation exited ${refused.status}, expected 2`)
        bad++
      }
      if (!/hermetic eval: real CLI forbidden/.test(refused.stderr ?? '')) {
        console.error(`✗ shim ${tool}: refusal did not say why (stderr: ${JSON.stringify(refused.stderr)})`)
        bad++
      }

      const passed = spawnSync(join(SHIM, tool), ['--version'], {
        cwd: dir,
        env: { ...process.env, PATH },
        encoding: 'utf8',
      })
      if (passed.status !== 0 || !passed.stdout.includes(`FAKE-${tool}-OK`)) {
        console.error(
          `✗ shim ${tool}: an unrelated invocation was not passed through (exit ${passed.status}, stdout ${JSON.stringify(passed.stdout)})`,
        )
        bad++
      } else if (verbose) {
        console.error(`  ok  shim ${tool} · refuses agentiqa (exit 2) · delegates everything else`)
      }
    }

    const logPath = join(dir, LOG_NAME)
    const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : ''
    for (const tool of SHIMMED) {
      if (!new RegExp(`"hermeticViolation":"${tool}"`).test(log)) {
        console.error(`✗ shim ${tool}: refusal left no marker in ${LOG_NAME} — graders cannot see it`)
        bad++
      }
    }
    // The attempt must be recorded as a flat string. As a JSON argv array, an
    // escaped `npx … project create --url …` would satisfy the very graders it
    // was cheating past.
    if (/"hermeticViolation"[^\n]*"argv"/.test(log)) {
      console.error(`✗ shim: the attempt is logged as an argv array — positive graders would match it`)
      bad++
    }
    if (verbose) console.error(`  ${SHIMMED.length} shims exercised\n`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(fakeBin, { recursive: true, force: true })
  }
  return bad
}

// ── the transcripts ─────────────────────────────────────────────────────────
//
// `good` is what the skill tells an agent to do. Every `bad` entry is a real
// failure mode the skill's text argues against — if a bad transcript scores clean,
// the case is not testing the thing it claims to test.

const CASES = [
  {
    dir: '01-create-and-run',
    good: [
      ['project', 'create', '--url', 'https://staging.shop.dev', '--name', 'shop-staging', '--json'],
      ['plan', 'list', '--project', 'proj_stub_shop_staging', '--json'],
      ['run', '--plan-id', 'tp_stub_login', '--project', 'proj_stub_shop_staging', '--json'],
    ],
    bad: {
      'trusted the repo config instead of creating': [
        ['run', '--plan-id', 'tp_stub_login', '--project', 'proj_decoy_do_not_use', '--json'],
      ],
      'invented a flag': [
        ['project', 'create', '--url', 'https://staging.shop.dev', '--target', 'web', '--json'],
      ],
      'created but never used the id': [
        ['project', 'create', '--url', 'https://staging.shop.dev', '--name', 'shop-staging', '--json'],
      ],
      'skipped --json': [
        ['project', 'create', '--url', 'https://staging.shop.dev', '--name', 'shop-staging'],
        ['run', '--plan-id', 'tp_stub_login', '--project', 'proj_stub_shop_staging', '--json'],
      ],
    },
  },
  {
    dir: '02-create-idempotent',
    good: [
      ['project', 'create', '--url', 'https://staging.shop.dev', '--name', 'shop-staging', '--if-not-exists', '--json'],
      ['run', '--plan-id', 'tp_stub_login', '--project', 'proj_stub_shop_staging', '--json'],
    ],
    alsoGood: {
      'recovered from name_conflict via existing.id': [
        ['project', 'create', '--url', 'https://staging.shop.dev', '--name', 'shop-staging', '--json'],
        ['run', '--plan-id', 'tp_stub_login', '--project', 'proj_stub_shop_staging', '--json'],
      ],
    },
    bad: {
      'minted a twin under a mangled name': [
        ['project', 'create', '--url', 'https://staging.shop.dev', '--name', 'shop-staging', '--json'],
        ['project', 'create', '--url', 'https://staging.shop.dev', '--name', 'shop-staging-2', '--json'],
      ],
      'listed to find the id the error already carried': [
        ['project', 'create', '--url', 'https://staging.shop.dev', '--name', 'shop-staging', '--json'],
        ['project', 'list', '--json'],
        ['run', '--plan-id', 'tp_stub_login', '--project', 'proj_stub_shop_staging', '--json'],
      ],
      'retried create three times': [
        ['project', 'create', '--url', 'https://staging.shop.dev', '--name', 'shop-staging', '--json'],
        ['project', 'create', '--url', 'https://staging.shop.dev', '--name', 'shop-staging', '--json'],
        ['project', 'create', '--url', 'https://staging.shop.dev', '--name', 'shop-staging', '--if-not-exists', '--json'],
      ],
    },
  },
  {
    dir: '03-switch-and-run',
    good: [
      ['project', 'list', '--json'],
      ['project', 'use', 'proj_stub_shop_prod', '--json'],
      ['run', '--plan-id', 'tp_123', '--json'],
    ],
    alsoGood: {
      'per-command override instead of a stored switch': [
        ['project', 'list', '--json'],
        ['run', '--plan-id', 'tp_123', '--project', 'proj_stub_shop_prod', '--json'],
      ],
    },
    bad: {
      'ran in the remembered staging project': [
        ['project', 'current', '--json'],
        ['run', '--plan-id', 'tp_123', '--json'],
      ],
      'created a prod project instead of finding it': [
        ['project', 'create', '--url', 'https://shop.dev', '--name', 'shop-prod', '--json'],
        ['run', '--plan-id', 'tp_123', '--project', 'proj_stub_shop_prod', '--json'],
      ],
      'took the id from the repo': [
        ['project', 'use', 'proj_decoy_do_not_use', '--json'],
        ['run', '--plan-id', 'tp_123', '--json'],
      ],
    },
  },
  {
    dir: '04-which-project',
    good: [
      ['project', 'current', '--json'],
      ['project', 'get', 'proj_stub_shop_staging', '--json'],
    ],
    alsoGood: {
      'list instead of get for the URL': [
        ['project', 'current', '--json'],
        ['project', 'list', '--json'],
      ],
    },
    bad: {
      'answered a question by switching': [
        ['project', 'current', '--json'],
        ['project', 'use', 'proj_stub_shop_staging', '--json'],
      ],
      'never asked the CLI at all': [],
      'only asked current, so it cannot know the URL': [['project', 'current', '--json']],
    },
  },
]

// ── run ─────────────────────────────────────────────────────────────────────

let failures = checkShims()

for (const c of CASES) {
  const dir = join(EVALS, c.dir)
  const { env, graders } = readCase(dir)
  const checked = logGraders(graders)
  if (checked.length === 0) {
    console.error(`✗ ${c.dir}: no log-reading regex graders parsed out of case.yaml`)
    failures++
    continue
  }

  const goodPaths = { good: c.good, ...(c.alsoGood ?? {}) }
  for (const [label, transcript] of Object.entries(goodPaths)) {
    const log = replay(env, transcript)
    const rejected = checked.filter((g) => !gradeLog(g, log))
    if (rejected.length) {
      console.error(
        `✗ ${c.dir}: correct path "${label}" is rejected by ${rejected.map((g) => g.name).join(', ')}`,
      )
      failures++
    } else if (verbose) {
      console.error(`  ok  ${c.dir} · correct path "${label}" passes all ${checked.length} graders`)
    }
  }

  for (const [label, transcript] of Object.entries(c.bad)) {
    const log = replay(env, transcript)
    const caughtBy = checked.filter((g) => !gradeLog(g, log)).map((g) => g.name)
    if (caughtBy.length === 0) {
      console.error(`✗ ${c.dir}: failure mode "${label}" scores CLEAN — no grader catches it`)
      failures++
    } else if (verbose) {
      console.error(`  ok  ${c.dir} · "${label}" caught by ${caughtBy.join(', ')}`)
    }
  }

  // Automatic FAIL on a breach: take the transcript that passes everything, add
  // one reach-around, and the case must stop being green.
  const escaped = replay(env, c.good, { shimAttempt: NPX_ESCAPE })
  const escapeCaughtBy = checked.filter((g) => !gradeLog(g, escaped)).map((g) => g.name)
  if (escapeCaughtBy.length === 0) {
    console.error(
      `✗ ${c.dir}: a correct-looking run that escaped the stub via \`npx -y agentiqa@latest\` scores CLEAN`,
    )
    failures++
  } else if (verbose) {
    console.error(`  ok  ${c.dir} · "escaped the stub via npx" caught by ${escapeCaughtBy.join(', ')}`)
  }

  if (verbose) console.error(`  ${c.dir}: ${checked.length} log graders exercised\n`)
}

if (failures === 0) {
  console.log(
    `OK — ${CASES.length} cases: every documented path passes and every failure mode is caught; ` +
      `${SHIMMED.length} hermeticity shims refuse the real CLI and a breach fails every case.`,
  )
  process.exit(0)
}
console.error(`\n${failures} problem(s).`)
process.exit(1)
