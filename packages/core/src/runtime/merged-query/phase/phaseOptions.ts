import fs from 'fs';
import path from 'path';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { RuntimeAdapter } from '../../adapters/types.js';
import type { CodeGenerationContext } from '../../types/context.js';
import type { AgentConfig } from '../../../config/index.js';
import {
  createComponentCatalogMcpServer,
  createComponentSpecMcpServer,
  createCodeOutputMcpServer,
  createDesignAnalysisMcpServer,
  createFigmaMcpServer,
  SUBMIT_DESIGN_ANALYSIS_FULL_TOOL_ID,
  WRITE_CODE_FILE_FULL_TOOL_ID,
  toolManager,
} from '../../../mcp/index.js';
import { createLogger } from '../../../lib/logger.js';
import type { MergedQueryPerformanceCollector } from '../performanceCollector.js';

const logger = createLogger('Figma2Code.MergedQueryOptions');

export interface BuildMergedQueryPhaseOptionsParams {
  runtimeAdapter: RuntimeAdapter;
  context: CodeGenerationContext;
  agentConfig: AgentConfig;
  outputDir: string;
  performanceCollector?: MergedQueryPerformanceCollector;
}

export function buildMergedQueryPhaseOptions(params: BuildMergedQueryPhaseOptionsParams): Options {
  const cwd = params.agentConfig.cwd || process.cwd();
  const mcpServers = buildMcpServers(params.runtimeAdapter, params.agentConfig, params.outputDir);
  const performanceHooks = params.performanceCollector?.createHooks();

  const options: Options = {
    mcpServers,
    tools: ['Read', 'Skill'],
    allowedTools: buildAllowedTools(),
    disallowedTools: buildDisallowedTools(),
    settingSources: buildSettingSources(cwd),
    cwd,
    includePartialMessages: params.agentConfig.enableStreaming ?? true,
    model: params.agentConfig.defaultModel,
    permissionMode: 'dontAsk',
    ...(performanceHooks && { hooks: performanceHooks }),
  };

  return options;
}

function buildMcpServers(
  runtimeAdapter: RuntimeAdapter,
  agentConfig: AgentConfig,
  outputDir: string,
): Record<string, any> {
  if (!toolManager.getStats().total) {
    toolManager.initialize(agentConfig);
  }

  if (!toolManager.has('figma')) {
    const figmaServer = createFigmaMcpServer(agentConfig);
    if (figmaServer) {
      toolManager.register('figma', figmaServer);
    }
  }

  if (!toolManager.has('component-catalog')) {
    try {
      toolManager.register('component-catalog', createComponentCatalogMcpServer);
    } catch (error) {
      logger.warn('Failed to register component catalog MCP server', { error: String(error) });
    }
  }

  if (!toolManager.has('component-spec')) {
    try {
      toolManager.register('component-spec', createComponentSpecMcpServer);
    } catch (error) {
      logger.warn('Failed to register component spec MCP server', { error: String(error) });
    }
  }

  if (!toolManager.has('design-analysis')) {
    try {
      toolManager.register('design-analysis', createDesignAnalysisMcpServer);
    } catch (error) {
      logger.warn('Failed to register design analysis MCP server', { error: String(error) });
    }
  }

  const mcpServers: Record<string, any> = {
    ...toolManager.getAll(),
  };

  mcpServers['code-output'] = createCodeOutputMcpServer({ outputDir });

  if (!mcpServers['figma'] && agentConfig.figmaApiKey) {
    mcpServers['figma'] = {
      type: 'stdio',
      command: 'npx',
      args: [
        '-y',
        'figma-developer-mcp',
        `--figma-api-key=${agentConfig.figmaApiKey}`,
        '--stdio',
      ],
    };
  }

  const platformMcpTools = runtimeAdapter.getMcpTools?.();
  if (platformMcpTools) {
    for (const toolConfig of platformMcpTools) {
      mcpServers[toolConfig.name] = toolConfig.server;
    }
  }

  return mcpServers;
}

function buildAllowedTools(): string[] {
  return [
    'Read',
    'Skill',
    'mcp__figma__get_figma_data',
    'mcp__component-catalog__list-available-components',
    'mcp__component-catalog__list-icons',
    'mcp__component-spec__get-component-source',
    SUBMIT_DESIGN_ANALYSIS_FULL_TOOL_ID,
    WRITE_CODE_FILE_FULL_TOOL_ID,
  ];
}

function buildDisallowedTools(): string[] {
  return [
    'Edit',
    'MultiEdit',
    'Bash',
    'Write',
    'Task',
    'Agent',
    'mcp__figma__set_folder_name',
  ];
}

function buildSettingSources(cwd: string): ('project' | 'user' | 'local')[] {
  const sources: ('project' | 'user' | 'local')[] = ['user', 'project'];
  const skillsDir = path.join(cwd, '.claude', 'skills');

  logger.info('[MergedQuery Skill Sentinel] Skills loading diagnostics', {
    cwd,
    skillsDir,
    settingSources: sources,
    skillsDirExists: fs.existsSync(skillsDir),
  });

  return sources;
}
