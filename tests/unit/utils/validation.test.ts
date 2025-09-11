import { z } from 'zod';

import {
  CommonSchemas,
  createSanitizedStringSchema,
  createValidationMiddleware,
  sanitizeString,
  validateAndTransform,
  validateBranchName,
  validateBuildConfigId,
  validateBuildParameters,
  validateTeamCityUrl,
  validateWithSchema,
} from '@/utils/validation';

jest.mock('@/utils/error-logger', () => ({
  errorLogger: { logError: jest.fn() },
}));

describe('validation utilities', () => {
  describe('CommonSchemas', () => {
    it('validates teamCityUrl', () => {
      expect(CommonSchemas.teamCityUrl.safeParse('https://example.com').success).toBe(true);
      expect(CommonSchemas.teamCityUrl.safeParse('ftp://example.com').success).toBe(false);
      expect(CommonSchemas.teamCityUrl.safeParse('not-a-url').success).toBe(false);
    });

    it('validates buildConfigId', () => {
      expect(CommonSchemas.buildConfigId.safeParse('Proj_Build-1.2').success).toBe(true);
      expect(CommonSchemas.buildConfigId.safeParse('').success).toBe(false);
      expect(CommonSchemas.buildConfigId.safeParse('bad id').success).toBe(false);
    });

    it('validates branchName', () => {
      expect(CommonSchemas.branchName.safeParse('feature/abc').success).toBe(true);
      expect(CommonSchemas.branchName.safeParse('').success).toBe(false);
      expect(CommonSchemas.branchName.safeParse('bad name with spaces').success).toBe(false);
      expect(CommonSchemas.branchName.safeParse('bad~name').success).toBe(false);
    });

    it('validates buildParameters', () => {
      expect(
        CommonSchemas.buildParameters.safeParse({ A: 'a', B: 2, C: true, D: null }).success
      ).toBe(true);

      const res = CommonSchemas.buildParameters.safeParse({ A: {} });
      expect(res.success).toBe(false);
    });

    it('validates pagination with defaults', () => {
      const parsed = CommonSchemas.pagination.parse({});
      expect(parsed.limit).toBe(100);
      expect(parsed.offset).toBe(0);
      expect(CommonSchemas.pagination.safeParse({ limit: 0 }).success).toBe(false);
    });

    it('validates dateRange ordering', () => {
      const ok = CommonSchemas.dateRange.safeParse({
        from: '2024-01-01T00:00:00.000Z',
        to: '2024-02-01T00:00:00.000Z',
      });
      expect(ok.success).toBe(true);

      const bad = CommonSchemas.dateRange.safeParse({
        from: '2024-02-01T00:00:00.000Z',
        to: '2024-01-01T00:00:00.000Z',
      });
      expect(bad.success).toBe(false);
    });
  });

  describe('validateWithSchema', () => {
    it('returns success with parsed data', () => {
      const schema = z.object({ x: z.number() });
      const result = validateWithSchema({ x: 1 }, schema);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ x: 1 });
    });

    it('returns MCPValidationError on ZodError and logs', () => {
      const schema = z.object({ x: z.string() });
      const result = validateWithSchema({ x: 1 }, schema, { operation: 'op', field: 'x' });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { errorLogger } = require('@/utils/error-logger');
      expect(errorLogger.logError).toHaveBeenCalled();
    });

    it('handles unexpected errors gracefully', () => {
      const badSchema = {
        parse: () => {
          throw new Error('boom');
        },
      } as unknown as z.ZodSchema<{ x: number }>;
      const result = validateWithSchema({ x: 1 }, badSchema, { operation: 't', field: 'y' });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('validateAndTransform', () => {
    it('returns parsed data on success', () => {
      const schema = z.object({ a: z.string() });
      const out = validateAndTransform({ a: 'ok' }, schema);
      expect(out).toEqual({ a: 'ok' });
    });

    it('throws on failure', () => {
      const schema = z.object({ a: z.string() });
      expect(() => validateAndTransform({ a: 1 }, schema)).toThrow();
    });
  });

  describe('createValidationMiddleware', () => {
    it('validates input and returns value', () => {
      const middleware = createValidationMiddleware(z.object({ n: z.number() }));
      const out = middleware({ n: 2 }, 'tool');
      expect(out).toEqual({ n: 2 });
    });

    it('throws MCPValidationError on failure', () => {
      const middleware = createValidationMiddleware(z.object({ n: z.number() }));
      expect(() => middleware({ n: 'bad' }, 'tool')).toThrow();
    });
  });

  describe('sanitizeString and schemas', () => {
    it('sanitizes control chars, trims, and truncates', () => {
      const input = `\u0007  hello\nworld  ${'x'.repeat(300)}`;
      const out = sanitizeString(input, 10);
      expect(out.length).toBe(10);
      expect(out.includes('\u0007')).toBe(false);
      expect(out.includes('\n')).toBe(false);
    });

    it('returns empty for non-string', () => {
      // @ts-expect-error testing runtime behavior
      expect(sanitizeString(undefined)).toBe('');
    });

    it('createSanitizedStringSchema transforms value', () => {
      const schema = createSanitizedStringSchema(5);
      const res = schema.parse('  abcdef  ');
      expect(res).toBe('abcde');
    });
  });

  describe('deprecated helpers', () => {
    it('validateTeamCityUrl / validateBuildConfigId / validateBranchName', () => {
      expect(validateTeamCityUrl('https://example.com')).toBe(true);
      expect(validateTeamCityUrl('not-a-url')).toBe(false);
      expect(validateBuildConfigId('ABC_1-2.3')).toBe(true);
      expect(validateBuildConfigId('bad id')).toBe(false);
      expect(validateBranchName('main')).toBe(true);
      expect(validateBranchName('bad name')).toBe(false);
    });

    it('validateBuildParameters returns errors for invalid map', () => {
      const ok = validateBuildParameters({ P: 'x', Q: 1 });
      expect(ok.valid).toBe(true);

      const bad = validateBuildParameters({ P: {} as unknown as string });
      expect(bad.valid).toBe(false);
      expect(bad.errors.length).toBeGreaterThan(0);
    });
  });
});
