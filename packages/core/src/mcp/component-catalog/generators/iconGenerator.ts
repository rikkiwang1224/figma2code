/**
 * 图标库元数据生成器
 * 从 SVG 文件扫描并生成图标库元数据 JSON
 */

import { readdirSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { IconMetadata, IconLibraryMetadata } from '../types/icon';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 图标库元数据生成器
 */
export class IconGenerator {
  /**
   * 从 SVG 目录生成图标元数据
   */
  async generate(svgDir: string): Promise<IconLibraryMetadata> {
    // 1. 扫描 PC 端图标
    const pcIcons = this.scanPCIcons(svgDir);
    
    // 2. 扫描移动端图标
    const h5Icons = this.scanMobileIcons(join(svgDir, 'app'));
    
    return {
      library: 'ssc-ui-icons',
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      generator: 'svg-scanner@1.0.0',
      icons: {
        pc: pcIcons,
        h5: h5Icons,
      },
    };
  }
  
  /**
   * 扫描 PC 端图标
   */
  private scanPCIcons(svgDir: string): IconMetadata[] {
    const icons: IconMetadata[] = [];
    
    if (!existsSync(svgDir)) {
      console.warn(`[IconGenerator] SVG 目录不存在: ${svgDir}`);
      return icons;
    }
    
    const entries = readdirSync(svgDir, { withFileTypes: true });
    
    for (const entry of entries) {
      // 跳过目录（包括 app 目录）
      if (entry.isDirectory()) {
        continue;
      }
      
      if (entry.isFile() && entry.name.endsWith('.svg')) {
        const icon = this.parsePCIconName(entry.name);
        if (icon) {
          icons.push(icon);
        }
      }
    }
    
    return icons.sort((a, b) => a.name.localeCompare(b.name));
  }
  
  /**
   * 扫描移动端图标
   */
  private scanMobileIcons(appDir: string): IconMetadata[] {
    const icons: IconMetadata[] = [];
    
    if (!existsSync(appDir)) {
      console.warn(`[IconGenerator] 移动端图标目录不存在: ${appDir}`);
      return icons;
    }
    
    const entries = readdirSync(appDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.svg')) {
        const icon = this.parseMobileIconName(entry.name);
        if (icon) {
          icons.push(icon);
        }
      }
    }
    
    return icons.sort((a, b) => {
      // 先按尺寸排序，再按名称排序
      const sizeA = parseInt(a.size || '0');
      const sizeB = parseInt(b.size || '0');
      const sizeCompare = sizeA - sizeB;
      return sizeCompare !== 0 ? sizeCompare : a.name.localeCompare(b.name);
    });
  }
  
  /**
   * 解析 PC 端图标名称
   * add-outline.svg → IconAddOutline
   */
  private parsePCIconName(filename: string): IconMetadata | null {
    const baseName = filename.replace(/\.svg$/, '');
    
    // 过滤 deprecated 和 alias
    if (baseName.includes('.deprecated') || baseName.includes('.alias')) {
      return null;
    }
    
    // 解析 {name}-{style} 格式
    const match = baseName.match(/^(.+)-(outline|filled|colored)$/);
    if (!match) {
      return null;
    }
    
    const [, namePart, style] = match;
    const name = `Icon${this.toPascalCase(namePart)}${this.capitalize(style)}`;
    
    return {
      name,
      platform: 'pc',
      style: this.capitalize(style) as 'Outline' | 'Filled' | 'Colored',
      category: this.categorizeIcon(name),
      importPath: '@ssc-ui-icons/icons-react',
      tags: this.extractTags(name),
    };
  }
  
  /**
   * 解析移动端图标名称
   * app-20-add-outline.svg → IconApp20AddOutline
   */
  private parseMobileIconName(filename: string): IconMetadata | null {
    const baseName = filename.replace(/\.svg$/, '');
    
    // 过滤 deprecated 和 alias
    if (baseName.includes('.deprecated') || baseName.includes('.alias')) {
      return null;
    }
    
    // 解析 app-{size}-{name}-{style} 格式
    const match = baseName.match(/^app-(\d+)-(.+)-(outline|filled|colored)$/);
    if (!match) {
      return null;
    }
    
    const [, size, namePart, style] = match;
    const name = `IconApp${size}${this.toPascalCase(namePart)}${this.capitalize(style)}`;
    
    return {
      name,
      platform: 'h5',
      size,
      style: this.capitalize(style) as 'Outline' | 'Filled' | 'Colored',
      category: this.categorizeIcon(name),
      importPath: '@ssc-ui-icons/icons-react/app',
      tags: this.extractTags(name),
    };
  }
  
  /**
   * 自动分类图标（基于名称关键词）
   */
  private categorizeIcon(iconName: string): IconMetadata['category'] {
    const lower = iconName.toLowerCase();
    
    if (/arrow|left|right|up|down|caret|double|fold/.test(lower)) {
      return 'arrow';
    } else if (/success|error|warning|info|notice|pending|loading|decline|fail/.test(lower)) {
      return 'status';
    } else if (/add|delete|edit|search|refresh|download|upload|copy|print|setting|crop|drag|rotate|zoom/.test(lower)) {
      return 'action';
    } else if (/menu|home|back|close|more|grid|list|fullscreen|expand|collapse/.test(lower)) {
      return 'nav';
    } else if (/file|image|video|attachment|document/.test(lower)) {
      return 'file';
    } else if (/user|shop|order|product|shipping|calendar|time|location|phone|email|inbound|outbound|procurement|inventory/.test(lower)) {
      return 'business';
    } else {
      return 'other';
    }
  }
  
  /**
   * 提取标签
   */
  private extractTags(iconName: string): string[] {
    const tags: string[] = [];
    const lower = iconName.toLowerCase();
    
    // 提取关键词作为标签
    const keywords = [
      'add', 'delete', 'edit', 'search', 'arrow', 'success', 'error', 
      'user', 'order', 'upload', 'download', 'refresh', 'copy', 'print',
      'setting', 'menu', 'home', 'close', 'file', 'image', 'video',
      'shop', 'product', 'shipping', 'calendar', 'time', 'location'
    ];
    
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        tags.push(keyword);
      }
    }
    
    return tags;
  }
  
  /**
   * kebab-case 转 PascalCase
   */
  private toPascalCase(str: string): string {
    return str
      .split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }
  
  /**
   * 首字母大写
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

/**
 * 生成图标库元数据文件
 */
export async function generateIconMetadata(): Promise<void> {
  const rootDir = join(__dirname, '../../../../..');
  
  // SVG 文件目录（优先从 npm 包获取，回退到旧路径）
  const possibleSvgDirs = [
    // 从 npm 包获取（推荐）
    join(rootDir, 'node_modules/@ssc-ui-icons/icons-svg/svg'),
    join(rootDir, '../node_modules/@ssc-ui-icons/icons-svg/svg'),
    // pnpm 嵌套路径
    ...(() => {
      try {
        const pnpmDir = join(rootDir, 'node_modules/.pnpm');
        if (existsSync(pnpmDir)) {
          return readdirSync(pnpmDir)
            .filter(d => d.startsWith('@ssc-ui-icons+icons-svg'))
            .map(d => join(pnpmDir, d, 'node_modules/@ssc-ui-icons/icons-svg/svg'));
        }
      } catch {}
      return [];
    })(),
  ];
  
  let svgDir: string | null = null;
  for (const dir of possibleSvgDirs) {
    if (existsSync(dir)) {
      svgDir = dir;
      break;
    }
  }
  
  if (!svgDir) {
    console.error('[IconGenerator] ❌ 找不到 SVG 目录，请检查以下路径：');
    possibleSvgDirs.forEach(dir => console.error(`   - ${dir}`));
    throw new Error('SVG 目录不存在');
  }
  
  console.log(`[IconGenerator] 📦 开始生成图标库元数据...`);
  console.log(`[IconGenerator] 📁 SVG 目录: ${svgDir}`);
  
  const generator = new IconGenerator();
  const metadata = await generator.generate(svgDir);
  
  // 确保元数据目录存在
  const metadataDir = join(__dirname, '../metadata');
  if (!existsSync(metadataDir)) {
    mkdirSync(metadataDir, { recursive: true });
  }
  
  // 写入 JSON 文件
  const outputPath = join(metadataDir, 'ssc-ui-icons.json');
  writeFileSync(outputPath, JSON.stringify(metadata, null, 2), 'utf-8');
  
  console.log(`[IconGenerator] ✅ 图标库元数据已生成: ${outputPath}`);
  console.log(`[IconGenerator] 📊 PC 端图标: ${metadata.icons.pc.length} 个`);
  console.log(`[IconGenerator] 📊 H5 端图标: ${metadata.icons.h5.length} 个`);
  console.log(`[IconGenerator] 📊 总计: ${metadata.icons.pc.length + metadata.icons.h5.length} 个`);
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  generateIconMetadata().catch((error) => {
    console.error('[IconGenerator] ❌ 生成失败:', error);
    process.exit(1);
  });
}
