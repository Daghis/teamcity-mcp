/**
 * Tests for build step formatter
 */
import { describe, it, expect } from '@jest/globals';

import { formatBuildStep, formatBuildStepList } from '@/formatters/build-step-formatter';
import type { BuildStep } from '@/teamcity/build-step-manager';

describe('Build Step Formatter', () => {
  describe('formatBuildStep', () => {
    it('should format enabled build step', () => {
      const step: BuildStep = {
        id: 'step1',
        name: 'Run Tests',
        type: 'simpleRunner',
        enabled: true,
        parameters: {
          'script.content': 'npm test',
          'teamcity.step.mode': 'default',
        },
      };

      const result = formatBuildStep(step);

      expect(result).toContain('✅ Run Tests (step1)');
      expect(result).toContain('Type: simpleRunner');
      expect(result).toContain('Enabled: true');
      expect(result).toContain('Parameters:');
      expect(result).toContain('script.content: npm test');
      expect(result).toContain('teamcity.step.mode: default');
    });

    it('should format disabled build step', () => {
      const step: BuildStep = {
        id: 'step2',
        name: 'Deploy',
        type: 'Docker',
        enabled: false,
        parameters: {
          'docker.command': 'push',
          'docker.image': 'myapp:latest',
        },
      };

      const result = formatBuildStep(step);

      expect(result).toContain('🚫 Deploy (step2)');
      expect(result).toContain('Type: Docker');
      expect(result).toContain('Enabled: false');
      expect(result).toContain('docker.command: push');
      expect(result).toContain('docker.image: myapp:latest');
    });

    it('should handle step without parameters', () => {
      const step: BuildStep = {
        id: 'step3',
        name: 'Simple Step',
        type: 'custom',
        enabled: true,
      };

      const result = formatBuildStep(step);

      expect(result).toContain('✅ Simple Step (step3)');
      expect(result).toContain('Type: custom');
      expect(result).toContain('Enabled: true');
      expect(result).not.toContain('Parameters:');
    });

    it('should handle step with empty parameters', () => {
      const step: BuildStep = {
        id: 'step4',
        name: 'Empty Params',
        type: 'custom',
        enabled: true,
        parameters: {},
      };

      const result = formatBuildStep(step);

      expect(result).toContain('✅ Empty Params (step4)');
      expect(result).not.toContain('Parameters:');
    });
  });

  describe('formatBuildStepList', () => {
    const buildSteps: BuildStep[] = [
      {
        id: 'step1',
        name: 'Checkout',
        type: 'vcs',
        enabled: true,
      },
      {
        id: 'step2',
        name: 'Build',
        type: 'Maven2',
        enabled: true,
        parameters: {
          goals: 'clean install',
          pomLocation: 'pom.xml',
        },
      },
      {
        id: 'step3',
        name: 'Test',
        type: 'gradle-runner',
        enabled: false,
        parameters: {
          'gradle.tasks': 'test',
          'gradle.build.file': 'build.gradle',
        },
      },
    ];

    it('should format list with header and separator', () => {
      const result = formatBuildStepList(buildSteps, 'MyBuildConfig');

      expect(result).toContain('Found 3 build steps in configuration MyBuildConfig:');
      expect(result).toContain('────────────────────────────────────────────────────────────');
    });

    it('should number and format each step', () => {
      const result = formatBuildStepList(buildSteps, 'MyBuildConfig');

      expect(result).toContain('Step 1: ✅ Checkout (step1)');
      expect(result).toContain('Type: vcs');

      expect(result).toContain('Step 2: ✅ Build (step2)');
      expect(result).toContain('Type: Maven2');
      expect(result).toContain('Goals: clean install');
      expect(result).toContain('POM: pom.xml');

      expect(result).toContain('Step 3: 🚫 Test (step3)');
      expect(result).toContain('Type: gradle-runner');
      expect(result).toContain('Tasks: test');
      expect(result).toContain('Build file: build.gradle');
    });

    it('should handle empty step list', () => {
      const result = formatBuildStepList([], 'EmptyConfig');

      expect(result).toContain('Found 0 build steps in configuration EmptyConfig:');
    });

    it('should truncate long script content for simpleRunner', () => {
      const longScript = 'a'.repeat(100);
      const steps: BuildStep[] = [
        {
          id: 'longscript',
          name: 'Long Script',
          type: 'simpleRunner',
          enabled: true,
          parameters: {
            'script.content': longScript,
          },
        },
      ];

      const result = formatBuildStepList(steps, 'TestConfig');

      expect(result).toContain('Script: ' + 'a'.repeat(50) + '...');
      expect(result).not.toContain('a'.repeat(100));
    });

    it('should show Docker command and image', () => {
      const steps: BuildStep[] = [
        {
          id: 'docker1',
          name: 'Docker Build',
          type: 'Docker',
          enabled: true,
          parameters: {
            'docker.command': 'build',
            'docker.image': 'myapp:v1.0',
          },
        },
      ];

      const result = formatBuildStepList(steps, 'DockerConfig');

      expect(result).toContain('Command: build');
      expect(result).toContain('Image: myapp:v1.0');
    });

    it('should show dotnet command', () => {
      const steps: BuildStep[] = [
        {
          id: 'dotnet1',
          name: 'DotNet Build',
          type: 'dotnet',
          enabled: true,
          parameters: {
            'dotnet.command': 'build',
            'dotnet.path': 'MyApp.csproj',
          },
        },
      ];

      const result = formatBuildStepList(steps, 'DotNetConfig');

      expect(result).toContain('Command: build');
      expect(result).toContain('Path: MyApp.csproj');
    });

    it('should show npm/nodejs commands', () => {
      const steps: BuildStep[] = [
        {
          id: 'npm1',
          name: 'NPM Install',
          type: 'nodejs.npm',
          enabled: true,
          parameters: {
            'npm.command': 'install',
            'npm.path': 'package.json',
          },
        },
      ];

      const result = formatBuildStepList(steps, 'NodeConfig');

      expect(result).toContain('Command: install');
      expect(result).toContain('Path: package.json');
    });

    it('should show Python script', () => {
      const steps: BuildStep[] = [
        {
          id: 'python1',
          name: 'Python Test',
          type: 'python',
          enabled: true,
          parameters: {
            'python.script': 'pytest tests/',
            'python.version': '3.9',
          },
        },
      ];

      const result = formatBuildStepList(steps, 'PythonConfig');

      expect(result).toContain('Script: pytest tests/');
      expect(result).toContain('Version: 3.9');
    });

    it('should handle unknown step types gracefully', () => {
      const steps: BuildStep[] = [
        {
          id: 'unknown1',
          name: 'Unknown Step',
          type: 'customUnknownType',
          enabled: true,
          parameters: {
            'some.param': 'value',
          },
        },
      ];

      const result = formatBuildStepList(steps, 'UnknownConfig');

      expect(result).toContain('Step 1: ✅ Unknown Step (unknown1)');
      expect(result).toContain('Type: customUnknownType');
      // Should not show parameters for unknown types
      expect(result).not.toContain('some.param');
    });
  });
});