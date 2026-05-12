import * as esbuild from 'esbuild'

const watch = process.argv.includes('--watch')

// Build extension
await esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
})

// Build MCP server
await esbuild.build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  outfile: 'dist/server.js',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
})

console.log('Built dist/extension.js + dist/server.js')
