module.exports = {
  extends: ['@commitlint/config-conventional'],
  // Allow Dependabot-style commit type `deps` (e.g., `deps(deps): bump ...`).
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'build',
        'chore',
        'ci',
        'docs',
        'feat',
        'fix',
        'perf',
        'refactor',
        'revert',
        'style',
        'test',
        'deps'
      ]
    ]
  }
};
