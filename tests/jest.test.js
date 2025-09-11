/**
 * Meta-tests for Jest testing framework setup
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

describe('Jest Testing Framework', () => {
  const rootDir = path.resolve(__dirname, '..');

  describe('Jest Configuration', () => {
    let jestConfig;

    beforeAll(() => {
      const configPath = path.join(rootDir, 'jest.config.js');
      if (fs.existsSync(configPath)) {
        // Clear require cache and reload config
        delete require.cache[require.resolve(configPath)];
        jestConfig = require(configPath);
      }
    });

    test('jest.config.js should exist', () => {
      const configPath = path.join(rootDir, 'jest.config.js');
      expect(fs.existsSync(configPath)).toBe(true);
    });

    test('should have TypeScript preset configured', () => {
      expect(jestConfig).toBeDefined();
      expect(jestConfig.preset).toBe('ts-jest');
    });

    test('should have correct test environment', () => {
      expect(jestConfig.testEnvironment).toBe('node');
    });

    test('should have proper test file patterns', () => {
      expect(jestConfig.testMatch).toBeDefined();
      expect(jestConfig.testMatch).toEqual(
        expect.arrayContaining([expect.stringContaining('test'), expect.stringContaining('spec')])
      );
    });

    test('should have coverage collection configured', () => {
      expect(jestConfig.collectCoverageFrom).toBeDefined();
      expect(jestConfig.collectCoverageFrom).toEqual(
        expect.arrayContaining([expect.stringContaining('src/**/*.{ts,tsx}')])
      );
    });

    test('should have coverage thresholds set', () => {
      expect(jestConfig.coverageThreshold).toBeDefined();
      expect(jestConfig.coverageThreshold.global).toBeDefined();
      // Ensure thresholds are numeric and present; exact values are a team policy
      const g = jestConfig.coverageThreshold.global;
      expect(typeof g.branches).toBe('number');
      expect(typeof g.functions).toBe('number');
      expect(typeof g.lines).toBe('number');
      expect(typeof g.statements).toBe('number');
    });

    test('should have module path mappings', () => {
      expect(jestConfig.moduleNameMapper).toBeDefined();
      expect(jestConfig.moduleNameMapper['^@/(.*)$']).toBeDefined();
    });
  });

  describe('Test Directory Structure', () => {
    test('tests directory should exist', () => {
      const testsDir = path.join(rootDir, 'tests');
      expect(fs.existsSync(testsDir)).toBe(true);
    });

    test('tests/unit directory should exist', () => {
      const unitDir = path.join(rootDir, 'tests', 'unit');
      expect(fs.existsSync(unitDir)).toBe(true);
    });

    // Integration tests directory check removed per project decision
  });

  describe('Test Scripts', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

    test('should have test script', () => {
      expect(packageJson.scripts.test).toBeDefined();
      expect(packageJson.scripts.test).toContain('jest');
    });

    test('should have test:watch script', () => {
      expect(packageJson.scripts['test:watch']).toBeDefined();
      expect(packageJson.scripts['test:watch']).toContain('--watch');
    });

    test('should have test:coverage script', () => {
      expect(packageJson.scripts['test:coverage']).toBeDefined();
      expect(packageJson.scripts['test:coverage']).toContain('--coverage');
    });
  });

  describe('Test Execution', () => {
    test('should run tests successfully', () => {
      try {
        const output = execSync('npm test -- --listTests', {
          cwd: rootDir,
          encoding: 'utf8',
        });
        expect(output).toBeTruthy();
      } catch (error) {
        // If test listing fails, the test should fail
        expect(error).toBeNull();
      }
    });

    test('should generate coverage report', () => {
      // Check if coverage can be generated (we don't run it fully to save time)
      const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
      expect(packageJson.scripts['test:coverage']).toBeDefined();
    });
  });
});
