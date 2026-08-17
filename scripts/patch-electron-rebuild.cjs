#!/usr/bin/env node
/**
 * patch-electron-rebuild.cjs
 *
 * 修复 @electron/rebuild@3.6.1 与 node-gyp@11+ 的兼容性 bug：
 * worker.js 用 util.promisify 调用 node-gyp 命令，但 node-gyp 11 的命令
 * 已是 async（返回 Promise），promisify 包装后回调永不触发 → 永远挂起。
 * 修复：改为直接 await。
 *
 * 由 package.json 的 postinstall 脚本调用，npm ci / npm install 后自动执行。
 */
const fs = require('fs')
const path = require('path')

const pkgDir = path.join(__dirname, '..', 'node_modules', '@electron', 'rebuild')
const workerPath = path.join(pkgDir, 'lib', 'module-type', 'node-gyp', 'worker.js')

if (!fs.existsSync(workerPath)) {
  console.log('[patch] @electron/rebuild worker.js 不存在，跳过')
  process.exit(0)
}

const src = fs.readFileSync(workerPath, 'utf8')
const OLD = 'await (0, util_1.promisify)(nodeGyp.commands[command.name])(command.args);'
const NEW = 'await nodeGyp.commands[command.name](command.args);'

if (src.includes(NEW)) {
  console.log('[patch] @electron/rebuild worker.js 已修复，跳过')
  process.exit(0)
}

if (!src.includes(OLD)) {
  console.warn('[patch] 警告: 未找到预期的 promisify 调用，跳过（@electron/rebuild 版本可能已变）')
  process.exit(0)
}

fs.writeFileSync(workerPath, src.replace(OLD, NEW))
console.log('[patch] @electron/rebuild worker.js 已打补丁 (promisify → direct await)')
