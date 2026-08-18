/**
 * 插件管理 + Skill GitHub 操作 IPC handler
 */
import { ipcMain, app } from 'electron'
import path from 'path'
import fs from 'fs'
import { downloadPluginFiles } from '../main/pluginDownloader.js'
import {
  cloneRepo,
  pullRepo,
  readRepoPluginsJson,
  parseGitHubUrl,
  cloneToTemp,
  removeTempDir,
} from '../main/pluginRepoManager.js'

export function registerPluginIpc(): void {
  // ==================== 插件加载与编译 ====================

  ipcMain.handle('plugin:load', async (_e, dirPath: string) => {
    try {
      const fs = await import('fs')
      const path = await import('path')
      const manifestPath = path.join(dirPath, 'manifest.json')
      if (!fs.existsSync(manifestPath)) return { success: false, error: '未找到 manifest.json' }
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      return { success: true, manifest, pluginDir: dirPath }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 安装插件：复制到 appData 目录
  ipcMain.handle('plugin:install', async (_e, dirPath: string) => {
    try {
      const fs = await import('fs')
      const path = await import('path')
      const manifestPath = path.join(dirPath, 'manifest.json')
      if (!fs.existsSync(manifestPath)) return { success: false, error: '未找到 manifest.json' }
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      const pluginId = manifest.id || path.basename(dirPath)

      const pluginsDir = path.join(app.getPath('userData'), 'plugins')
      const destDir = path.join(pluginsDir, pluginId)

      if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true })
      fs.mkdirSync(destDir, { recursive: true })

      fs.cpSync(dirPath, destDir, { recursive: true })

      // 安装 npm 依赖
      const pkgPath = path.join(destDir, 'package.json')
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
        if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
          if (!pkg.name) { pkg.name = pluginId; pkg.private = true; fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8') }
          if (!fs.existsSync(path.join(destDir, 'node_modules'))) {
            const { execFile } = await import('child_process')
            await new Promise<void>((resolve, reject) => {
              execFile('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts'], { cwd: destDir, timeout: 120000 }, (err) => {
                if (err) reject(err); else resolve()
              })
            })
          }
        }
      }

      return { success: true, manifest, pluginDir: destDir }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('plugin:installDeps', async (_e, dirPath: string) => {
    try {
      const fs = await import('fs')
      const path = await import('path')
      const pkgPath = path.join(dirPath, 'package.json')
      if (!fs.existsSync(pkgPath)) return { success: true }
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      if (!pkg.dependencies || Object.keys(pkg.dependencies).length === 0) return { success: true }
      if (!pkg.name) {
        pkg.name = path.basename(dirPath)
        pkg.private = true
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8')
      }
      if (fs.existsSync(path.join(dirPath, 'node_modules'))) return { success: true }
      const { execFile } = await import('child_process')
      return new Promise((resolve) => {
        execFile('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts'], { cwd: dirPath, timeout: 120000 }, (err) => {
          if (err) resolve({ success: false, error: err.message })
          else resolve({ success: true })
        })
      })
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('plugin:compile', async (_e, dirPath: string) => {
    try {
      const fs = await import('fs')
      const path = await import('path')
      const tsxPath = path.join(dirPath, 'index.tsx')
      const jsxPath = path.join(dirPath, 'index.jsx')
      const entryPath = fs.existsSync(tsxPath) ? tsxPath : fs.existsSync(jsxPath) ? jsxPath : null
      if (!entryPath) {
        // 详细日志：排查"文件明明存在却找不到入口"的问题
        console.error(`[plugin:compile] 未找到入口 (dirPath=${dirPath})`)
        try { console.error(`  dir 存在=${fs.existsSync(dirPath)}, index.tsx=${fs.existsSync(tsxPath)}, 内容=${fs.readdirSync(dirPath).join(',')}`) } catch (e2: any) { console.error('  读取目录失败:', e2.message) }
        return { success: false, error: '未找到 index.tsx 或 index.jsx' }
      }

      // 用同步 require 加载 esbuild（打包版 asar 环境下 import() 异步加载 esbuild 可能失败）
      const esbuild = require('esbuild')
      const result = await esbuild.build({
        entryPoints: [entryPath],
        bundle: true,
        write: false,
        format: 'cjs',
        platform: 'browser',
        jsx: 'transform',
        jsxFactory: 'React.createElement',
        jsxFragment: 'React.Fragment',
        tsconfigRaw: JSON.stringify({ compilerOptions: { jsx: 'react' } }),
        external: ['react', 'react-dom', 'lucide-react', '@/lib/utils', '@/components/ui/*', '@/components/diary/*', '@/components/inspiration/*'],
        target: 'es2020',
        banner: { js: "const React = require('react');" },
        plugins: [{
          name: 'resolve-at-alias',
          setup(build) {
            // 宿主组件引用保持原样 external（运行时由宿主 require 解析），不替换成绝对路径
            build.onResolve({ filter: /^@\/components\/(diary|inspiration)\// }, args => ({
              path: args.path, external: true,
            }))
          },
        }],
      })
      const code = result.outputFiles?.[0]?.text || ''
      return { success: true, code }
    } catch (e: any) {
      // 详细错误日志（electron-log 会写入 ~/Library/Logs/Stardust/main.log）
      console.error(`[plugin:compile] 编译失败 (${dirPath}):`, e?.stack || e?.message || e)
      return { success: false, error: e?.message || String(e) }
    }
  })

  // 卸载插件
  ipcMain.handle('plugin:uninstall', async (_e, pluginId: string) => {
    try {
      const destDir = path.join(app.getPath('userData'), 'plugins', pluginId)
      if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true })
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 从社区仓库安装插件（通过 jsDelivr CDN）
  ipcMain.handle('plugin:installFromGithub', async (event, pluginId: string, fileList: string[], manifestId?: string) => {
    try {
      const pluginsDir = path.join(app.getPath('userData'), 'plugins')
      const actualId = manifestId || pluginId
      const destDir = path.join(pluginsDir, actualId)

      if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true })
      fs.mkdirSync(destDir, { recursive: true })

      await downloadPluginFiles(pluginId, fileList, destDir, (file, current, total) => {
        event.sender.send('plugin:githubProgress', { pluginId, file, current, total })
      })

      const manifestPath = path.join(destDir, 'manifest.json')
      const manifest = fs.existsSync(manifestPath)
        ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
        : { id: actualId }

      // 安装 npm 依赖
      const pkgPath = path.join(destDir, 'package.json')
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
        if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
          if (!pkg.name) { pkg.name = actualId; pkg.private = true; fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8') }
          if (!fs.existsSync(path.join(destDir, 'node_modules'))) {
            const { execFile } = await import('child_process')
            await new Promise<void>((resolve, reject) => {
              execFile('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts'], { cwd: destDir, timeout: 120000 }, (err) => {
                if (err) reject(err); else resolve()
              })
            })
          }
        }
      }

      return { success: true, manifest, pluginDir: destDir }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // ==================== 插件仓库管理 ====================

  ipcMain.handle('plugin:cloneRepo', async (_event, url: string) => {
    try {
      const reposDir = path.join(app.getPath('userData'), 'plugin-repos')
      const result = await cloneRepo(url, reposDir)
      if (!result.success) return result

      const plugins = readRepoPluginsJson(result.repoDir!)
      return { success: true, repoDir: result.repoDir, plugins: plugins || [] }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('plugin:pullRepo', async (_event, repoDir: string) => {
    try {
      const result = await pullRepo(repoDir)
      if (!result.success) return result
      const plugins = readRepoPluginsJson(repoDir)
      return { success: true, plugins: plugins || [] }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // ==================== Skill GitHub 操作 ====================

  ipcMain.handle('skill:cloneFromUrl', async (_event, url: string) => {
    try {
      const parsed = parseGitHubUrl(url)
      if (!parsed) return { success: false, error: '无法解析 GitHub URL，支持的格式：https://github.com/user/repo 或 .../tree/branch/path' }

      const result = await cloneToTemp(parsed.repoUrl)
      if (!result.success) return result

      const fullPath = parsed.subPath ? path.join(result.localPath!, parsed.subPath) : result.localPath!
      return { success: true, localPath: fullPath, tempDir: result.localPath }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('skill:cleanupTemp', async (_event, dirPath: string) => {
    try {
      removeTempDir(dirPath)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })
}
