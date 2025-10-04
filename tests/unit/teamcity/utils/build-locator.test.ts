import { toBuildLocator } from '@/teamcity/utils/build-locator';

describe('toBuildLocator', () => {
  it('wraps numeric identifiers', () => {
    expect(toBuildLocator('123')).toBe('id:123');
  });

  it('returns existing locators unchanged', () => {
    expect(toBuildLocator('buildType:(id:Config),number:42')).toBe(
      'buildType:(id:Config),number:42'
    );
  });
});
