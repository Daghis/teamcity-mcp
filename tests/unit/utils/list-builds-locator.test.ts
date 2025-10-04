import {
  buildBranchSegmentInput,
  hasBranchSegment,
  normalizeBranchSegment,
  normalizeLocatorSegments,
  splitLocatorParts,
  wrapBranchValue,
} from '@/utils/list-builds-locator';

describe('list-builds locator utilities', () => {
  describe('splitLocatorParts', () => {
    it('splits top-level commas', () => {
      expect(splitLocatorParts('branch:default:any,status:SUCCESS')).toEqual([
        'branch:default:any',
        'status:SUCCESS',
      ]);
    });

    it('preserves commas inside parentheses', () => {
      expect(
        splitLocatorParts('branch:(name:refs/heads/main,default:false),status:SUCCESS')
      ).toEqual(['branch:(name:refs/heads/main,default:false)', 'status:SUCCESS']);
    });

    it('drops empty segments', () => {
      expect(splitLocatorParts('branch:default:any,,status:SUCCESS')).toEqual([
        'branch:default:any',
        'status:SUCCESS',
      ]);
    });
  });

  describe('wrapBranchValue', () => {
    it('returns empty string when value is whitespace', () => {
      expect(wrapBranchValue('   ')).toBe('');
    });

    it('keeps preset branch selectors without wrapping', () => {
      expect(wrapBranchValue('default:any')).toBe('default:any');
    });

    it('keeps allowed prefixes without wrapping', () => {
      expect(wrapBranchValue('policy:ALL_BRANCHES')).toBe('policy:ALL_BRANCHES');
    });

    it('keeps wildcard-only values without wrapping', () => {
      expect(wrapBranchValue('feature/*')).toBe('feature/*');
    });

    it('wraps values containing slashes, colons, or whitespace', () => {
      expect(wrapBranchValue('refs/heads/main')).toBe('(refs/heads/main)');
      expect(wrapBranchValue('name:refs/heads/feature')).toBe('(name:refs/heads/feature)');
      expect(wrapBranchValue('feature branch')).toBe('(feature branch)');
    });

    it('returns already wrapped values as-is', () => {
      expect(wrapBranchValue('(refs/heads/main)')).toBe('(refs/heads/main)');
    });
  });

  describe('normalizeBranchSegment', () => {
    it('returns non-branch segments unchanged', () => {
      expect(normalizeBranchSegment('status:SUCCESS')).toBe('status:SUCCESS');
    });

    it('handles branch segments that are already wrapped', () => {
      expect(normalizeBranchSegment('branch:(refs/heads/main)')).toBe('branch:(refs/heads/main)');
    });

    it('wraps branch segments that need escaping', () => {
      expect(normalizeBranchSegment('branch:refs/heads/main')).toBe('branch:(refs/heads/main)');
    });

    it('trims excess whitespace from branch segments', () => {
      expect(normalizeBranchSegment('  branch: feature/*  ')).toBe('branch:feature/*');
    });
  });

  describe('normalizeLocatorSegments', () => {
    it('normalizes each locator segment', () => {
      expect(
        normalizeLocatorSegments('branch:refs/heads/main,status:SUCCESS,project:(id:Demo)')
      ).toEqual(['branch:(refs/heads/main)', 'status:SUCCESS', 'project:(id:Demo)']);
    });

    it('returns an empty array for undefined locators', () => {
      expect(normalizeLocatorSegments()).toEqual([]);
    });
  });

  describe('hasBranchSegment', () => {
    it('detects branch segments irrespective of case', () => {
      expect(hasBranchSegment(['status:SUCCESS', 'Branch:default:any'])).toBe(true);
      expect(hasBranchSegment(['status:SUCCESS'])).toBe(false);
    });
  });

  describe('buildBranchSegmentInput', () => {
    it('builds a normalized branch segment from raw value', () => {
      expect(buildBranchSegmentInput('refs/heads/main')).toBe('branch:(refs/heads/main)');
    });

    it('respects existing prefixes', () => {
      expect(buildBranchSegmentInput('branch:default:any')).toBe('branch:default:any');
    });
  });
});
