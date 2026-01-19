import { REGEX_SPECIAL_CHARS, globToRegex } from '@/utils/pattern';

describe('REGEX_SPECIAL_CHARS', () => {
  it('should match all regex metacharacters except glob wildcards', () => {
    const specialChars = '.+^${}()|[]\\';
    for (const char of specialChars) {
      expect(char).toMatch(REGEX_SPECIAL_CHARS);
    }
  });

  it('should not match glob wildcards', () => {
    expect('*').not.toMatch(REGEX_SPECIAL_CHARS);
    expect('?').not.toMatch(REGEX_SPECIAL_CHARS);
  });

  it('should not match regular characters', () => {
    expect('a').not.toMatch(REGEX_SPECIAL_CHARS);
    expect('Z').not.toMatch(REGEX_SPECIAL_CHARS);
    expect('0').not.toMatch(REGEX_SPECIAL_CHARS);
    expect('-').not.toMatch(REGEX_SPECIAL_CHARS);
    expect('_').not.toMatch(REGEX_SPECIAL_CHARS);
  });
});

describe('globToRegex', () => {
  describe('basic matching', () => {
    it('should match exact strings', () => {
      const regex = globToRegex('hello');
      expect(regex.test('hello')).toBe(true);
      expect(regex.test('Hello')).toBe(false);
      expect(regex.test('hello!')).toBe(false);
      expect(regex.test('xhello')).toBe(false);
    });

    it('should be anchored at start and end', () => {
      const regex = globToRegex('test');
      expect(regex.test('test')).toBe(true);
      expect(regex.test('testing')).toBe(false);
      expect(regex.test('atest')).toBe(false);
      expect(regex.test('atestb')).toBe(false);
    });
  });

  describe('wildcard *', () => {
    it('should match any sequence with *', () => {
      const regex = globToRegex('*.txt');
      expect(regex.test('file.txt')).toBe(true);
      expect(regex.test('longfilename.txt')).toBe(true);
      expect(regex.test('.txt')).toBe(true);
      expect(regex.test('file.csv')).toBe(false);
    });

    it('should match prefix with *', () => {
      const regex = globToRegex('test*');
      expect(regex.test('test')).toBe(true);
      expect(regex.test('testing')).toBe(true);
      expect(regex.test('test123')).toBe(true);
      expect(regex.test('atest')).toBe(false);
    });

    it('should match middle with *', () => {
      const regex = globToRegex('start*end');
      expect(regex.test('startend')).toBe(true);
      expect(regex.test('start-middle-end')).toBe(true);
      expect(regex.test('startxend')).toBe(true);
      expect(regex.test('startendx')).toBe(false);
    });

    it('should handle multiple *', () => {
      const regex = globToRegex('*.*');
      expect(regex.test('file.txt')).toBe(true);
      expect(regex.test('a.b')).toBe(true);
      expect(regex.test('noextension')).toBe(false);
    });
  });

  describe('wildcard ?', () => {
    it('should match single character with ?', () => {
      const regex = globToRegex('test?');
      expect(regex.test('test1')).toBe(true);
      expect(regex.test('testA')).toBe(true);
      expect(regex.test('test')).toBe(false);
      expect(regex.test('test12')).toBe(false);
    });

    it('should handle multiple ?', () => {
      const regex = globToRegex('a??b');
      expect(regex.test('axxb')).toBe(true);
      expect(regex.test('a12b')).toBe(true);
      expect(regex.test('axb')).toBe(false);
      expect(regex.test('axxxb')).toBe(false);
    });

    it('should combine ? and *', () => {
      const regex = globToRegex('?est*');
      expect(regex.test('test')).toBe(true);
      expect(regex.test('testing')).toBe(true);
      expect(regex.test('best123')).toBe(true);
      expect(regex.test('est')).toBe(false);
    });
  });

  describe('special character escaping (security)', () => {
    it('should escape dot (.)', () => {
      const regex = globToRegex('file.txt');
      expect(regex.test('file.txt')).toBe(true);
      expect(regex.test('filextxt')).toBe(false);
    });

    it('should escape plus (+)', () => {
      const regex = globToRegex('a+b');
      expect(regex.test('a+b')).toBe(true);
      expect(regex.test('ab')).toBe(false);
      expect(regex.test('aab')).toBe(false);
      expect(regex.test('aaab')).toBe(false);
    });

    it('should escape caret (^)', () => {
      const regex = globToRegex('^start');
      expect(regex.test('^start')).toBe(true);
      expect(regex.test('start')).toBe(false);
    });

    it('should escape dollar ($)', () => {
      const regex = globToRegex('end$');
      expect(regex.test('end$')).toBe(true);
      expect(regex.test('end')).toBe(false);
    });

    it('should escape curly braces ({})', () => {
      const regex = globToRegex('a{2}');
      expect(regex.test('a{2}')).toBe(true);
      expect(regex.test('aa')).toBe(false);
    });

    it('should escape parentheses (())', () => {
      const regex = globToRegex('(group)');
      expect(regex.test('(group)')).toBe(true);
      expect(regex.test('group')).toBe(false);
    });

    it('should escape pipe (|)', () => {
      const regex = globToRegex('a|b');
      expect(regex.test('a|b')).toBe(true);
      expect(regex.test('a')).toBe(false);
      expect(regex.test('b')).toBe(false);
    });

    it('should escape square brackets ([])', () => {
      const regex = globToRegex('[abc]');
      expect(regex.test('[abc]')).toBe(true);
      expect(regex.test('a')).toBe(false);
      expect(regex.test('b')).toBe(false);
    });

    it('should escape backslash (\\) - the CVE fix', () => {
      const regex = globToRegex('path\\file');
      expect(regex.test('path\\file')).toBe(true);
      expect(regex.test('pathfile')).toBe(false);
      expect(regex.test('path/file')).toBe(false);
    });

    it('should handle multiple backslashes', () => {
      const regex = globToRegex('a\\\\b');
      expect(regex.test('a\\\\b')).toBe(true);
      expect(regex.test('a\\b')).toBe(false);
    });

    it('should handle backslash with wildcard', () => {
      const regex = globToRegex('*\\*.txt');
      expect(regex.test('dir\\file.txt')).toBe(true);
      expect(regex.test('path\\name.txt')).toBe(true);
      expect(regex.test('dir/file.txt')).toBe(false);
    });
  });

  describe('case sensitivity', () => {
    it('should be case-sensitive by default', () => {
      const regex = globToRegex('Test');
      expect(regex.test('Test')).toBe(true);
      expect(regex.test('test')).toBe(false);
      expect(regex.test('TEST')).toBe(false);
    });

    it('should support case-insensitive flag', () => {
      const regex = globToRegex('Test', 'i');
      expect(regex.test('Test')).toBe(true);
      expect(regex.test('test')).toBe(true);
      expect(regex.test('TEST')).toBe(true);
    });

    it('should support case-insensitive wildcards', () => {
      const regex = globToRegex('*.TXT', 'i');
      expect(regex.test('file.txt')).toBe(true);
      expect(regex.test('FILE.TXT')).toBe(true);
      expect(regex.test('File.Txt')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty pattern', () => {
      const regex = globToRegex('');
      expect(regex.test('')).toBe(true);
      expect(regex.test('x')).toBe(false);
    });

    it('should handle pattern with only *', () => {
      const regex = globToRegex('*');
      expect(regex.test('')).toBe(true);
      expect(regex.test('anything')).toBe(true);
      expect(regex.test('with spaces too')).toBe(true);
    });

    it('should handle pattern with only ?', () => {
      const regex = globToRegex('?');
      expect(regex.test('x')).toBe(true);
      expect(regex.test('')).toBe(false);
      expect(regex.test('ab')).toBe(false);
    });

    it('should handle complex real-world patterns', () => {
      const regex = globToRegex('build-*.log');
      expect(regex.test('build-123.log')).toBe(true);
      expect(regex.test('build-2024-01-15.log')).toBe(true);
      expect(regex.test('build.log')).toBe(false);
    });
  });

  describe('ReDoS prevention', () => {
    it('should escape quantifiers to prevent catastrophic backtracking', () => {
      // The + quantifier must be escaped to prevent ReDoS
      // If not escaped, 'a+' would match 'aaa' - but we want literal 'a+'
      const patternWithPlus = 'a+b';
      const regex = globToRegex(patternWithPlus);

      // Verify + is escaped (matches literal 'a+b', not regex quantifier)
      expect(regex.test('a+b')).toBe(true);
      expect(regex.test('aaab')).toBe(false);
      expect(regex.test('ab')).toBe(false);
    });

    it('should safely handle patterns with alternation', () => {
      // Pattern that would create alternation if not escaped: a|b
      const pattern = 'a|b';
      const regex = globToRegex(pattern);

      expect(regex.test('a|b')).toBe(true);
      expect(regex.test('a')).toBe(false);
      expect(regex.test('b')).toBe(false);
    });
  });
});
