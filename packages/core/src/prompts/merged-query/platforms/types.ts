export type MergedQueryComponentLibrary = 'antd' | 'ant-design-pro-components';

export interface MergedQueryPlatformProfile {
  platform: 'pc';
  platformLabel: string;
  componentCatalogPlatform: string;
  componentLibraries: MergedQueryComponentLibrary[];
  iconImportPackage: string;
  requiredSkills: string[];
  pagePatternSkillName?: string;
  pagePatternReferenceDir?: string;
  buildComponentSelectionPrompt: () => string;
  buildSourceQueryPrompt: () => string;
}
