/**
 * Stardust Electron 主进程入口
 *
 * 职责：
 * - 窗口生命周期管理
 * - App 菜单（macOS）
 * - Rust Sidecar 子进程启停与事件转发
 * - IPC handler 通过 ipc/ 目录下的模块按功能域注册
 */
import { app, BrowserWindow, Menu } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { initSidecar, getSidecar } from './main/sidecarManager.js'
import { initWorkspace } from './main/workspace.js'
import { initAutoUpdater } from './main/autoUpdater.js'

// ====== IPC 模块导入 ======
import { registerSidecarIpc } from './ipc/sidecarIpc.js'
import { registerDialogIpc } from './ipc/dialogIpc.js'
import { registerWorkspaceIpc } from './ipc/workspaceIpc.js'
import { registerShellIpc } from './ipc/shellIpc.js'
import { registerConfigIpc } from './ipc/configIpc.js'
import { registerConversationIpc } from './ipc/conversationIpc.js'
import { registerAiWindowIpc } from './ipc/aiWindowIpc.js'
import { registerWindowIpc } from './ipc/windowIpc.js'
import { registerPluginIpc } from './ipc/pluginIpc.js'
import { registerSkillIpc } from './ipc/skillIpc.js'
import { registerPermissionIpc } from './ipc/permissionIpc.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// macOS 开发模式下替换菜单栏显示名称
if (process.platform === 'darwin') app.setName('Stardust')

let mainWindow: BrowserWindow | null = null

// 图标路径：开发模式用 PNG，打包时 electron-builder 自动将 icns 注入应用包
const appIconPath = path.join(__dirname, '../public/assets/icons/icon.png')
const appIcon = fs.existsSync(appIconPath) ? appIconPath : undefined

// ====== 窗口创建 ======

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Stardust',
    icon: appIcon,
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
    ...(process.platform !== 'darwin' ? {
      titleBarOverlay: { color: '#ffffff', symbolColor: '#1a1a1a', height: 36 },
    } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ====== 关于窗口 ======

function showAbout() {
  mainWindow?.webContents.send('showAbout')
}

// ====== App 生命周期 ======

app.whenReady().then(async () => {
  // ---- IPC handler 注册（所有注册在 sidecar 启动前完成） ----
  registerSidecarIpc()
  registerDialogIpc(() => mainWindow)
  registerWorkspaceIpc()
  registerShellIpc()
  registerConfigIpc()
  registerConversationIpc()
  registerAiWindowIpc(appIcon)
  registerWindowIpc()
  registerPluginIpc()
  registerSkillIpc()
  registerPermissionIpc()

  // ---- 预初始化 ----
  getSidecar().call('sandbox.preInit').catch(() => {})
  initWorkspace()

  // ---- Rust Sidecar 启动 ----
  try {
    const sidecar = initSidecar()
    await sidecar.start()
    console.log('[main] 🦀 Rust Sidecar 已就绪')

    // 自动连接内置 MCP 服务器（Filesystem, GitHub, PostgreSQL）
    getSidecar().call('mcp.autoConnectBuiltins').then((r: any) => {
      console.log(`[main] 内置 MCP: ${r?.connected || 0} 个已连接, ${r?.failed || 0} 个失败`)
    }).catch((e: any) => {
      console.warn('[main] 内置 MCP 自动连接失败:', e.message)
    })

    // 全局事件转发：Sidecar 事件 → 所有渲染进程窗口
    const broadcast = (event: string, params: any) => {
      BrowserWindow.getAllWindows().forEach(w => w.webContents.send('sidecar:event', { event, params }))
    }
    sidecar.onEvent('event.model.chatChunk', (p) => broadcast('event.model.chatChunk', p))
    sidecar.onEvent('event.model.chatDone', (p) => broadcast('event.model.chatDone', p))
    sidecar.onEvent('event.model.chatError', (p) => broadcast('event.model.chatError', p))
    // 终端流式事件转发
    sidecar.onEvent('event.terminal.output', (p) => {
      BrowserWindow.getAllWindows().forEach(w => w.webContents.send('terminal:output', p))
    })
    sidecar.onEvent('event.pty.output', (p) => {
      BrowserWindow.getAllWindows().forEach(w => w.webContents.send('terminal:ptyOutput', p))
    })
  } catch (e: any) {
    console.error('[main] Rust Sidecar 启动失败，回退到 Node.js 模式:', e.message)
  }

  createWindow()

  // ---- 自动更新（正式打包环境） ----
  initAutoUpdater()

  // ---- macOS 关于信息 ----
  // 注意：不调用 app.dock.setIcon() —— Dock 图标应使用打包的 icon.icns（边距规范），
  // 用 PNG 覆盖会导致 Dock 图标内容占比过大而显得偏大
  app.setAboutPanelOptions({
    applicationName: 'Stardust',
    applicationVersion: app.getVersion(),
    copyright: `© ${__BUILD_YEAR__} 沉浸位工作室`,
    credits: 'AI 赋能创作，让灵感自由流淌。',
    website: 'https://github.com/Tianzeyui/stardust',
    iconPath: appIcon,
  })

  // ---- 菜单栏 ----
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {
        label: 'Stardust',
        submenu: [
          { label: '关于 Stardust', click: showAbout },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
    ]))
  } else {
    Menu.setApplicationMenu(null)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

app.on('before-quit', async () => {
  try { await getSidecar().call('mcp.disconnectAll', {}, 1000) } catch {}
  try { await getSidecar().call('graph.close', {}, 1000) } catch {}
  try { await getSidecar().stop() } catch {}
})
