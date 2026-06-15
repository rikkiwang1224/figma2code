/**
 * 工具层统一导出
 */

export { ToolManager, toolManager } from './manager';
export { createFigmaMcpServer, SET_FOLDER_NAME_FULL_TOOL_ID } from './figma';
export { createComponentCatalogMcpServer } from './component-catalog';
export { createComponentSpecMcpServer } from './component-spec';
export {
  createCodeOutputMcpServer,
  WRITE_CODE_FILE_FULL_TOOL_ID,
} from './code-output';
export {
  createDesignAnalysisMcpServer,
  SUBMIT_DESIGN_ANALYSIS_FULL_TOOL_ID,
} from './design-analysis';
export type { McpToolType, ToolConfig, FigmaToolConfig, ComponentLibraryToolConfig, IconLibraryToolConfig } from './types';
