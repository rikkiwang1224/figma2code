import type { MergedQueryPlatformProfile } from '../types.js';
import { buildAntDesignComponentSelectionPrompt } from './componentSelectionPrompt.js';
import { buildAntDesignSourceQueryPrompt } from './sourceQueryPrompt.js';

export const antDesignMergedQueryProfile: MergedQueryPlatformProfile = {
  platform: 'pc',
  platformLabel: 'PC Web (Ant Design)',
  componentCatalogPlatform: 'ant-design',
  componentLibraries: ['antd', 'ant-design-pro-components'],
  iconImportPackage: '@ant-design/icons',
  requiredSkills: ['common-template'],
  pagePatternSkillName: 'page-patterns',
  pagePatternReferenceDir: '.claude/skills/page-patterns/reference',
  buildComponentSelectionPrompt: buildAntDesignComponentSelectionPrompt,
  buildSourceQueryPrompt: buildAntDesignSourceQueryPrompt,
};
