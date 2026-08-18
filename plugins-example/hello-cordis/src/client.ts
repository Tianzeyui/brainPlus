/**
 * hello-cordis — CLIENT 半端（页面挂载）
 *
 * 渲染进程执行：声明式挂载宿主页面/导航。
 * 对齐 DSH client 半端概念：不携带 React 代码，只声明挂载点。
 */
export function registerClient(ctx: any) {
  ctx.registerNav({ id: 'hello-cordis', label: 'Hello Cordis', icon: 'Sparkles', order: 95 })
  // 挂载宿主内置页面（按 id）；没有内置页面时可不注册 route
  ctx.registerRoute('hello-cordis', 'HelloCordisPage')
}
