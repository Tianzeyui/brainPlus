export const FALLBACK_COLORS = ['#9CA3AF', '#6B7280', '#374151', '#1F2937']

// key 匹配 modelId 子串（大小写不敏感）
const modelPalettes: Record<string, string[]> = {
  deepseek: ['#818CF8', '#A78BFA', '#67E8F9', '#6EE7B7'],
  claude: ['#FCD34D', '#FCA5A5', '#F9A8D4', '#C4B5FD'],
  anthropic: ['#FCD34D', '#FCA5A5', '#F9A8D4', '#C4B5FD'],
  gpt: ['#6EE7B7', '#67E8F9', '#93C5FD', '#C4B5FD'],
  openai: ['#6EE7B7', '#67E8F9', '#93C5FD', '#C4B5FD'],
  gemini: ['#93C5FD', '#C4B5FD', '#F9A8D4', '#FCD34D'],
  google: ['#93C5FD', '#C4B5FD', '#F9A8D4', '#FCD34D'],
  qwen: ['#A5B4FC', '#C4B5FD', '#93C5FD', '#67E8F9'],
  千问: ['#A5B4FC', '#C4B5FD', '#93C5FD', '#67E8F9'],
  glm: ['#F9A8D4', '#C4B5FD', '#A5B4FC', '#93C5FD'],
  智谱: ['#F9A8D4', '#C4B5FD', '#A5B4FC', '#93C5FD'],
  llama: ['#FDBA74', '#FCA5A5', '#C4B5FD', '#93C5FD'],
  mistral: ['#67E8F9', '#A5B4FC', '#C4B5FD', '#F9A8D4'],
  yi: ['#A5B4FC', '#67E8F9', '#6EE7B7', '#FCD34D'],
  moonshot: ['#F9A8D4', '#C4B5FD', '#93C5FD', '#67E8F9'],
  minimax: ['#93C5FD', '#6EE7B7', '#FCD34D', '#FCA5A5'],
  doubao: ['#6EE7B7', '#67E8F9', '#A78BFA', '#F9A8D4'],
  豆包: ['#6EE7B7', '#67E8F9', '#A78BFA', '#F9A8D4'],
  ernie: ['#93C5FD', '#A5B4FC', '#C4B5FD', '#F9A8D4'],
  文心: ['#93C5FD', '#A5B4FC', '#C4B5FD', '#F9A8D4'],
  hunyuan: ['#6EE7B7', '#93C5FD', '#A78BFA', '#FCA5A5'],
  混元: ['#6EE7B7', '#93C5FD', '#A78BFA', '#FCA5A5'],
  spark: ['#FCD34D', '#FCA5A5', '#F9A8D4', '#C4B5FD'],
  星火: ['#FCD34D', '#FCA5A5', '#F9A8D4', '#C4B5FD'],
  grok: ['#FCA5A5', '#FDBA74', '#FCD34D', '#C4B5FD'],
  command: ['#A5B4FC', '#93C5FD', '#6EE7B7', '#FCD34D'],
  cohere: ['#A5B4FC', '#93C5FD', '#6EE7B7', '#FCD34D'],
  together: ['#93C5FD', '#C4B5FD', '#F9A8D4', '#FDBA74'],
  perplexity: ['#C4B5FD', '#F9A8D4', '#FCA5A5', '#FCD34D'],
  fireworks: ['#FCA5A5', '#FDBA74', '#FCD34D', '#6EE7B7'],
  groq: ['#FCD34D', '#6EE7B7', '#67E8F9', '#A78BFA'],
  azure: ['#93C5FD', '#67E8F9', '#A5B4FC', '#C4B5FD'],
  openrouter: ['#C4B5FD', '#FCD34D', '#FCA5A5', '#F9A8D4'],
  ollama: ['#FDBA74', '#FCA5A5', '#F9A8D4', '#C4B5FD'],
  lmstudio: ['#6EE7B7', '#A5B4FC', '#FCD34D', '#F9A8D4'],
  baichuan: ['#93C5FD', '#6EE7B7', '#A78BFA', '#FCD34D'],
  百川: ['#93C5FD', '#6EE7B7', '#A78BFA', '#FCD34D'],
  step: ['#C4B5FD', '#F9A8D4', '#93C5FD', '#67E8F9'],
  nova: ['#67E8F9', '#C4B5FD', '#F9A8D4', '#93C5FD'],
  phi: ['#A5B4FC', '#93C5FD', '#C4B5FD', '#6EE7B7'],
  bedrock: ['#FDBA74', '#93C5FD', '#FCA5A5', '#C4B5FD'],
  vertex: ['#6EE7B7', '#67E8F9', '#A5B4FC', '#C4B5FD'],
  granite: ['#FCA5A5', '#FDBA74', '#F9A8D4', '#93C5FD'],
  dbrx: ['#67E8F9', '#C4B5FD', '#FCA5A5', '#FCD34D'],
  nemotron: ['#6EE7B7', '#93C5FD', '#C4B5FD', '#A78BFA'],
  wizard: ['#A78BFA', '#C4B5FD', '#F9A8D4', '#6EE7B7'],
  solar: ['#FCD34D', '#FDBA74', '#FCA5A5', '#F9A8D4'],
  jamba: ['#6EE7B7', '#FCD34D', '#FCA5A5', '#C4B5FD'],
}

export function getStrandColors(modelId?: string): string[] {
  if (!modelId) return FALLBACK_COLORS
  const lower = modelId.toLowerCase()
  for (const [key, palette] of Object.entries(modelPalettes)) {
    if (lower.includes(key)) return palette
  }
  return FALLBACK_COLORS
}
