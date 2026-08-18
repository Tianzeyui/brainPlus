/**
 * 自动更新管理器 — 基于 electron-updater
 *
 * 更新源：GitHub Releases（package.json build.publish 配置）
 * 流程：
 *   1. 应用启动后静默检查更新
 *   2. 发现新版本 → 通过 IPC 通知渲染进程 → 渲染层弹窗提示用户
 *   3. 用户确认 → 下载 → 下载进度推送 → 下载完成提示重启安装
 *
 * 状态机（避免 check/事件竞争）：
 * - updater:check 返回权威状态（available/none/error/dev）
 * - check 失败时不广播 error 事件（渲染层以返回值 + 事件双通道，避免竞争）
 * - updater:download 要求先 check 成功且 available，否则明确报错
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
let lastCheckVersion: string | null = null

/** 向所有窗口广播更新事件 */
function broadcast(channel: string, payload?: any) {
  BrowserWindow.getAllWindows().forEach((w) => {
    w.webContents.send(channel, payload)
  })
}

/** 初始化自动更新（在 app ready 后调用） */
export function initAutoUpdater() {
  // IPC handler 总是注册（避免渲染进程调用时报 "No handler registered"）
  // 开发模式下 check 返回 dev 状态，不真正联网检查

  // 允许渲染进程主动触发检查（设置页「检查更新」按钮）
  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) return { status: 'dev' }
    if (updateDownloaded) return { status: 'downloaded' }
    try {
      const result = await autoUpdater.checkForUpdates()
      // checkForUpdates 在无更新时 resolve 空 result（或抛错），有更新时 result.updateInfo 存在
      const version = result?.updateInfo?.version
      if (version) {
        updateAvailable = true
        lastCheckVersion = version
        return { status: 'available', version }
      }
      // 无更新：明确返回 none
      updateAvailable = false
      lastCheckVersion = null
      return { status: 'none' }
    } catch (e: any) {
      // 检查失败（网络/403/限流）：不广播 error 事件（避免和返回值竞争），直接返回 error
      console.error('[updater] 检查更新失败:', e.message)
      updateAvailable = false
      return { status: 'error', message: e.message }
    }
  })

  // 用户确认下载（必须先 check 成功且 available）
  ipcMain.handle('updater:download', async () => {
    if (!app.isPackaged) return { status: 'dev' }
    if (updateDownloaded) return { status: 'downloaded' }
    if (!updateAvailable) {
      return { status: 'error', message: '请先检查更新' }
    }
    try {
      autoUpdater.downloadUpdate()
      return { status: 'downloading' }
    } catch (e: any) {
      return { status: 'error', message: e.message }
    }
  })

  // 用户确认安装（重启并安装）
  ipcMain.handle('updater:install', async () => {
    if (!app.isPackaged) return { status: 'dev' }
    if (!updateDownloaded) return { status: 'none' }
    setImmediate(() => autoUpdater.quitAndInstall())
    return { status: 'installing' }
  })

  // 仅正式打包环境启用更新检查（dev 模式不注册事件/不自动检查）
  if (!app.isPackaged) {
    console.log('[updater] 开发模式：IPC 已注册，跳过自动更新检查')
    return
  }

  // ---- 事件（仅广播正向进度/成功状态，失败由 check 返回值处理） ----
  autoUpdater.on('checking-for-update', () => {
    broadcast('updater:status', { type: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    updateAvailable = true
    lastCheckVersion = info.version
    broadcast('updater:status', { type: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    updateAvailable = false
    lastCheckVersion = null
    broadcast('updater:status', { type: 'none' })
  })

  autoUpdater.on('error', (err) => {
    // 仅记录日志，不广播（check 的返回值已携带错误，广播会导致状态竞争）
    console.error('[updater] 错误:', err.message)
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
      console.warn('[updater] 启动静默检查失败（可能网络问题）:', e.message)
    })
  }, 5000)
}
