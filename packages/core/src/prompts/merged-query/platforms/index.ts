import { antDesignMergedQueryProfile } from './ant-design/profile.js';
import type { MergedQueryPlatformProfile } from './types.js';

const profiles: Record<string, MergedQueryPlatformProfile> = {
  'ant-design': antDesignMergedQueryProfile,
};

export function getMergedQueryPlatformProfile(
  adapterId = 'ant-design',
): MergedQueryPlatformProfile {
  const profile = profiles[adapterId];
  if (!profile) {
    throw new Error(
      `No merged-query platform profile for adapter "${adapterId}". Available: ${Object.keys(profiles).join(', ')}`,
    );
  }
  return profile;
}

export type { MergedQueryPlatformProfile, MergedQueryComponentLibrary } from './types.js';
