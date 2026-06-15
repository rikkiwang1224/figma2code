import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ComponentExample,
  ComponentLibraryAdapter,
  ComponentMeta,
} from '@figma2code/component-adapter';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface MetadataFile {
  library: string;
  version: string;
  components: ComponentMeta[];
}

function loadMetadata(): MetadataFile {
  const path = join(__dirname, '../metadata/components.json');
  return JSON.parse(readFileSync(path, 'utf-8')) as MetadataFile;
}

export function createAntDesignAdapter(): ComponentLibraryAdapter {
  const metadata = loadMetadata();
  const byName = new Map(metadata.components.map((c) => [c.name, c]));

  return {
    id: 'ant-design',
    displayName: 'Ant Design',
    npmPackage: 'antd',
    iconPackage: '@ant-design/icons',

    async listComponents() {
      return metadata.components;
    },

    async getComponentSource(name) {
      const component = byName.get(name);
      if (!component) return null;
      return `import { ${component.exportName ?? component.name} } from '${component.importPath}';`;
    },

    async getExamples(name) {
      const component = byName.get(name);
      if (!component) return [];

      const examples: ComponentExample[] = [
        {
          name: 'basic',
          description: `${component.displayName ?? component.name} basic usage`,
          code: `import React from 'react';\nimport { ${component.exportName ?? component.name} } from '${component.importPath}';\n\nexport default () => <${component.exportName ?? component.name} />;`,
        },
      ];

      return examples;
    },

    async getTypeDefinitions() {
      return null;
    },

    buildLibraryPromptSection() {
      return [
        '## Component Library: Ant Design (antd)',
        '',
        '- Prefer antd components over raw HTML for forms, tables, modals, drawers, tabs, etc.',
        '- Import from `antd`, e.g. `import { Button, Table, Form } from \'antd\'`.',
        '- Use `@ant-design/pro-components` only when the design clearly needs ProTable/ProForm patterns.',
        '- Follow antd recommended layout: `Layout`, `Space`, `Flex`, `Row`/`Col`.',
      ].join('\n');
    },

    buildIconPromptSection() {
      return [
        '## Icons: @ant-design/icons',
        '',
        '- Import named icons, e.g. `import { SearchOutlined } from \'@ant-design/icons\'`.',
        '- Do not use custom SVG unless the design requires an icon not in antd icons.',
      ].join('\n');
    },
  };
}

export { createAntDesignAdapter as default };
