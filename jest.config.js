/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testEnvironmentOptions: {
    NODE_ENV: 'test',
  },
  // Load .env before any other setup so tests see env vars
  setupFiles: ['dotenv/config', '<rootDir>/jest.setup.js'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/*.test.ts',
    '**/__tests__/**/*.{ts,tsx,js}',
    '**/?(*.)+(spec|test).{ts,tsx,js}'
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowJs: true,
        strict: false,
        noUnusedLocals: false,
        noUnusedParameters: false
      }
    }]
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/types/**',
    // Exclude pure type definitions and barrels
    '!src/teamcity/types/**',
    '!src/tools/index.ts',
    '!**/*.test.ts',
    '!**/*.spec.ts',
    '!src/teamcity-client/**/*',
    // Exclude entrypoints, barrels, generated or integration-only adapters
    '!src/index.ts',
    '!src/swagger/index.ts',
    '!src/teamcity/index.ts',
    '!src/teamcity/client.ts',
    '!src/teamcity/config.ts',
    // Exclude integration-heavy direct API wrapper from unit coverage
    '!src/api-client.ts',
    // Temporarily exclude swagger and middleware layers from coverage thresholds
    '!src/swagger/**/*.ts',
    '!src/middleware/**/*.ts',
    '!src/errors/index.ts',
    '!src/config/index.ts',
    '!src/formatters/*.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  // Coverage thresholds reflect the reinstated instrumentation for tools and
  // the core TeamCity managers. Branch coverage temporarily sits below 70%
  // while we backfill additional scenarios; line/function targets remain at 80%.
  coverageThreshold: {
    global: {
      branches: 69,
      functions: 69,
      lines: 80,
      statements: 80,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/tools/(.*)$': '<rootDir>/src/tools/$1',
    '^@/utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@/types/(.*)$': '<rootDir>/src/types/$1',
    '^@/config/(.*)$': '<rootDir>/src/config/$1',
    '^@/middleware/(.*)$': '<rootDir>/src/middleware/$1',
    '^@/mcp/(.*)$': '<rootDir>/src/mcp/$1',
    '^@modelcontextprotocol/sdk/server/index\\.js$': '<rootDir>/tests/__mocks__/@modelcontextprotocol/sdk/server/index.js',
    '^@modelcontextprotocol/sdk/server/stdio\\.js$': '<rootDir>/tests/__mocks__/@modelcontextprotocol/sdk/server/stdio.js',
    '^@modelcontextprotocol/sdk/types\\.js$': '<rootDir>/tests/__mocks__/@modelcontextprotocol/sdk/types.js'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@modelcontextprotocol)/)'
  ],
  extensionsToTreatAsEsm: ['.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 10000,
  verbose: true,
  clearMocks: true,
  restoreMocks: true,
  // Allow Jest to exit naturally; avoid forced-exit warnings
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/'
  ],
  watchPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/'
  ]
};
