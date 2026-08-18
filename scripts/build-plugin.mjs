#!/usr/bin/env node
/**
 * 编译插件源码 → lib/（CJS bundle）
 *
 * 用法: node scripts/build-plugin.mjs <插件目录>
 *   node scripts/build-plugin.mjs plugins-example/hello-cordis
 *
 * 产物:
 *   <插件目录>/lib/index.js   — HOST 半端（主进程 Cordis 运行）
 *   <插件目录>/lib/client.js  — CLIENT 半端（渲染进程页面挂载，可选）
 *
 * 运行时直接 require lib/*.js，零 esbuild/零 spawn。
 * 宿主提供的模块 external（由宿主 require 提供）。
 */
import { build } from 'esbuild'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const pluginDir = process.argv[2]
if (!pluginDir) {
  console.error('用法: node scripts/build-plugin.mjs <插件目录>')
  process.exit(1)
}

const absDir = path.resolve(pluginDir)

// 宿主提供的模块（external，运行时由宿主 require）
// 插件不直接 import dsh-tools/cordis（defineTool 由 ctx.get('defineTool') 注入）
const HOST_MODULES = [
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/cordis',
  'react',
  'react-dom',
  'lucide-react',
]

const outDir = path.join(absDir, 'lib')

// ---- HOST 半端: src/index.ts → lib/index.js ----
const hostSrc = path.join(absDir, 'src', 'index.ts')
const hostSrcJs = path.join(absDir, 'src', 'index.js')
const hostEntry = existsSync(hostSrc) ? hostSrc : hostSrcJs
if (existsSync(hostEntry)) {
  await build({
    entryPoints: [hostEntry],
    bundle: true,
    outfile: path.join(outDir, 'index.js'),
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    external: HOST_MODULES,
    sourcemap: false,
    minify: false,
  })
  console.log(`✅ HOST: ${path.join(outDir, 'index.js')}`)
} else {
  console.log('⚠️ 无 src/index.ts（跳过 HOST 半端）')
}

// ---- CLIENT 半端: src/client.ts(x) → lib/client.js ----
const clientCandidates = ['src/client.tsx', 'src/client.ts', 'src/client.jsx', 'src/client.js']
const clientEntry = clientCandidates
  .map((c) => path.join(absDir, c))
  .find((p) => existsSync(p))
if (clientEntry) {
  await build({
    entryPoints: [clientEntry],
    bundle: true,
    outfile: path.join(outDir, 'client.js'),
    format: 'cjs',
    platform: 'browser',
    target: 'es2020',
    jsx: 'automatic',
    external: HOST_MODULES,
    sourcemap: false,
    minify: false,
  })
  console.log(`✅ CLIENT: ${path.join(outDir, 'client.js')}`)
} else {
  console.log('ℹ️ 无 src/client.ts(x)（无页面挂载）')
}
