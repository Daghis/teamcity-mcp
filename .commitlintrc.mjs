export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Allow Dependabot-style commit bodies with long URLs/metadata
    'body-max-line-length': [0, 'always'],
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
