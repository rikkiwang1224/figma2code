/**
 * 元数据加载器
 * 负责从 JSON 文件加载组件库元数据，并提供缓存机制
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ComponentLibrary } from '../../../runtime/types/platform.js';
import type { ComponentSummary, DetailedProp } from '../types';
import { createLogger } from '../../../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const logger = createLogger('Figma2Code.MetadataLoader');

/**
 * 组件元数据文件结构
 */
export interface ComponentMetadataFile {
  library: ComponentLibrary;
  version: string;
  generatedAt: string;
  generator: string;
  components: ComponentMetadata[];
}

/**
 * 组件元数据（与 ComponentSummary 兼容）
 */
export interface ComponentMetadata extends ComponentSummary {
  category?: string;
  importPath?: string;
  exportName?: string;
  subComponents?: string[];
  tags?: string[];
  examples?: string[];
  deprecated?: boolean;
  deprecationMessage?: string;
}

/**
 * 元数据加载器
 */
export class MetadataLoader {
  private cache = new Map<ComponentLibrary, ComponentMetadata[]>();
  private metadataDir: string;

  constructor(metadataDir?: string) {
    this.metadataDir = metadataDir || join(__dirname, '../../component-data/metadata');
  }

  /**
   * 加载指定组件库的元数据
   */
  async load(library: ComponentLibrary): Promise<ComponentMetadata[]> {
    if (this.cache.has(library)) {
      return this.cache.get(library)!;
    }

    const metadata = await this.loadFromFile(library);
    this.cache.set(library, metadata);
    return metadata;
  }

  /**
   * 预加载所有组件库的元数据
   */
  async preload(): Promise<void> {
    const libraries: ComponentLibrary[] = ['antd', 'ant-design-pro-components'];

    await Promise.all(
      libraries.map((library) => this.load(library).catch((error) => {
        logger.warn('Failed to preload component library', { 
          library, 
          error: String(error) 
        });
        return [];
      }))
    );
  }

  /**
   * 从 JSON 文件加载元数据
   */
  private async loadFromFile(library: ComponentLibrary): Promise<ComponentMetadata[]> {
    const filePath = join(this.metadataDir, `${library}.json`);

    if (!existsSync(filePath)) {
      logger.warn('Metadata file not found', { library, filePath });
      return [];
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const data: ComponentMetadataFile = JSON.parse(content);

      // 基本验证
      if (!data.components || !Array.isArray(data.components)) {
        throw new Error(`Invalid metadata format: components is not an array`);
      }

      return data.components;
    } catch (error) {
      logger.error('Failed to load metadata', error, { library, filePath });
      throw error;
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 清除指定组件库的缓存
   */
  clearCacheForLibrary(library: ComponentLibrary): void {
    this.cache.delete(library);
  }
}
