/**
 * 独立导航窗口 IPC handler
 * 支持将侧边栏菜单项（包括插件）在新窗口中打开
 */
import { ipcMain, BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function registerWindowIpc(): void {
  ipcMain.handle('window:openNav', async (_e, navId: string, label: string) => {
    const preloadPath = path.join(__dirname, 'preload.js')

    const navWindow = new BrowserWindow({
      width: 900,
      height: 650,
      title: label || 'Stardust',
      titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
      ...(process.platform !== 'darwin' ? {
        titleBarOverlay: { color: '#ffffff', symbolColor: '#1a1a1a', height: 36 },
      } : {}),
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    navWindow.setMenu(null)

    if (process.env.VITE_DEV_SERVER_URL) {
      const sep = process.env.VITE_DEV_SERVER_URL.includes('?') ? '&' : '?'
      navWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}${sep}standalone=1&nav=${encodeURIComponent(navId)}`)
    } else {
      navWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
        query: { standalone: '1', nav: navId },
      })
    }

    navWindow.webContents.on('did-fail-load', (_e, code, desc) => {
      navWindow.webContents.loadURL(
        `data:text/html,<h2 style="font-family:sans-serif;text-align:center;margin-top:40vh;color:%23666">无法加载页面</h2><p style="text-align:center;color:%23999">${desc}</p>`,
      )
    })
  })
}
