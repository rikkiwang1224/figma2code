import { dirname, isAbsolute, normalize, relative, resolve } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('Figma2Code.CodeOutput');

export const WRITE_CODE_FILE_TOOL = 'write_file';
export const WRITE_CODE_FILE_FULL_TOOL_ID = 'mcp__code-output__write_file';

export interface CreateCodeOutputMcpServerParams {
  outputDir: string;
}

export function createCodeOutputMcpServer(params: CreateCodeOutputMcpServerParams) {
  const outputDir = normalize(resolve(params.outputDir));

  return createSdkMcpServer({
    name: 'code-output',
    version: '1.0.0',
    tools: [
      tool(
        WRITE_CODE_FILE_TOOL,
          'Write a generated code file under the current run output directory using a relative path.',
          {
            path: z.string()
              .min(1)
              .describe('Path relative to the run output directory, for example parcel-detail/index.tsx.'),
            content: z.string().describe('Complete file content.'),
          },
        async (args) => {
          try {
            const relativePath = normalize(args.path.replace(/\\/g, '/'));
            const validationError = validateRelativePath(relativePath);
            if (validationError) {
              return errorResult(validationError);
            }

            const targetPath = normalize(resolve(outputDir, relativePath));
            if (!isWithinDirectory(targetPath, outputDir)) {
              return errorResult(`path escapes output directory: ${args.path}`);
            }

            mkdirSync(dirname(targetPath), { recursive: true });
            writeFileSync(targetPath, args.content, 'utf-8');

            logger.info('Generated code file written', {
              outputDir,
              path: relativePath,
              bytes: Buffer.byteLength(args.content, 'utf-8'),
            });

            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  ok: true,
                  path: relativePath,
                  bytes: Buffer.byteLength(args.content, 'utf-8'),
                }),
              }],
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return errorResult(`failed to write file: ${message}`);
          }
        },
      ),
    ],
  });
}

function validateRelativePath(path: string): string | null {
  if (!path || path === '.') return 'path is required';
  if (path.includes('\0')) return 'path contains invalid null byte';
  if (isAbsolute(path)) return 'path must be relative to the output directory';
  if (path.startsWith('..')) return 'path must not use parent directory traversal';
  if (path.includes('<') || path.includes('>')) return 'path must not contain unresolved placeholders';
  if (!path.includes('/')) return 'path must include the target folder name, for example parcel-detail/index.tsx';
  return null;
}

function isWithinDirectory(targetPath: string, directory: string): boolean {
  const relativePath = relative(directory, targetPath);
  return relativePath === '' || (!!relativePath && !relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function errorResult(message: string) {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        ok: false,
        error: message,
      }),
    }],
  };
}
