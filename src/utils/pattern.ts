/**
 * Pattern matching utilities for glob-to-regex conversion
 *
 * This module provides secure pattern conversion that properly escapes
 * all regex metacharacters to prevent regex injection attacks.
 */

/**
 * Regex special characters that need escaping when converting patterns.
 * This includes all regex metacharacters except glob wildcards (* and ?).
 *
 * Characters escaped: . + ^ $ { } ( ) | [ ] \
 */
export const REGEX_SPECIAL_CHARS = /[.+^${}()|[\]\\]/g;

/**
 * Convert a glob pattern to a RegExp, properly escaping all special characters.
 *
 * This function addresses CVE-related security concerns by ensuring all regex
 * metacharacters (including backslashes) are escaped before wildcard conversion.
 *
 * Supported glob syntax:
 * - `*` matches any sequence of characters (becomes `.*`)
 * - `?` matches any single character (becomes `.`)
 *
 * @param pattern - The glob pattern to convert
 * @param flags - Optional regex flags (e.g., 'i' for case-insensitive)
 * @returns A RegExp that matches the pattern anchored at start and end
 *
 * @example
 * ```typescript
 * globToRegex('*.txt').test('file.txt')       // true
 * globToRegex('test?').test('test1')          // true
 * globToRegex('file.name').test('file.name')  // true (dot escaped)
 * globToRegex('foo', 'i').test('FOO')         // true (case-insensitive)
 * ```
 */
export function globToRegex(pattern: string, flags?: string): RegExp {
  const escaped = pattern
    .replace(REGEX_SPECIAL_CHARS, '\\$&') // Escape special chars first (security fix)
    .replace(/\*/g, '.*') // * -> .* (match any characters)
    .replace(/\?/g, '.'); // ? -> . (match single character)
  return new RegExp(`^${escaped}$`, flags);
}
