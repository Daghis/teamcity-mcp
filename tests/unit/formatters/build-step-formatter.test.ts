import { formatBuildStep, formatBuildStepList } from '@/formatters/build-step-formatter';
import type { BuildStep } from '@/teamcity/build-step-manager';

describe('build-step-formatter', () => {
  describe('formatBuildStep', () => {
    it('formats enabled build step', () => {
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

    it('formats disabled build step', () => {
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

    it('formats step without parameters', () => {
      const step: BuildStep = {
        id: 'step3',
        name: 'Simple Step',
        type: 'simpleRunner',
        enabled: true,
        parameters: {},
      };

      const result = formatBuildStep(step);

      expect(result).toContain('✅ Simple Step (step3)');
      expect(result).toContain('Type: simpleRunner');
      expect(result).toContain('Enabled: true');
      expect(result).not.toContain('Parameters:');
    });

    it('formats step with empty parameters', () => {
      const step: BuildStep = {
        id: 'step4',
        name: 'Empty Params',
        type: 'simpleRunner',
        enabled: true,
        parameters: {},
      };

      const result = formatBuildStep(step);

      expect(result).toContain('✅ Empty Params (step4)');
      expect(result).not.toContain('Parameters:');
    });
  });

  describe('formatBuildStepList', () => {
    it('formats list of build steps', () => {
      const steps: BuildStep[] = [
        {
          id: 'step1',
          name: 'Compile',
          type: 'Maven2',
          enabled: true,
          parameters: {
            goals: 'clean compile',
            pomLocation: 'pom.xml',
          },
        },
        {
          id: 'step2',
          name: 'Test',
          type: 'gradle-runner',
          enabled: false,
          parameters: {
            'gradle.tasks': 'test',
            'gradle.build.file': 'build.gradle',
          },
        },
      ];

      const result = formatBuildStepList(steps, 'MyProject_Build');

      expect(result).toContain('Found 2 build steps in configuration MyProject_Build:');
      expect(result).toContain('Step 1: ✅ Compile (step1)');
      expect(result).toContain('Type: Maven2');
      expect(result).toContain('Goals: clean compile');
      expect(result).toContain('POM: pom.xml');
      expect(result).toContain('Step 2: 🚫 Test (step2)');
      expect(result).toContain('Type: gradle-runner');
      expect(result).toContain('Tasks: test');
      expect(result).toContain('Build file: build.gradle');
      expect(result).toContain('─'.repeat(60));
    });

    it('formats empty list', () => {
      const result = formatBuildStepList([], 'EmptyConfig');

      expect(result).toContain('Found 0 build steps in configuration EmptyConfig:');
    });

    it('truncates long script content', () => {
      const steps: BuildStep[] = [
        {
          id: 'long-script',
          name: 'Long Script',
          type: 'simpleRunner',
          enabled: true,
          parameters: {
            'script.content': 'a'.repeat(100),
          },
        },
      ];

      const result = formatBuildStepList(steps, 'Config');

      expect(result).toContain(`Script: ${  'a'.repeat(50)  }...`);
    });

    it('handles Docker runner type', () => {
      const steps: BuildStep[] = [
        {
          id: 'docker-step',
          name: 'Docker Build',
          type: 'Docker',
          enabled: true,
          parameters: {
            'docker.command': 'build',
            'docker.image': 'myapp:v1.0',
          },
        },
      ];

      const result = formatBuildStepList(steps, 'Config');

      expect(result).toContain('Command: build');
      expect(result).toContain('Image: myapp:v1.0');
    });

    it('handles dotnet runner type', () => {
      const steps: BuildStep[] = [
        {
          id: 'dotnet-step',
          name: 'DotNet Build',
          type: 'dotnet',
          enabled: true,
          parameters: {
            'dotnet.command': 'build',
            'dotnet.path': 'MyProject.csproj',
          },
        },
      ];

      const result = formatBuildStepList(steps, 'Config');

      expect(result).toContain('Command: build');
    });

    it('handles npm runner type', () => {
      const steps: BuildStep[] = [
        {
          id: 'npm-step',
          name: 'NPM Install',
          type: 'nodejs-runner',
          enabled: true,
          parameters: {
            'nodejs.script': 'npm install',
          },
        },
      ];

      const result = formatBuildStepList(steps, 'Config');

      expect(result).toContain('Script: npm install');
    });

    it('handles Python runner type', () => {
      const steps: BuildStep[] = [
        {
          id: 'python-step',
          name: 'Python Test',
          type: 'python',
          enabled: true,
          parameters: {
            'python.script': 'pytest -v --cov',
          },
        },
      ];

      const result = formatBuildStepList(steps, 'Config');

      expect(result).toContain('Script: pytest -v --cov');
    });

    it('handles unknown runner type', () => {
      const steps: BuildStep[] = [
        {
          id: 'unknown-step',
          name: 'Unknown Runner',
          type: 'simpleRunner',
          enabled: true,
          parameters: {
            'some.param': 'value',
          },
        },
      ];

      const result = formatBuildStepList(steps, 'Config');

      expect(result).toContain('Type: simpleRunner');
      expect(result).not.toContain('some.param');
    });

    it('handles steps without parameters', () => {
      const steps: BuildStep[] = [
        {
          id: 'no-params',
          name: 'No Params',
          type: 'simpleRunner',
          enabled: true,
          parameters: {},
        },
      ];

      const result = formatBuildStepList(steps, 'Config');

      expect(result).toContain('Step 1: ✅ No Params (no-params)');
      expect(result).toContain('Type: simpleRunner');
    });

    it('handles null parameters', () => {
      const steps: BuildStep[] = [
        {
          id: 'null-params',
          name: 'Null Params',
          type: 'Maven2',
          enabled: true,
          parameters: null as any,
        },
      ];

      const result = formatBuildStepList(steps, 'Config');

      expect(result).toContain('Step 1: ✅ Null Params (null-params)');
      expect(result).toContain('Type: Maven2');
      expect(result).not.toContain('Goals:');
    });
  });
});