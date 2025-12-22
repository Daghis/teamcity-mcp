/**
 * Environment File Loader
 *
 * Loads .env format configuration files for CLI --config option.
 * Uses dotenv's parse function (already a project dependency).
 */
import { parse as dotenvParse } from 'dotenv';
import { readFileSync } from 'fs';

/**
 * Result of loading an env file
 */
export interface EnvFileResult {
  /** Whether the file was loaded successfully */
  success: boolean;
  /** Parsed key-value pairs */
  values?: Record<string, string>;
  /** Error message if loading failed */
  error?: string;
}

/**
 * Load and parse a .env format configuration file
 *
 * @param filepath - Path to the .env format file
 * @returns Parsed environment variables or error
 */
export function loadEnvFile(filepath: string): EnvFileResult {
  try {
    const content = readFileSync(filepath, 'utf-8');
    const values = dotenvParse(content);
    return {
      success: true,
      values,
    };
  } catch (err) {
    // Safely extract error information without assuming error structure
    const error = err instanceof Error ? err : new Error(String(err));
    const errno = err as NodeJS.ErrnoException;

    if (errno.code === 'ENOENT') {
      return {
        success: false,
        error: `Config file not found: ${filepath}`,
      };
    }
    if (errno.code === 'EACCES') {
      return {
        success: false,
        error: `Permission denied reading config file: ${filepath}`,
      };
    }
    return {
      success: false,
      error: `Failed to read config file: ${error.message}`,
    };
  }
}
