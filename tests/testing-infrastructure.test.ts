/**
 * Meta-tests for Testing Framework
 * Tests that verify Jest is properly configured and working
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import jestConfig from '../jest.config.js';
import packageJson from '../package.json';

describe('Testing Infrastructure Meta-Tests', () => {
  describe('Jest Configuration', () => {
    it('should have Jest configuration file', () => {
      const configPath = path.join(process.cwd(), 'jest.config.js');
      expect(fs.existsSync(configPath)).toBe(true);
    });

    it('should have TypeScript preset configured', () => {
      expect(jestConfig.preset).toBe('ts-jest');
    });

    it('should have correct test environment', () => {
      expect(jestConfig.testEnvironment).toBe('node');
    });

    it('should have test match patterns configured', () => {
      expect(jestConfig.testMatch).toBeDefined();
      expect(jestConfig.testMatch).toContain('**/__tests__/**/*.test.ts');
      expect(jestConfig.testMatch).toContain('**/*.test.ts');
    });

    it('should have module name mapper for path aliases', () => {
      const mapper = jestConfig.moduleNameMapper as Record<string, string> | undefined;
      expect(mapper).toBeDefined();
      expect(mapper?.['^@/(.*)$']).toBe('<rootDir>/src/$1');
    });

    it('should have coverage configuration', () => {
      expect(jestConfig.collectCoverageFrom).toBeDefined();
      expect(jestConfig.collectCoverageFrom).toContain('src/**/*.{ts,tsx}');
      expect(jestConfig.coverageDirectory).toBe('coverage');
    });

    it('should have coverage thresholds configured', () => {
      const thresholds = jestConfig.coverageThreshold as
        | { global?: { branches: number; functions: number; lines: number; statements: number } }
        | undefined;
      expect(thresholds).toBeDefined();
      expect(thresholds?.global).toBeDefined();
      const g = thresholds?.global as {
        branches: number;
        functions: number;
        lines: number;
        statements: number;
      };
      expect(typeof g.branches).toBe('number');
      expect(typeof g.functions).toBe('number');
      expect(typeof g.lines).toBe('number');
      expect(typeof g.statements).toBe('number');
    });
  });

  describe('Test Execution', () => {
    it('should run tests with npm test command', () => {
      expect(packageJson.scripts.test).toBeDefined();
      expect(packageJson.scripts.test).toContain('jest');
    });

    it('should run tests with coverage', () => {
      expect(packageJson.scripts['test:coverage']).toBeDefined();
      expect(packageJson.scripts['test:coverage']).toContain('--coverage');
    });

    it('should run tests in watch mode', () => {
      expect(packageJson.scripts['test:watch']).toBeDefined();
      expect(packageJson.scripts['test:watch']).toContain('--watch');
    });

    it('should execute a simple test successfully', () => {
      // Create a temporary test file in tests directory
      const tempTestContent = `
describe('Temporary Test', () => {
  it('should pass', () => {
    expect(1 + 1).toBe(2);
  });
});
`;
      const tempTestFile = path.join(process.cwd(), 'tests', 'temp-infra-exec.spec.ts');
      fs.writeFileSync(tempTestFile, tempTestContent);

      try {
        // Run the test
        const result = execFileSync('npx', ['jest', tempTestFile, '--silent'], {
          stdio: 'pipe',
        });
        expect(result).toBeDefined();
      } finally {
        // Clean up
        fs.unlinkSync(tempTestFile);
      }
    });
  });

  describe('TypeScript Support', () => {
    it('should have ts-jest installed', () => {
      expect(packageJson.devDependencies['ts-jest']).toBeDefined();
    });

    it('should have @types/jest installed', () => {
      expect(packageJson.devDependencies['@types/jest']).toBeDefined();
    });

    it('should compile TypeScript test files', () => {
      const tempTestContent = `
interface TestInterface {
  value: string;
}

describe('TypeScript Test', () => {
  it('should use TypeScript features', () => {
    const obj: TestInterface = { value: 'test' };
    expect(obj.value).toBe('test');
  });
});
`;
      const tempTestFile = path.join(process.cwd(), 'tests', 'temp-infra-ts.spec.ts');
      fs.writeFileSync(tempTestFile, tempTestContent);

      try {
        const result = execFileSync('npx', ['jest', tempTestFile, '--silent'], {
          stdio: 'pipe',
        });
        expect(result).toBeDefined();
      } finally {
        fs.unlinkSync(tempTestFile);
      }
    });
  });

  describe('Test Coverage', () => {
    it('should generate coverage reports', () => {
      // Verify coverage configuration points to the expected directory
      expect(jestConfig.coverageDirectory).toBe('coverage');
    });

    it('should exclude node_modules from coverage', () => {
      expect(jestConfig.collectCoverageFrom).not.toContain('node_modules/**');
      expect(jestConfig.coveragePathIgnorePatterns).toContain('/node_modules/');
    });

    it('should exclude test files from coverage', () => {
      expect(jestConfig.collectCoverageFrom).toContain('!**/*.test.ts');
      expect(jestConfig.collectCoverageFrom).toContain('!**/*.spec.ts');
    });
  });

  describe('Test Directory Structure', () => {
    it('should have tests directory', () => {
      const testsDir = path.join(process.cwd(), 'tests');
      expect(fs.existsSync(testsDir)).toBe(true);
    });

    it('should find test files in tests directory', () => {
      const testsDir = path.join(process.cwd(), 'tests');
      const testFiles = fs
        .readdirSync(testsDir)
        .filter((file) => file.endsWith('.test.ts') || file.endsWith('.test.js'));
      expect(testFiles.length).toBeGreaterThan(0);
    });
  });

  describe('Test Utilities', () => {
    it('should have access to Jest globals', () => {
      expect(typeof describe).toBe('function');
      expect(typeof it).toBe('function');
      expect(typeof expect).toBe('function');
      expect(typeof beforeEach).toBe('function');
      expect(typeof afterEach).toBe('function');
    });

    it('should have access to Jest matchers', () => {
      expect(expect(true).toBe).toBeDefined();
      expect(expect(true).toEqual).toBeDefined();
      expect(expect(true).toContain).toBeDefined();
      expect(expect(true).toThrow).toBeDefined();
      expect(expect(true).toHaveBeenCalled).toBeDefined();
    });

    it('should support async tests', async () => {
      const asyncFunction = async () => {
        return new Promise((resolve) => {
          setTimeout(() => resolve('done'), 10);
        });
      };

      const result = await asyncFunction();
      expect(result).toBe('done');
    });

    it('should support mocking', () => {
      const mockFunction = jest.fn();
      mockFunction('test');

      expect(mockFunction).toHaveBeenCalled();
      expect(mockFunction).toHaveBeenCalledWith('test');
    });
  });
});
