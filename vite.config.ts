import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'))

const BUILD_YEAR = new Date().getFullYear()

export default defineConfig({
  // 相对路径 base：Electron 通过 file:// 加载时，绝对路径 /assets 会解析到磁盘根目录导致资源加载失败（图裂）
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_YEAR__: JSON.stringify(BUILD_YEAR),
  },
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          define: {
            __BUILD_YEAR__: JSON.stringify(BUILD_YEAR),
          },
          build: {
            rollupOptions: {
              external: [
                'node-llama-cpp',
                /^@node-llama-cpp\//,
                'mammoth',
                'esbuild',
                'node-pty',
              ],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload()
        },
        vite: {
          build: {
            rollupOptions: {
              output: {
                format: 'cjs',
              },
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
