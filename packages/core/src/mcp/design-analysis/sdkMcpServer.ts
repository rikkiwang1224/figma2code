import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

export const SUBMIT_DESIGN_ANALYSIS_TOOL = 'submit_design_analysis';
export const SUBMIT_DESIGN_ANALYSIS_FULL_TOOL_ID = 'mcp__design-analysis__submit_design_analysis';

export const designAnalysisServer = createSdkMcpServer({
  name: 'design-analysis',
  version: '1.0.0',
  tools: [
    tool(
      SUBMIT_DESIGN_ANALYSIS_TOOL,
      '提交本阶段最终设计分析结果，供后续代码生成阶段使用。',
      {
        designAnalysis: z.unknown().describe('完整 DesignAnalyzerOutput。'),
      },
      async () => ({
        content: [{
          type: 'text' as const,
          text: 'Design analysis submitted',
        }],
      }),
    ),
  ],
});
