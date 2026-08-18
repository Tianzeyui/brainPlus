# Stardust 插件新范式（对齐 DSH/Cordis）

## 目录结构

```
插件/
  manifest.json      ← 声明：id、name、permissions、tools（可选）
  src/index.ts       ← HOST 半端：apply(ctx) 注册工具/服务（主进程）
  src/client.ts      ← CLIENT 半端：registerClient(ctx) 挂载页面（渲染进程）
  lib/index.js       ← 预编译 host（node scripts/build-plugin.mjs 产物）
  lib/client.js      ← 预编译 client
```

## 核心原则

1. **Host/Client 分离**（对齐 DSH cordis-host-runner）
   - **Host 半端**（`src/index.ts`）：AI 工具、服务注册——**主进程 Cordis 运行**，零 esbuild/零 spawn
   - **Client 半端**（`src/client.ts`）：页面挂载——**渲染进程**声明式挂载宿主页面

2. **工具经 Cordis 注册**（对齐 `defineTool`）
   ```ts
   // src/index.ts（host 半端）
   import { defineTool } from '@deepseek-ai/dsh-tools'
   export const name = 'diary'
   export const inject = ['tools', 'sidecar']
   export function apply(ctx) {
     ctx.tools.register(defineTool({
       name: 'diary_search',
       description: '搜索日记',
       parameters: { q: { type: 'string', required: true, description: '关键词' } },
       output: { schema: { type: 'string' }, render: (a, v) => [{ type: 'text', text: v }] },
       execute: async (args) => { /* 主进程执行，可调 ctx.get('sidecar') */ },
     }))
   }
   ```

3. **页面挂载（client 半端）**
   ```ts
   // src/client.ts（client 半端）
   export function registerClient(ctx) {
     ctx.registerNav({ id: 'diary', label: '日记', icon: 'BookOpen', order: 60 })
     ctx.registerRoute('diary', 'DiaryPage')   // 挂载宿主内置页面（按 id）
   }
   ```

4. **宿主服务**（主进程 ctx.provide 提供，插件 `ctx.get('sidecar')` 获取）
   - `sidecar`：统一能力入口（`call(method, params)`）
   - `fs` / `sandbox` / `mcp` / `ai`：常用能力

5. **权限**（manifest.json 声明，对齐旧系统）
   ```json
   { "permissions": ["ai", "files"] }
   ```

## 构建

```bash
node scripts/build-plugin.mjs 插件目录
# 产物: 插件目录/lib/index.js + lib/client.js
```

## 加载流程

```
安装插件（下载 src + manifest）
  → 主进程 build 或下载预编译 lib/
  → HOST: loadCordisPlugin(pluginDir) → require(lib/index.js) → ctx.plugin()
  → CLIENT: 渲染进程 registerClient 挂载页面
  → 模型可调用插件工具（主进程 execute）
```
