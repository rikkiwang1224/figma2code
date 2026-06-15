import { isAbsolute, relative } from 'path';

export function isWithinDirectory(targetPath: string, directory: string): boolean {
  const rel = relative(directory, targetPath);
  return rel === '' || (!!rel && !rel.startsWith('..') && !isAbsolute(rel));
}
