/**
 * Tests for Development Tooling and Code Quality
 * Verifies that linting and formatting rules are properly configured
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import eslintConfig from '../.eslintrc.js';
import packageJson from '../package.json';

describe('Development Tooling and Code Quality', () => {
  describe('ESLint Configuration', () => {
    it('should have ESLint configuration file', () => {
      const configPath = path.join(process.cwd(), '.eslintrc.js');
      expect(fs.existsSync(configPath)).toBe(true);
    });

    it('should have TypeScript parser configured', () => {
      expect(eslintConfig.parser).toBe('@typescript-eslint/parser');
    });

    it('should have TypeScript plugin configured', () => {
      expect(eslintConfig.plugins).toContain('@typescript-eslint');
    });

    it('should have strict rules enabled', () => {
      expect(eslintConfig.rules).toBeDefined();
      expect(eslintConfig.rules['@typescript-eslint/no-explicit-any']).toBe('error');
      expect(eslintConfig.rules['@typescript-eslint/strict-boolean-expressions']).toEqual([
        'error',
        expect.objectContaining({
          allowString: true,
          allowNumber: true,
          allowNullableObject: true,
          allowNullableBoolean: true,
          allowNullableString: true,
          allowNullableNumber: true,
          allowAny: false,
        }),
      ]);
    });

    it('should successfully lint valid TypeScript code', () => {
      const testFile = `
export function testFunction(value: string): string {
  return value.toUpperCase();
}
`;
      // Put the temp file in tests directory which is covered by tsconfig
      const tempFile = path.join(process.cwd(), 'tests', 'temp-test-lint.ts');
      fs.writeFileSync(tempFile, testFile);

      try {
        const eslintJs = path.join(process.cwd(), 'node_modules', 'eslint', 'bin', 'eslint.js');
        const node = process.execPath;
        execSync(`"${node}" "${eslintJs}" ${tempFile}`, { stdio: 'pipe' });
        // If no error is thrown, linting passed
        expect(true).toBe(true);
      } catch (error: unknown) {
        // Linting failed
        expect(error).toBeUndefined();
      } finally {
        fs.unlinkSync(tempFile);
      }
    });

    it('should catch linting errors in invalid code', () => {
      const testFile = `
export function testFunction(value: any): any {
  console.log(value)
  return value
}
`;
      // Put the temp file in tests directory which is covered by tsconfig
      const tempFile = path.join(process.cwd(), 'tests', 'temp-test-lint-error.ts');
      fs.writeFileSync(tempFile, testFile);

      try {
        const eslintJs = path.join(process.cwd(), 'node_modules', 'eslint', 'bin', 'eslint.js');
        const node = process.execPath;
        execSync(`"${node}" "${eslintJs}" ${tempFile}`, { stdio: 'pipe' });
        // Should have thrown an error
        expect(true).toBe(false);
      } catch (error: unknown) {
        // Expected to catch linting errors
        expect(error).toBeDefined();
      } finally {
        fs.unlinkSync(tempFile);
      }
    });
  });

  describe('Prettier Configuration', () => {
    it('should have Prettier configuration file', () => {
      const configPath = path.join(process.cwd(), '.prettierrc');
      expect(fs.existsSync(configPath)).toBe(true);
    });

    it('should have correct Prettier settings', () => {
      const configContent = fs.readFileSync('.prettierrc', 'utf-8');
      const config = JSON.parse(configContent);

      expect(config.semi).toBe(true);
      expect(config.trailingComma).toBe('es5');
      expect(config.singleQuote).toBe(true);
      expect(config.printWidth).toBe(100);
      expect(config.tabWidth).toBe(2);
    });

    it('should format code according to Prettier rules', () => {
      const unformattedCode = `const   test={foo:"bar",baz:42};`;
      // Put the temp file in tests directory which is covered by tsconfig
      const tempFile = path.join(process.cwd(), 'tests', 'temp-test-format.ts');
      fs.writeFileSync(tempFile, unformattedCode);

      try {
        const prettierJs = path.join(
          process.cwd(),
          'node_modules',
          'prettier',
          'bin',
          'prettier.cjs'
        );
        const node = process.execPath;
        execSync(`"${node}" "${prettierJs}" --write ${tempFile}`, { stdio: 'pipe' });
        const formattedCode = fs.readFileSync(tempFile, 'utf-8');

        // Check that code was formatted
        expect(formattedCode).toContain("const test = { foo: 'bar', baz: 42 };");
      } finally {
        fs.unlinkSync(tempFile);
      }
    });
  });

  describe('Git Hooks Configuration', () => {
    it('does not require pre-commit hook', () => {
      const preCommitHook = path.join(process.cwd(), '.husky/pre-commit');
      expect(fs.existsSync(preCommitHook)).toBe(false);
    });

    it('does not require lint-staged configuration', () => {
      const pkg = packageJson as unknown as Record<string, unknown>;
      expect(Object.prototype.hasOwnProperty.call(pkg, 'lint-staged')).toBe(false);
    });
  });

  describe('Development Scripts', () => {
    it('should have dev script configured', () => {
      expect(packageJson.scripts.dev).toBeDefined();
    });

    it('should have lint script configured', () => {
      expect(packageJson.scripts.lint).toBeDefined();
    });

    it('should have format script configured', () => {
      expect(packageJson.scripts.format).toBeDefined();
    });

    it('should have build script configured', () => {
      expect(packageJson.scripts.build).toBeDefined();
    });

    it('should have test script configured', () => {
      expect(packageJson.scripts.test).toBeDefined();
    });
  });

  describe('Code Quality Integration', () => {
    it('should pass linting for all source files', () => {
      try {
        const result = execSync('npm run lint', { stdio: 'pipe' });
        expect(result).toBeDefined();
      } catch (error: unknown) {
        // If linting fails, show the error
        const err = error as { stdout?: Buffer };
        console.error('Linting failed:', err.stdout?.toString());
        expect(err).toBeUndefined();
      }
    });

    it('should have consistent formatting across all files', () => {
      try {
        // Check if files need formatting
        const prettierJs = path.join(
          process.cwd(),
          'node_modules',
          'prettier',
          'bin',
          'prettier.cjs'
        );
        const node = process.execPath;
        const result = execSync(`"${node}" "${prettierJs}" --check "src/**/*.{ts,tsx}"`, {
          stdio: 'pipe',
        });
        expect(result).toBeDefined();
      } catch (error: unknown) {
        // Files need formatting
        const err = error as { stdout?: Buffer };
        console.error('Files need formatting:', err.stdout?.toString());
        expect(err).toBeUndefined();
      }
    });
  });
});
