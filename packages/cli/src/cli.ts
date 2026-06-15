#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAdapterRegistry } from '@figma2code/component-adapter';
import { generateCode, loadAgentConfig, previewMergedQueryPrompt } from '@figma2code/core';
import { createAntDesignAdapter } from '@figma2code/adapter-ant-design';

loadEnv();

interface GenerateOptions {
  url: string;
  adapter: string;
  out: string;
  folderName?: string;
  stream: boolean;
}

function parseArgs(argv: string[]): {
  command?: string;
  subcommand?: string;
  options: Partial<GenerateOptions>;
} {
  const options: Partial<GenerateOptions> = {
    adapter: 'ant-design',
    out: './output',
    stream: true,
  };

  let command: string | undefined;
  let subcommand: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (!command && !arg.startsWith('-')) {
      command = arg;
      continue;
    }

    if (command === 'prompt' && !subcommand && !arg.startsWith('-')) {
      subcommand = arg;
      continue;
    }

    switch (arg) {
      case '--url':
      case '-u':
        options.url = argv[++i];
        break;
      case '--adapter':
      case '-a':
        options.adapter = argv[++i];
        break;
      case '--out':
      case '-o':
        options.out = argv[++i];
        break;
      case '--folder-name':
        options.folderName = argv[++i];
        break;
      case '--no-stream':
        options.stream = false;
        break;
      default:
        break;
    }
  }

  return { command, subcommand, options };
}

function printHelp(): void {
  console.log(`figma2code - Figma design to React code

Usage:
  figma2code generate --url <figma-url> [options]
  figma2code prompt preview --url <figma-url> [options]

Commands:
  generate                  Run merged-query code generation
  prompt preview            Print merged-query system prompt (no LLM call)
  init                      Create a local .env file

Options:
  -u, --url <url>           Figma design URL (required)
  -a, --adapter <id>        Component adapter (default: ant-design)
  -o, --out <dir>           Output directory (default: ./output)
      --folder-name <name>  Generated folder name prefix
      --no-stream           Disable streaming logs
  -h, --help                Show help

Environment:
  FIGMA_API_KEY             Figma REST API key
  ANTHROPIC_API_KEY         Claude API key
`);
}

async function runGenerate(options: GenerateOptions): Promise<number> {
  if (!options.url) {
    console.error('Error: --url is required');
    return 1;
  }

  const cwd = process.cwd();
  const outDir = resolve(cwd, options.out);
  mkdirSync(outDir, { recursive: true });

  const registry = createAdapterRegistry([createAntDesignAdapter()]);
  const adapter = registry.get(options.adapter);

  const config = loadAgentConfig({ cwd, outputDir: outDir });

  console.log(`Figma2Code generate`);
  console.log(`  adapter:   ${adapter.displayName} (${adapter.id})`);
  console.log(`  mode:      merged-query`);
  console.log(`  output:    ${outDir}`);
  console.log(`  figma url: ${options.url}`);
  console.log('');

  try {
    let fileCount = 0;
    for await (const message of generateCode({
      figmaUrl: options.url,
      adapterId: adapter.id,
      folderName: options.folderName,
      cwd,
      outputDir: outDir,
    })) {
      if (message.type === 'system' && message.subtype === 'result') {
        const files = message.files as Array<{ name: string }> | undefined;
        fileCount = files?.length ?? 0;
        console.log(`\nDone. Generated ${fileCount} file(s) in ${outDir}/`);
        continue;
      }
      if (message.type === 'text' && message.content) {
        if (options.stream) process.stdout.write(String(message.content));
        continue;
      }
      if (options.stream) {
        console.log(JSON.stringify(message));
      }
    }

    return 0;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\nGeneration failed: ${msg}`);
    return 1;
  }
}

async function runPromptPreview(options: GenerateOptions): Promise<number> {
  if (!options.url) {
    console.error('Error: --url is required');
    return 1;
  }

  const registry = createAdapterRegistry([createAntDesignAdapter()]);
  const adapter = registry.get(options.adapter);
  const prompt = previewMergedQueryPrompt({
    figmaUrl: options.url,
    adapterId: adapter.id,
    folderName: options.folderName,
    outputDir: resolve(process.cwd(), options.out),
  });

  console.log(prompt);
  console.error(`\n# prompt length: ${prompt.length} chars`);
  return 0;
}

async function main(): Promise<number> {
  const { command, subcommand, options } = parseArgs(process.argv.slice(2));

  if (!command || command === 'help' || process.argv.includes('-h') || process.argv.includes('--help')) {
    printHelp();
    return 0;
  }

  if (command === 'generate') {
    return runGenerate(options as GenerateOptions);
  }

  if (command === 'prompt' && subcommand === 'preview') {
    return runPromptPreview(options as GenerateOptions);
  }

  if (command === 'init') {
    const envExample = resolve(process.cwd(), '.env.example');
    const envTarget = resolve(process.cwd(), '.env');
    writeFileSync(envTarget, `# Copy from figma2code repo .env.example\nFIGMA_API_KEY=\nANTHROPIC_API_KEY=\n`);
    console.log(`Created ${envTarget}`);
    console.log(`See ${envExample} for all options.`);
    return 0;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  return 1;
}

main().then((code) => {
  process.exitCode = code;
});
