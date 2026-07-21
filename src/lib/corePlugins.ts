/**
 * 内建核心插件——将现有功能注册到 PluginSystem
 */
import { pluginSystem } from './pluginSystem'
import type { Plugin } from './pluginTypes'

// ========== 核心插件定义 ==========

const coreChat: Plugin = {
  manifest: { id: 'chat', name: '助手', version: '1.0.0', description: '', icon: 'Bot', navOrder: 10, enabled: true },
  register(ctx) {
    ctx.registerNav({ id: 'chat', label: '助手', icon: 'Bot', order: 10 })
    ctx.registerRoute('chat', () => import('@/components/ai/ChatPage'))
  },
}

const coreProjects: Plugin = {
  manifest: { id: 'projects', name: '项目', version: '1.0.0', description: '', icon: 'FolderKanban', navOrder: 15, enabled: true },
  register(ctx) {
    ctx.registerNav({ id: 'projects', label: '项目', icon: 'FolderKanban', order: 15 })
    ctx.registerRoute('projects', () => import('@/components/projects/ProjectsPage'))
  },
}

const coreSkills: Plugin = {
  manifest: { id: 'skills', name: 'Skills', version: '1.0.0', description: '', icon: 'BookOpen', navOrder: 20, enabled: true },
  register(ctx) {
    ctx.registerNav({ id: 'skills', label: 'Skills', icon: 'BookOpen', order: 20 })
    ctx.registerRoute('skills', () => import('@/components/skills/SkillsPage'))
  },
}

const coreNotifications: Plugin = {
  manifest: { id: 'notifications', name: '通知', version: '1.0.0', description: '', icon: 'Bell', navOrder: 90, enabled: true },
  register(ctx) {
    ctx.registerRoute('notifications', () => import('@/components/notifications/NotificationsPage'))
  },
}

const corePluginsPage: Plugin = {
  manifest: { id: 'plugins', name: '插件', version: '1.0.0', description: '', icon: 'Blocks', navOrder: 50, enabled: true },
  register(ctx) {
    ctx.registerNav({ id: 'plugins', label: '插件', icon: 'Blocks', order: 50 })
    ctx.registerRoute('plugins', () => import('@/components/plugins/PluginsPage'))
  },
}

const coreUsagePage: Plugin = {
  manifest: { id: 'usage', name: '用量统计', version: '1.0.0', description: '', icon: 'BarChart3', navOrder: 0, enabled: true },
  register(ctx) {
    ctx.registerRoute('usage', () => import('@/components/usage/UsageStatsPage'))
  },
}

export function initCorePlugins() {
  pluginSystem.registerCore(coreChat)
  pluginSystem.registerCore(coreProjects)
  pluginSystem.registerCore(coreSkills)
  pluginSystem.registerCore(corePluginsPage)
  pluginSystem.registerCore(coreNotifications)
  pluginSystem.registerCore(coreUsagePage)
}
