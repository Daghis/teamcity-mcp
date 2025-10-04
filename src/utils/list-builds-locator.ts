const SIMPLE_BRANCH_VALUES = new Set([
  'default:true',
  'default:false',
  'default:any',
  'unspecified:true',
  'unspecified:false',
  'unspecified:any',
  'branched:true',
  'branched:false',
  'branched:any',
]);

const BRANCH_PREFIXES_ALLOW_UNWRAPPED = ['default:', 'unspecified:', 'branched:', 'policy:'];

export function splitLocatorParts(locator: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of locator) {
    if (char === ',' && depth === 0) {
      const piece = current.trim();
      if (piece.length > 0) {
        parts.push(piece);
      }
      current = '';
      continue;
    }

    if (char === '(') {
      depth += 1;
    } else if (char === ')' && depth > 0) {
      depth -= 1;
    }

    current += char;
  }

  const finalPiece = current.trim();
  if (finalPiece.length > 0) {
    parts.push(finalPiece);
  }

  return parts;
}

export function wrapBranchValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }

  if (trimmed.startsWith('(')) {
    return trimmed;
  }

  const lower = trimmed.toLowerCase();

  if (SIMPLE_BRANCH_VALUES.has(lower)) {
    return trimmed;
  }

  if (BRANCH_PREFIXES_ALLOW_UNWRAPPED.some((prefix) => lower.startsWith(prefix))) {
    return trimmed;
  }

  if (trimmed.includes('*') && !trimmed.includes(':')) {
    return trimmed;
  }

  if (trimmed.includes('/') || trimmed.includes(':') || /\s/.test(trimmed)) {
    return `(${trimmed})`;
  }

  return trimmed;
}

export function normalizeBranchSegment(segment: string): string {
  const trimmed = segment.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }

  if (!trimmed.toLowerCase().startsWith('branch:')) {
    return trimmed;
  }

  const rawValue = trimmed.slice('branch:'.length).trim();
  if (rawValue.length === 0) {
    return trimmed;
  }

  if (rawValue.startsWith('(')) {
    return `branch:${rawValue}`;
  }

  return `branch:${wrapBranchValue(rawValue)}`;
}

export function normalizeLocatorSegments(locator?: string): string[] {
  if (!locator) {
    return [];
  }

  return splitLocatorParts(locator)
    .map((segment) => normalizeBranchSegment(segment))
    .filter((segment) => segment.length > 0);
}

export function hasBranchSegment(segments: string[]): boolean {
  return segments.some((segment) => segment.toLowerCase().startsWith('branch:'));
}

export function buildBranchSegmentInput(branchInput: string): string {
  const normalized = branchInput.trim();
  const withPrefix = normalized.toLowerCase().startsWith('branch:')
    ? normalized
    : `branch:${normalized}`;
  return normalizeBranchSegment(withPrefix);
}

export const INTERNAL_SIMPLE_BRANCH_VALUES = SIMPLE_BRANCH_VALUES;
export const INTERNAL_BRANCH_PREFIXES = BRANCH_PREFIXES_ALLOW_UNWRAPPED;
