/**
 * TeamCity Swagger specification validator
 */
import { info, warn } from '@/utils/logger';

import type { SwaggerSpec } from './swagger-fetcher';

export interface ValidationResult {
  isValid: boolean;
  errors?: string[];
  warnings?: string[];
  version?: string;
  teamCityVersion?: string;
  hasRequiredPaths?: boolean;
}

export class SwaggerValidator {
  private requiredPaths = [
    '/app/rest/builds',
    '/app/rest/projects',
    '/app/rest/buildTypes',
    '/app/rest/vcs-roots',
  ];

  /**
   * Validate a Swagger/OpenAPI specification
   */
  validateSpec(spec: unknown): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.isValidSpec(spec)) {
      errors.push('Invalid specification format');
      return { isValid: false, errors };
    }

    const typedSpec = spec;

    // Check for required fields
    if (typedSpec.info === undefined || typedSpec.info === null) {
      errors.push('Missing required fields: info');
    }
    if (typedSpec.paths === undefined || typedSpec.paths === null) {
      errors.push('Missing required fields: paths');
    }

    // Determine spec version
    const version = typedSpec.swagger ?? typedSpec.openapi;
    if (version === undefined || version === null || version === '') {
      errors.push('Missing specification version (swagger or openapi field)');
    }

    // Extract TeamCity version
    const teamCityVersion = this.extractTeamCityVersion(typedSpec);

    // Check for required paths
    const hasRequiredPaths = this.checkRequiredPaths(typedSpec);
    if (!hasRequiredPaths) {
      warnings.push('Some required TeamCity API paths are missing');
    }

    // Validate spec version compatibility
    if (version !== undefined && version !== null && version !== '') {
      if (version.startsWith('2.')) {
        info('Detected Swagger 2.0 specification');
      } else if (version.startsWith('3.')) {
        info('Detected OpenAPI 3.0 specification');
      } else {
        warnings.push(`Unknown specification version: ${version}`);
      }
    }

    const isValid = errors.length === 0;

    if (isValid) {
      info('Swagger specification validation passed', {
        version,
        teamCityVersion,
        pathCount: Object.keys(typedSpec.paths ?? {}).length,
      });
    } else {
      warn('Swagger specification validation failed', { errors });
    }

    const result: ValidationResult = { isValid };

    if (version !== undefined) {
      result.version = version;
    }

    if (teamCityVersion !== undefined) {
      result.teamCityVersion = teamCityVersion;
    }

    if (hasRequiredPaths !== undefined) {
      result.hasRequiredPaths = hasRequiredPaths;
    }

    if (errors.length > 0) {
      result.errors = errors;
    }

    if (warnings.length > 0) {
      result.warnings = warnings;
    }

    return result;
  }

  /**
   * Type guard to check if object is a valid spec
   */
  private isValidSpec(spec: unknown): spec is SwaggerSpec {
    if (spec === null || spec === undefined || typeof spec !== 'object') {
      return false;
    }

    const obj = spec as Record<string, unknown>;

    // Must have either swagger or openapi field
    if (!('swagger' in obj) && !('openapi' in obj)) {
      return false;
    }

    // Must have info object
    if (obj['info'] === null || obj['info'] === undefined || typeof obj['info'] !== 'object') {
      return false;
    }

    const info = obj['info'] as Record<string, unknown>;

    // Info must have version and title
    if (info['version'] === null || info['version'] === undefined || info['title'] === undefined) {
      return false;
    }

    return true;
  }

  /**
   * Extract TeamCity version from spec
   */
  private extractTeamCityVersion(spec: SwaggerSpec): string | undefined {
    // TeamCity version is typically in info.version
    const version = spec.info?.version;
    if (version !== undefined && version !== '') {
      // TeamCity versions look like "2023.11.2" or "2024.1"
      const versionMatch = version.match(/\d{4}\.\d{1,2}(?:\.\d+)?/);
      if (versionMatch) {
        return versionMatch[0];
      }
    }

    // Fallback: check description for version info
    const description = spec.info?.description;
    if (description !== undefined && description !== '') {
      const versionMatch = description.match(/TeamCity (\d{4}\.\d{1,2}(?:\.\d+)?)/);
      if (versionMatch) {
        return versionMatch[1];
      }
    }

    return version; // Return raw version if no pattern match
  }

  /**
   * Check if spec contains required TeamCity paths
   */
  private checkRequiredPaths(spec: SwaggerSpec): boolean {
    if (spec.paths === undefined || spec.paths === null) {
      return false;
    }

    const paths = Object.keys(spec.paths);
    const foundPaths = this.requiredPaths.filter((required) =>
      paths.some((path) => path.startsWith(required))
    );

    return foundPaths.length >= this.requiredPaths.length / 2; // At least half should be present
  }

  /**
   * Check if TeamCity version is supported
   */
  isVersionSupported(version: string): boolean {
    // We support TeamCity 2020.1 and later
    const minYear = 2020;
    const minMinor = 1;

    const match = version.match(/(\d{4})\.(\d{1,2})/);
    if (
      match?.[1] === undefined ||
      match?.[1] === '' ||
      match[2] === undefined ||
      match[2] === ''
    ) {
      return false;
    }

    const year = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);

    if (year < minYear) {
      return false;
    }
    if (year === minYear && minor < minMinor) {
      return false;
    }

    return true;
  }
}
