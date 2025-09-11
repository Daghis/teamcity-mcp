/** @type {import('jest').Config} */
const base = require('./jest.config.js');

module.exports = {
  ...base,
  // Ignore integration and e2e tests in CI unit run
  testPathIgnorePatterns: [
    ...(base.testPathIgnorePatterns || []),
    '/tests/e2e/',
    '/tests/integration/',
  ],
};

