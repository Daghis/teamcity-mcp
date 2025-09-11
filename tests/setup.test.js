/**
 * Tests for project setup and configuration
 * These tests validate that the project is properly initialized
 */

const fs = require('fs');
const path = require('path');

describe('Project Setup', () => {
  const rootDir = path.resolve(__dirname, '..');

  describe('package.json', () => {
    let packageJson;

    beforeAll(() => {
      const packagePath = path.join(rootDir, 'package.json');
      if (fs.existsSync(packagePath)) {
        packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      }
    });

    test('should exist', () => {
      expect(packageJson).toBeDefined();
    });

    test('should have required fields', () => {
      expect(packageJson).toHaveProperty('name', '@teamcity/mcp-server');
      expect(packageJson).toHaveProperty('version');
      expect(packageJson).toHaveProperty('description');
      expect(packageJson).toHaveProperty('main');
      expect(packageJson).toHaveProperty('scripts');
      expect(packageJson).toHaveProperty('engines');
    });

    test('should specify Node.js version >= 20.0.0', () => {
      expect(packageJson.engines).toHaveProperty('node');
      expect(packageJson.engines.node).toMatch(/>=20/);
    });

    test('should have essential npm scripts', () => {
      const scripts = packageJson.scripts;
      expect(scripts).toHaveProperty('dev');
      expect(scripts).toHaveProperty('build');
      expect(scripts).toHaveProperty('test');
      expect(scripts).toHaveProperty('lint');
      expect(scripts).toHaveProperty('format');
    });

    test('should have TypeScript as a dependency', () => {
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };
      expect(allDeps).toHaveProperty('typescript');
    });
  });

  describe('Node.js Version', () => {
    test('.nvmrc should exist and specify Node 20', () => {
      const nvmrcPath = path.join(rootDir, '.nvmrc');
      expect(fs.existsSync(nvmrcPath)).toBe(true);

      if (fs.existsSync(nvmrcPath)) {
        const content = fs.readFileSync(nvmrcPath, 'utf8').trim();
        expect(content).toMatch(/^20/);
      }
    });
  });

  describe('.gitignore', () => {
    test('should exist with proper Node.js/TypeScript patterns', () => {
      const gitignorePath = path.join(rootDir, '.gitignore');
      expect(fs.existsSync(gitignorePath)).toBe(true);

      if (fs.existsSync(gitignorePath)) {
        const content = fs.readFileSync(gitignorePath, 'utf8');
        expect(content).toContain('node_modules');
        expect(content).toContain('dist');
        expect(content).toContain('.env');
        expect(content).toContain('coverage');
      }
    });
  });

  describe('README.md', () => {
    test('should exist with project information', () => {
      const readmePath = path.join(rootDir, 'README.md');
      expect(fs.existsSync(readmePath)).toBe(true);

      if (fs.existsSync(readmePath)) {
        const content = fs.readFileSync(readmePath, 'utf8');
        expect(content).toContain('TeamCity MCP Server');
        expect(content.length).toBeGreaterThan(100);
      }
    });
  });
});
