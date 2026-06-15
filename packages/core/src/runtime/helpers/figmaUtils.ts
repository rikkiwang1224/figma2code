/**
 * Figma 相关工具函数
 */


/**
 * 简单验证 Figma URL 格式
 * 详细解析由 Figma MCP 工具处理
 */
export function isValidFigmaUrlFormat(url: string): boolean {
  // 简单验证：包含 figma.com 且看起来像有效的 URL
  return /https?:\/\/[^/]*figma\.com\/(file|design)\//.test(url.trim());
}

/**
 * 从 Figma URL 提取 Agent MCP 所需的 fileKey / nodeId。
 */
export function extractFigmaParams(figmaUrl: string): { fileKey: string; nodeId: string } {
  const fileKeyMatch = figmaUrl.match(/\/(?:file|design)\/([^\/\?]+)/);
  const nodeIdMatch = figmaUrl.match(/[?&]node-id=([^&]+)/);

  return {
    fileKey: fileKeyMatch?.[1] || '',
    nodeId: nodeIdMatch?.[1]?.replace(/-/g, ':') || '',
  };
}
