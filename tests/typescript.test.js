/**
 * Tests for TypeScript configuration and compilation
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

describe('TypeScript Configuration', () => {
  const rootDir = path.resolve(__dirname, '..');

  describe('tsconfig.json', () => {
    let tsConfig;

    beforeAll(() => {
      const configPath = path.join(rootDir, 'tsconfig.json');
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf8');
        tsConfig = JSON.parse(content);
      }
    });

    test('should exist', () => {
      expect(tsConfig).toBeDefined();
    });

    test('should have appropriate TypeScript settings', () => {
      expect(tsConfig.compilerOptions).toBeDefined();
      expect(tsConfig.compilerOptions.strict).toBe(true);
    });

    test('should target ES2022 or later', () => {
      expect(tsConfig.compilerOptions.target).toMatch(/ES2022|ES2023|ESNext/i);
    });

    test('should have proper module resolution', () => {
      expect(tsConfig.compilerOptions.moduleResolution).toMatch(/node/i);
      expect(tsConfig.compilerOptions.esModuleInterop).toBe(true);
    });

    test('should have path aliases configured', () => {
      expect(tsConfig.compilerOptions.paths).toBeDefined();
      expect(tsConfig.compilerOptions.paths['@/tools/*']).toBeDefined();
      expect(tsConfig.compilerOptions.paths['@/utils/*']).toBeDefined();
      expect(tsConfig.compilerOptions.paths['@/types/*']).toBeDefined();
    });

    test('should enable source maps', () => {
      expect(tsConfig.compilerOptions.sourceMap).toBe(true);
    });
  });

  describe('tsconfig.build.json', () => {
    let buildConfig;

    beforeAll(() => {
      const configPath = path.join(rootDir, 'tsconfig.build.json');
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf8');
        buildConfig = JSON.parse(content);
      }
    });

    test('should exist for production builds', () => {
      expect(buildConfig).toBeDefined();
    });

    test('should exclude test files', () => {
      expect(buildConfig.exclude).toBeDefined();
      expect(buildConfig.exclude).toEqual(
        expect.arrayContaining([expect.stringMatching(/test/), expect.stringMatching(/spec/)])
      );
    });
  });

  describe('TypeScript Compilation', () => {
    test('should compile without errors', () => {
      try {
        const tscScript = path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc');
        const node = process.execPath;
        execSync(`"${node}" "${tscScript}" --noEmit`, {
          cwd: rootDir,
          stdio: 'pipe',
        });
        expect(true).toBe(true);
      } catch (error) {
        // If compilation fails, the test should fail
        console.error('TypeScript compilation error:', error.stdout?.toString());
        expect(error).toBeNull();
      }
    });
  });

  describe('Type Definitions', () => {
    test('should have index.ts in src/types', () => {
      const typesIndexPath = path.join(rootDir, 'src', 'types', 'index.ts');
      expect(fs.existsSync(typesIndexPath)).toBe(true);
    });

    test('should export type definitions', () => {
      const typesIndexPath = path.join(rootDir, 'src', 'types', 'index.ts');
      if (fs.existsSync(typesIndexPath)) {
        const content = fs.readFileSync(typesIndexPath, 'utf8');
        expect(content).toContain('export');
      }
    });
  });
});
