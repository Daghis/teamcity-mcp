import type { Logger } from 'winston';

import { BranchSpecificationParser } from '@/teamcity/branch-specification-parser';
import { ConfigurationBranchMatcher } from '@/teamcity/configuration-branch-matcher';
import type { TeamCityUnifiedClient } from '@/teamcity/types/client';

import { createMockLogger } from '../../test-utils/mock-logger';
import {
  MockTeamCityClient,
  createMockAxiosResponse,
  createMockBuildTypeResponse,
  createMockTeamCityClient,
} from '../../test-utils/mock-teamcity-client';

describe('ConfigurationBranchMatcher', () => {
  let matcher: ConfigurationBranchMatcher;
  let mockClient: MockTeamCityClient & TeamCityUnifiedClient;
  let mockLogger: Logger;
  let mockParser: jest.Mocked<BranchSpecificationParser>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockClient = createMockTeamCityClient();
    mockParser = {
      parseMultipleSpecifications: jest.fn(),
      parseSpecification: jest.fn(),
      convertWildcardToRegex: jest.fn(),
      extractDefaultBranch: jest.fn(),
      matchBranch: jest.fn(),
    } as jest.Mocked<BranchSpecificationParser>;

    // Reset all mocks
    mockClient.clearAllMocks();
    jest.clearAllMocks();

    // No more double assertion needed! The mock now properly implements the interface
    matcher = new ConfigurationBranchMatcher(mockClient, mockLogger, mockParser);
  });

  describe('getConfigurationsForBranch', () => {
    it('should find configurations that can build a specific branch', async () => {
      const projectId = 'MyProject';
      const branchName = 'feature/new-login';

      // Mock build types response using the new type-safe factory
      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(
        createMockAxiosResponse({
          count: 2,
          buildType: [
            createMockBuildTypeResponse({
              id: 'MyProject_Build',
              name: 'Build',
              projectId: 'MyProject',
              parameters: {
                property: [
                  {
                    name: 'teamcity.vcsTrigger.branchFilter',
                    value: '+:refs/heads/*\n-:refs/heads/legacy/*',
                  },
                ],
              },
            }),
            createMockBuildTypeResponse({
              id: 'MyProject_Test',
              name: 'Test',
              projectId: 'MyProject',
              parameters: {
                property: [
                  {
                    name: 'teamcity.vcsTrigger.branchFilter',
                    value: '+:refs/heads/main\n+:refs/heads/develop',
                  },
                ],
              },
            }),
          ],
        })
      );

      // Mock VCS root retrieval using type-safe response - different responses for different IDs
      mockClient.buildTypes.getBuildType
        .mockResolvedValueOnce(
          createMockAxiosResponse(
            createMockBuildTypeResponse({
              id: 'MyProject_Build',
              name: 'Build',
              projectId: 'MyProject',
              parameters: {
                property: [
                  {
                    name: 'teamcity.vcsTrigger.branchFilter',
                    value: '+:refs/heads/*\n-:refs/heads/legacy/*',
                  },
                ],
              },
              'vcs-root-entries': {
                'vcs-root-entry': [
                  {
                    id: 'MyProject_GitRepo',
                    'vcs-root': {
                      id: 'MyProject_GitRepo',
                      name: 'Git Repository',
                      properties: {
                        property: [
                          { name: 'branch', value: 'refs/heads/main' },
                          { name: 'url', value: 'https://github.com/user/repo.git' },
                        ],
                      },
                    },
                  },
                ],
              },
            })
          )
        )
        .mockResolvedValueOnce(
          createMockAxiosResponse(
            createMockBuildTypeResponse({
              id: 'MyProject_Test',
              name: 'Test',
              projectId: 'MyProject',
              parameters: {
                property: [
                  {
                    name: 'teamcity.vcsTrigger.branchFilter',
                    value: '+:refs/heads/main\n+:refs/heads/develop',
                  },
                ],
              },
              'vcs-root-entries': {
                'vcs-root-entry': [
                  {
                    id: 'MyProject_GitRepo',
                    'vcs-root': {
                      id: 'MyProject_GitRepo',
                      name: 'Git Repository',
                      properties: {
                        property: [
                          { name: 'branch', value: 'refs/heads/main' },
                          { name: 'url', value: 'https://github.com/user/repo.git' },
                        ],
                      },
                    },
                  },
                ],
              },
            })
          )
        );

      // Mock branch specification parsing for different specs
      mockParser.parseMultipleSpecifications.mockImplementation((spec: string | string[]) => {
        const specStr = typeof spec === 'string' ? spec : spec.join('\n');

        if (specStr.includes('refs/heads/*') && specStr.includes('legacy')) {
          // First build type: MyProject_Build
          return [
            {
              pattern: 'refs/heads/*',
              type: 'include',
              isDefault: false,
              regex: /^refs\/heads\/.*$/,
            },
            {
              pattern: 'refs/heads/legacy/*',
              type: 'exclude',
              isDefault: false,
              regex: /^refs\/heads\/legacy\/.*$/,
            },
          ];
        } else if (specStr.includes('refs/heads/main') && specStr.includes('develop')) {
          // Second build type: MyProject_Test
          return [
            {
              pattern: 'refs/heads/main',
              type: 'include',
              isDefault: false,
              regex: /^refs\/heads\/main$/,
            },
            {
              pattern: 'refs/heads/develop',
              type: 'include',
              isDefault: false,
              regex: /^refs\/heads\/develop$/,
            },
          ];
        }

        return [];
      });

      // Mock branch matching
      mockParser.matchBranch
        .mockReturnValueOnce(true) // MyProject_Build matches
        .mockReturnValueOnce(false); // MyProject_Test doesn't match

      const result = await matcher.getConfigurationsForBranch(projectId, branchName);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'MyProject_Build',
        name: 'Build',
        projectId: 'MyProject',
        matchedSpec: 'refs/heads/*',
        confidence: 0.9,
        vcsRoots: [
          {
            id: 'MyProject_GitRepo',
            name: 'Git Repository',
            defaultBranch: 'refs/heads/main',
            url: 'https://github.com/user/repo.git',
          },
        ],
      });
    });

    it('should handle configurations without branch specifications', async () => {
      const projectId = 'MyProject';
      const branchName = 'main';

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(
        createMockAxiosResponse({
          count: 1,
          buildType: [
            createMockBuildTypeResponse({
              id: 'MyProject_Build',
              name: 'Build',
              projectId: 'MyProject',
              // No branch filter parameter
            }),
          ],
        })
      );

      mockClient.buildTypes.getBuildType.mockResolvedValue(
        createMockAxiosResponse(
          createMockBuildTypeResponse({
            id: 'MyProject_Build',
            name: 'Build',
            'vcs-root-entries': {
              'vcs-root-entry': [
                {
                  id: 'MyProject_GitRepo',
                  'vcs-root': {
                    id: 'MyProject_GitRepo',
                    name: 'Git Repository',
                    properties: {
                      property: [{ name: 'branch', value: 'refs/heads/main' }],
                    },
                  },
                },
              ],
            },
          })
        )
      );

      const result = await matcher.getConfigurationsForBranch(projectId, branchName);

      // Should match default branch
      expect(result).toHaveLength(1);
      expect(result[0]?.matchedSpec).toBe('<default>');
      expect(result[0]?.confidence).toBe(1.0);
    });

    it('should calculate appropriate confidence scores', async () => {
      const projectId = 'MyProject';
      const branchName = 'feature/login';

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(
        createMockAxiosResponse({
          count: 3,
          buildType: [
            createMockBuildTypeResponse({
              id: 'Config_Exact',
              name: 'Exact Match',
              projectId: 'MyProject',
              parameters: {
                property: [
                  {
                    name: 'teamcity.vcsTrigger.branchFilter',
                    value: '+:refs/heads/feature/login',
                  },
                ],
              },
            }),
            createMockBuildTypeResponse({
              id: 'Config_Wildcard',
              name: 'Wildcard Match',
              projectId: 'MyProject',
              parameters: {
                property: [
                  {
                    name: 'teamcity.vcsTrigger.branchFilter',
                    value: '+:refs/heads/feature/*',
                  },
                ],
              },
            }),
            createMockBuildTypeResponse({
              id: 'Config_DoubleWildcard',
              name: 'Double Wildcard',
              projectId: 'MyProject',
              parameters: {
                property: [
                  {
                    name: 'teamcity.vcsTrigger.branchFilter',
                    value: '+:refs/heads/**',
                  },
                ],
              },
            }),
          ],
        })
      );

      // Mock VCS roots for all configs - return different responses for different IDs
      mockClient.buildTypes.getBuildType
        .mockResolvedValueOnce(
          createMockAxiosResponse(
            createMockBuildTypeResponse({
              id: 'Config_Exact',
              name: 'Exact Match',
              projectId: 'MyProject',
              parameters: {
                property: [
                  {
                    name: 'teamcity.vcsTrigger.branchFilter',
                    value: '+:refs/heads/feature/login',
                  },
                ],
              },
              'vcs-root-entries': {
                'vcs-root-entry': [],
              },
            })
          )
        )
        .mockResolvedValueOnce(
          createMockAxiosResponse(
            createMockBuildTypeResponse({
              id: 'Config_Wildcard',
              name: 'Wildcard Match',
              projectId: 'MyProject',
              parameters: {
                property: [
                  {
                    name: 'teamcity.vcsTrigger.branchFilter',
                    value: '+:refs/heads/feature/*',
                  },
                ],
              },
              'vcs-root-entries': {
                'vcs-root-entry': [],
              },
            })
          )
        )
        .mockResolvedValueOnce(
          createMockAxiosResponse(
            createMockBuildTypeResponse({
              id: 'Config_DoubleWildcard',
              name: 'Double Wildcard',
              projectId: 'MyProject',
              parameters: {
                property: [
                  {
                    name: 'teamcity.vcsTrigger.branchFilter',
                    value: '+:refs/heads/**',
                  },
                ],
              },
              'vcs-root-entries': {
                'vcs-root-entry': [],
              },
            })
          )
        );

      // Mock parsing for different patterns
      mockParser.parseMultipleSpecifications.mockImplementation((spec: string | string[]) => {
        const specStr = typeof spec === 'string' ? spec : spec.join('\n');
        if (specStr === '+:refs/heads/feature/login') {
          return [{ pattern: 'refs/heads/feature/login', type: 'include', isDefault: false }];
        } else if (specStr === '+:refs/heads/feature/*') {
          return [{ pattern: 'refs/heads/feature/*', type: 'include', isDefault: false }];
        } else if (specStr === '+:refs/heads/**') {
          return [{ pattern: 'refs/heads/**', type: 'include', isDefault: false }];
        }
        return [];
      });

      mockParser.matchBranch.mockReturnValue(true);

      const result = await matcher.getConfigurationsForBranch(projectId, branchName);

      expect(result).toHaveLength(3);

      // Check confidence scores
      const exactMatch = result.find((r) => r.id === 'Config_Exact');
      const wildcardMatch = result.find((r) => r.id === 'Config_Wildcard');
      const doubleWildcardMatch = result.find((r) => r.id === 'Config_DoubleWildcard');

      expect(exactMatch?.confidence).toBe(1.0); // Exact match
      expect(wildcardMatch?.confidence).toBe(0.9); // Single wildcard
      expect(doubleWildcardMatch?.confidence).toBe(0.7); // Double wildcard
    });

    it('should handle API errors gracefully', async () => {
      const projectId = 'MyProject';
      const branchName = 'feature/test';

      mockClient.buildTypes.getAllBuildTypes.mockRejectedValue(new Error('API Error'));

      const result = await matcher.getConfigurationsForBranch(projectId, branchName);

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get configurations for branch',
        expect.objectContaining({
          projectId,
          branchName,
          error: expect.any(Error),
        })
      );
    });
  });

  describe('getBranchesForConfiguration', () => {
    it('should retrieve all branches that can be built by a configuration', async () => {
      const configId = 'MyProject_Build';

      mockClient.buildTypes.getBuildType.mockResolvedValue(
        createMockAxiosResponse(
          createMockBuildTypeResponse({
            id: 'MyProject_Build',
            name: 'Build',
            parameters: {
              property: [
                {
                  name: 'teamcity.vcsTrigger.branchFilter',
                  value: '+:refs/heads/*\n-:refs/heads/legacy/*',
                },
              ],
            },
            'vcs-root-entries': {
              'vcs-root-entry': [
                {
                  id: 'MyProject_GitRepo',
                  'vcs-root': {
                    id: 'MyProject_GitRepo',
                    name: 'Git Repository',
                    properties: {
                      property: [{ name: 'branch', value: 'refs/heads/main' }],
                    },
                  },
                },
              ],
            },
          })
        )
      );

      // Mock the parser for this specific call
      mockParser.parseMultipleSpecifications.mockReturnValue([
        {
          pattern: 'refs/heads/*',
          type: 'include',
          isDefault: false,
        },
        {
          pattern: 'refs/heads/legacy/*',
          type: 'exclude',
          isDefault: false,
        },
      ]);

      const result = await matcher.getBranchesForConfiguration(configId);

      expect(result).toEqual({
        configId: 'MyProject_Build',
        configName: 'Build',
        defaultBranch: 'refs/heads/main',
        branchSpecs: [
          {
            pattern: 'refs/heads/*',
            type: 'include',
            isDefault: false,
          },
          {
            pattern: 'refs/heads/legacy/*',
            type: 'exclude',
            isDefault: false,
          },
        ],
        vcsRoots: [
          {
            id: 'MyProject_GitRepo',
            name: 'Git Repository',
            defaultBranch: 'refs/heads/main',
          },
        ],
      });
    });

    it('should handle configurations with no branch specifications', async () => {
      const configId = 'MyProject_Build';

      mockClient.buildTypes.getBuildType.mockResolvedValue(
        createMockAxiosResponse(
          createMockBuildTypeResponse({
            id: 'MyProject_Build',
            name: 'Build',
            // No parameters
            'vcs-root-entries': {
              'vcs-root-entry': [
                {
                  id: 'MyProject_GitRepo',
                  'vcs-root': {
                    id: 'MyProject_GitRepo',
                    name: 'Git Repository',
                    properties: {
                      property: [{ name: 'branch', value: 'refs/heads/main' }],
                    },
                  },
                },
              ],
            },
          })
        )
      );

      const result = await matcher.getBranchesForConfiguration(configId);

      expect(result.branchSpecs).toEqual([
        {
          pattern: '<default>',
          type: 'include',
          isDefault: true,
        },
      ]);
      expect(result.defaultBranch).toBe('refs/heads/main');
    });
  });

  describe('extractBranchSpecification', () => {
    it('should extract branch specification from build type parameters', () => {
      const buildType = {
        parameters: {
          property: [
            { name: 'some.other.param', value: 'value' },
            { name: 'teamcity.vcsTrigger.branchFilter', value: '+:refs/heads/*' },
          ],
        },
      };

      const spec = (
        matcher as unknown as {
          extractBranchSpecification: (bt: unknown) => string;
        }
      ).extractBranchSpecification(buildType as unknown);
      expect(spec).toBe('+:refs/heads/*');
    });

    it('should return empty string if no branch filter found', () => {
      const buildType = {
        parameters: {
          property: [{ name: 'some.other.param', value: 'value' }],
        },
      };

      const spec = (
        matcher as unknown as {
          extractBranchSpecification: (bt: unknown) => string;
        }
      ).extractBranchSpecification(buildType as unknown);
      expect(spec).toBe('');
    });

    it('should handle build types without parameters', () => {
      const buildType = {};

      const spec = (
        matcher as unknown as {
          extractBranchSpecification: (bt: unknown) => string;
        }
      ).extractBranchSpecification(buildType as unknown);
      expect(spec).toBe('');
    });
  });

  describe('extractVcsRoots', () => {
    it('should extract VCS root information from build type', () => {
      const buildType = {
        'vcs-root-entries': {
          'vcs-root-entry': [
            {
              id: 'Root1',
              'vcs-root': {
                id: 'Root1',
                name: 'Main Repository',
                properties: {
                  property: [
                    { name: 'branch', value: 'refs/heads/main' },
                    { name: 'url', value: 'https://github.com/user/repo.git' },
                  ],
                },
              },
            },
            {
              id: 'Root2',
              'vcs-root': {
                id: 'Root2',
                name: 'Secondary Repository',
                properties: {
                  property: [{ name: 'branch', value: 'refs/heads/develop' }],
                },
              },
            },
          ],
        },
      };

      const roots = (
        matcher as unknown as {
          extractVcsRoots: (bt: unknown) => Array<{
            id: string;
            name: string;
            defaultBranch?: string;
            url?: string;
          }>;
        }
      ).extractVcsRoots(buildType as unknown);

      expect(roots).toHaveLength(2);
      expect(roots[0]).toEqual({
        id: 'Root1',
        name: 'Main Repository',
        defaultBranch: 'refs/heads/main',
        url: 'https://github.com/user/repo.git',
      });
      expect(roots[1]).toEqual({
        id: 'Root2',
        name: 'Secondary Repository',
        defaultBranch: 'refs/heads/develop',
      });
    });

    it('should handle build types without VCS roots', () => {
      const buildType = {};

      const roots = (
        matcher as unknown as {
          extractVcsRoots: (bt: unknown) => Array<{
            id: string;
            name: string;
            defaultBranch?: string;
            url?: string;
          }>;
        }
      ).extractVcsRoots(buildType as unknown);
      expect(roots).toEqual([]);
    });
  });

  describe('calculateConfidence', () => {
    it('should return 1.0 for exact matches', () => {
      const confidence = matcher['calculateConfidence']('refs/heads/main');
      expect(confidence).toBe(1.0);
    });

    it('should return 0.9 for single wildcard matches', () => {
      const confidence = matcher['calculateConfidence']('refs/heads/feature/*');
      expect(confidence).toBe(0.9);
    });

    it('should return 0.7 for double wildcard matches', () => {
      const confidence = matcher['calculateConfidence']('refs/heads/**');
      expect(confidence).toBe(0.7);
    });

    it('should return 0.8 for regex group matches', () => {
      const confidence = matcher['calculateConfidence']('refs/heads/(feature|bugfix)/*');
      expect(confidence).toBe(0.8);
    });

    it('should return 0.6 for complex patterns', () => {
      const confidence = matcher['calculateConfidence']('refs/heads/**/feature/*');
      expect(confidence).toBe(0.6);
    });
  });
});
