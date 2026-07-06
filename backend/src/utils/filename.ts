const MAX_FILENAME_LENGTH = 64;

/**
 * Sanitize a script name to be used as a filename.
 * - Lowercase
 * - Replace spaces with underscores
 * - Remove special characters (keep only alphanumeric, underscore, hyphen)
 * - Truncate to 64 characters
 */
export function sanitizeFilename(name: string): string {
  let sanitized = name
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^-+|-+$/g, '');

  if (sanitized.length === 0) {
    sanitized = 'untitled';
  }

  if (sanitized.length > MAX_FILENAME_LENGTH) {
    sanitized = sanitized.substring(0, MAX_FILENAME_LENGTH);
  }

  return sanitized;
}

/**
 * Generate a unique filename by appending a numeric suffix if needed.
 */
export function uniqueFilename(name: string, existingNames: Set<string>): string {
  const base = sanitizeFilename(name);
  if (!existingNames.has(base)) {
    return base;
  }

  for (let i = 1; i <= 1000; i++) {
    const candidate = `${base}_${i}`;
    if (!existingNames.has(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Could not generate unique filename for: ${name}`);
}
