/**
 * 自动更新管理器 — 基于 electron-updater
 *
 * 更新源：GitHub Releases（package.json build.publish 配置）
 * 流程：
 *   1. 应用启动后静默检查更新
 *   2. 发现新版本 → 通过 IPC 通知渲染进程 → 渲染层弹窗提示用户
 *   3. 用户确认 → 下载 → 下载进度推送 → 下载完成提示重启安装
 */
import { app, ipcMain, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'

// ---- 日志 ----
log.transports.file.level = 'info'
autoUpdater.logger = log

// 不自动下载（先询问用户）
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

let updateAvailable = false
let updateDownloaded = false

/** 向所有窗口广播更新事件 */
function broadcast(channel: string, payload?: any) {
  BrowserWindow.getAllWindows().forEach((w) => {
    w.webContents.send(channel, payload)
  })
}

/** 初始化自动更新（在 app ready 后调用） */
export function initAutoUpdater() {
  // 仅正式打包环境启用（dev 模式跳过）
  if (!app.isPackaged) {
    console.log('[updater] 开发模式，跳过自动更新')
    return
  }

  // 允许渲染进程主动触发检查（设置页「检查更新」按钮）
  ipcMain.handle('updater:check', async () => {
    if (updateDownloaded) return { status: 'downloaded' }
    try {
      const result = await autoUpdater.checkForUpdates()
      return {
        status: result?.updateInfo ? 'available' : 'none',
        version: result?.updateInfo?.version,
      }
    } catch (e: any) {
      return { status: 'error', message: e.message }
    }
  })

  // 用户确认下载
  ipcMain.handle('updater:download', async () => {
    if (updateDownloaded) return { status: 'downloaded' }
    try {
      autoUpdater.downloadUpdate()
      return { status: 'downloading' }
    } catch (e: any) {
      return { status: 'error', message: e.message }
    }
  })

  // 用户确认安装（重启并安装）
  ipcMain.handle('updater:install', async () => {
    if (!updateDownloaded) return { status: 'none' }
    setImmediate(() => autoUpdater.quitAndInstall())
    return { status: 'installing' }
  })

  // ---- 事件 ----
  autoUpdater.on('checking-for-update', () => {
    broadcast('updater:status', { type: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    updateAvailable = true
    broadcast('updater:status', { type: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    broadcast('updater:status', { type: 'none' })
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater] 错误:', err)
    broadcast('updater:status', { type: 'error', message: err.message })
  })

  autoUpdater.on('download-progress', (progress) => {
    broadcast('updater:status', {
      type: 'progress',
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    updateDownloaded = true
    broadcast('updater:status', { type: 'downloaded', version: info.version })
  })

  // 启动后延迟数秒静默检查（不打扰用户启动流程）
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e) => {
      console.warn('[updater] 检查更新失败（可能网络问题）:', e.message)
    })
  }, 5000)
}
