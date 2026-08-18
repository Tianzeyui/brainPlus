/**
 * inspiration — CLIENT 半端（挂载宿主页面）
 */
export function registerClient(ctx: any) {
  ctx.registerNav({ id: 'inspiration', label: '灵感', icon: 'Lightbulb', order: 70 })
  ctx.registerRoute('inspiration', 'InspirationPage')
}
