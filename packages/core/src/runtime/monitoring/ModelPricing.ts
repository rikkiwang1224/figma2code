/**
 * 模型定价配置
 */

/**
 * 模型定价信息
 * 
 * 基于 Claude 2026 定价规则：
 * 
 * 标准模型（Sonnet 4+, Opus 4+, Haiku 4+, Haiku 3.5）：
 * - Cache Hit: inputPrice * 0.1（10% 折扣）
 * - Cache Write (5-minute): inputPrice * 1.25（25% 溢价，默认）
 * - Cache Write (1-hour): inputPrice * 2.0（100% 溢价，需显式指定 ttl: "1h"）
 * - Regular Input: inputPrice（100% 标准价格）
 * - Output: outputPrice
 * 
 * 特殊情况（旧模型如 Haiku 3）：
 * - 缓存定价使用文档中的固定值，不遵循乘数规则
 * 
 * 价格来源：https://docs.anthropic.com/en/docs/about-claude/pricing
 * 更新日期：2026-04-13
 */
export interface ModelPricing {
  /** 常规输入价格（$/1M tokens，100% 标准价格） */
  inputPrice: number;
  /** 缓存命中价格（$/1M tokens，10% 折扣） */
  cacheHitPrice: number;
  /** 缓存写入价格（$/1M tokens，5分钟缓存默认为 125% 溢价） */
  cacheWritePrice: number;
  /** 输出价格（$/1M tokens） */
  outputPrice: number;
}

/**
 * 模型定价表
 * 
 * 价格来源：https://docs.anthropic.com/en/docs/about-claude/pricing
 * 更新日期：2026-04-13
 * 
 * 计算规则：
 * - 标准模型：inputPrice 为基础，cacheHitPrice = inputPrice * 0.1，cacheWritePrice = inputPrice * 1.25
 * - 特殊模型（如 Haiku 3）：使用文档中的固定值
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude Opus 4.6（最新旗舰模型）
  'claude-opus-4-6': {
    inputPrice: 5.0,
    cacheHitPrice: 0.50,
    cacheWritePrice: 6.25,
    outputPrice: 25.0,
  },
  'claude-opus-4-6-20260422': {
    inputPrice: 5.0,
    cacheHitPrice: 0.50,
    cacheWritePrice: 6.25,
    outputPrice: 25.0,
  },
  // Claude Sonnet 4.6（最新平衡模型）
  'claude-sonnet-4-6': {
    inputPrice: 3.0,
    cacheHitPrice: 0.30,
    cacheWritePrice: 3.75,
    outputPrice: 15.0,
  },
  'claude-sonnet-4-6-20260422': {
    inputPrice: 3.0,
    cacheHitPrice: 0.30,
    cacheWritePrice: 3.75,
    outputPrice: 15.0,
  },
  'claude-sonnet-4-5': {
    inputPrice: 3.0,
    cacheHitPrice: 0.3,
    cacheWritePrice: 3.75,
    outputPrice: 15.0,
  },
  'claude-sonnet-4-5-20250929': {
    inputPrice: 3.0,
    cacheHitPrice: 0.3,
    cacheWritePrice: 3.75,
    outputPrice: 15.0,
  },
  'claude-3-5-sonnet-20241022': {
    inputPrice: 3.0,
    cacheHitPrice: 0.3,
    cacheWritePrice: 3.75,
    outputPrice: 15.0,
  },
  'claude-3-opus-20240229': {
    inputPrice: 15.0,
    cacheHitPrice: 1.5,
    cacheWritePrice: 18.75,
    outputPrice: 75.0,
  },
  'claude-3-sonnet-20240229': {
    inputPrice: 3.0,
    cacheHitPrice: 0.3,
    cacheWritePrice: 3.75,
    outputPrice: 15.0,
  },
  // Claude Haiku 3（旧模型，使用文档固定值）
  'claude-3-haiku-20240307': {
    inputPrice: 0.25,
    cacheHitPrice: 0.03,      // 文档固定值（不遵循 0.1x 规则）
    cacheWritePrice: 0.30,    // 文档固定值 - 5分钟缓存
    outputPrice: 1.25,
  },
};

/**
 * 默认定价（用于未知模型）
 * 使用 claude-sonnet-4-5 的定价作为默认值
 */
export const DEFAULT_PRICING: ModelPricing = {
  inputPrice: 3.0,
  cacheHitPrice: 0.3,
  cacheWritePrice: 3.75,
  outputPrice: 15.0,
};

/**
 * 获取模型定价
 */
export function getModelPricing(modelName: string): ModelPricing {
  // 尝试精确匹配
  if (MODEL_PRICING[modelName]) {
    return MODEL_PRICING[modelName];
  }
  
  // 尝试部分匹配（例如 "claude-sonnet-4-5-20250929" 匹配 "claude-sonnet-4-5"）
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (modelName.includes(key) || key.includes(modelName)) {
      return pricing;
    }
  }
  
  // 返回默认定价
  return DEFAULT_PRICING;
}
