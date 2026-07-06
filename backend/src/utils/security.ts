import * as path from 'node:path';

const MAX_FILE_SIZE = 1024 * 1024;

export function validateFilePath(filePath: string, allowedDir: string): boolean {
  const resolved = path.resolve(filePath);
  const resolvedAllowed = path.resolve(allowedDir);
  return resolved.startsWith(resolvedAllowed + path.sep) || resolved === resolvedAllowed;
}

export function validateFileSize(size: number): boolean {
  return size > 0 && size <= MAX_FILE_SIZE;
}

export function sanitizeContent(content: string): string {
  return content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}
