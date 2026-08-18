#!/usr/bin/env node
/**
 * 编译单个插件源码 → lib/index.js（CJS bundle）
 *
 * 用法: node scripts/build-plugin.mjs <插件目录>
 *   node scripts/build-plugin.mjs plugins-example/hello-cordis
 *
 * 产物: <插件目录>/lib/index.js  — 运行时直接 require，零 esbuild/零 spawn
 * 插件 package.json 里 dependencies 只用于宿主提供的包名（external）
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
const srcEntry = path.join(absDir, 'src', 'index.ts')
const jsEntry = path.join(absDir, 'src', 'index.js')

// 入口文件（ts 优先）
let entry = srcEntry
if (!existsSync(srcEntry)) {
  entry = jsEntry
  if (!existsSync(jsEntry)) {
    console.error(`未找到 src/index.ts 或 src/index.js: ${absDir}`)
    process.exit(1)
  }
}

// 宿主提供的模块（external，运行时由宿主 require）
// 对齐 hostModules / cordisRuntime 提供的服务
const HOST_MODULES = [
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/cordis',
  'react',
  'react-dom',
  'lucide-react',
]

await build({
  entryPoints: [entry],
  bundle: true,
  outfile: path.join(absDir, 'lib', 'index.js'),
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  external: HOST_MODULES,
  sourcemap: false,
  minify: false,
})

console.log(`✅ 编译完成: ${path.join(absDir, 'lib', 'index.js')}`)
