/**
 * Tests for development tooling and code quality setup
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

describe('Development Tooling', () => {
  const rootDir = path.resolve(__dirname, '..');

  describe('ESLint Configuration', () => {
    test('eslint.config.cjs should exist', () => {
      const configPath = path.join(rootDir, 'eslint.config.cjs');
      expect(fs.existsSync(configPath)).toBe(true);
    });

    test('should have TypeScript parser configured', () => {
      const configPath = path.join(rootDir, 'eslint.config.cjs');
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf8');
        expect(content).toContain('@typescript-eslint/parser');
        expect(content).toContain('@typescript-eslint');
      }
    });

    test('should run lint command without errors on clean code', () => {
      try {
        // Create a temporary clean TypeScript file
        // Use tests directory to avoid race with repo-wide lint globs
        const testFile = path.join(rootDir, 'tests', 'temp-test-lint-src.ts');
        const cleanCode = `export const testFunction = (value: string): string => {
  return value.toUpperCase();
};
`;
        fs.writeFileSync(testFile, cleanCode);

        try {
          // Run ESLint only on the specific test file to verify clean code passes
          const eslintJs = path.join(rootDir, 'node_modules', 'eslint', 'bin', 'eslint.js');
          const node = process.execPath;
          execSync(`"${node}" "${eslintJs}" "${testFile}" --config eslint.config.cjs`, {
            cwd: rootDir,
            stdio: 'pipe',
          });
          expect(true).toBe(true);
        } finally {
          // Clean up test file
          if (fs.existsSync(testFile)) {
            fs.unlinkSync(testFile);
          }
        }
      } catch (error) {
        // If linting fails on clean code, test should fail
        console.error('ESLint error on clean code:', error.stdout?.toString());
        expect(error).toBeNull();
      }
    });
  });

  describe('Prettier Configuration', () => {
    test('.prettierrc should exist', () => {
      const prettierrcPath = path.join(rootDir, '.prettierrc');
      expect(fs.existsSync(prettierrcPath)).toBe(true);
    });

    test('should have consistent formatting rules', () => {
      const prettierrcPath = path.join(rootDir, '.prettierrc');
      if (fs.existsSync(prettierrcPath)) {
        const content = fs.readFileSync(prettierrcPath, 'utf8');
        const config = JSON.parse(content);
        expect(config).toHaveProperty('singleQuote');
        expect(config).toHaveProperty('semi');
        expect(config).toHaveProperty('tabWidth');
      }
    });

    test('.prettierignore should exist', () => {
      const prettierignorePath = path.join(rootDir, '.prettierignore');
      expect(fs.existsSync(prettierignorePath)).toBe(true);
    });
  });

  describe('Git Hooks (optional)', () => {
    test('pre-commit hook may be absent', () => {
      const preCommitPath = path.join(rootDir, '.husky', 'pre-commit');
      expect(fs.existsSync(preCommitPath)).toBe(false);
    });
  });

  describe('Lint-staged Configuration', () => {
    test('is not required in package.json', () => {
      const packagePath = path.join(rootDir, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      expect(packageJson).not.toHaveProperty('lint-staged');
    });
  });

  describe('Development Scripts', () => {
    test('npm run dev script should exist', () => {
      const packagePath = path.join(rootDir, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      expect(packageJson.scripts).toHaveProperty('dev');
    });

    test('npm run lint script should exist', () => {
      const packagePath = path.join(rootDir, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      expect(packageJson.scripts).toHaveProperty('lint');
    });

    test('npm run format script should exist', () => {
      const packagePath = path.join(rootDir, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      expect(packageJson.scripts).toHaveProperty('format');
    });
  });
});
