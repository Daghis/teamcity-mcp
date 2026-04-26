/**
 * Guardrail for the unified tool-description skeleton introduced in #469,
 * extended in #470 with a return/error disclosure rule for mutating tools.
 *
 * Every tool in `src/tools.ts` must follow:
 *   <Verb> <resource>[, scoped to <scope>]. [<One short behavioral clause>].
 * Mutating tools (`readOnlyHint: false`) additionally disclose the principal
 * return value and the dominant failure mode in a third sentence.
 *
 * This test mechanically enforces the hard rules: sentence count, first-word
 * shape, punctuation, length bounds, and a small blocklist of known
 * anti-patterns. Exact wording remains a review-time judgment call.
 */
import { resetMCPMode, setMCPMode } from '@/config';
import { type ToolDefinition, getAvailableTools } from '@/tools';

// Imperative verbs used by existing tools, plus generic ones that are obviously
// verbs. This is an allow-list rather than a strict grammar check; it catches
// drift like accidentally starting with a noun (e.g. "Description of...").
const ALLOWED_LEADING_VERBS = new Set([
  'Test',
  'Get',
  'Switch',
  'List',
  'Count',
  'Fetch',
  'Wait',
  'Trigger',
  'Cancel',
  'Create',
  'Delete',
  'Update',
  'Set',
  'Clone',
  'Add',
  'Remove',
  'Attach',
  'Assign',
  'Authorize',
  'Upload',
  'Download',
  'Move',
  'Reorder',
  'Resume',
  'Pause',
  'Enable',
  'Disable',
  'Mute',
  'Unmute',
  'Bulk',
  'Manage',
  'Analyze',
  'Evaluate',
  'Check',
]);

const MIN_LENGTH = 10;
const MAX_LENGTH = 220;

// Phrases that signal the anti-patterns called out in #469.
const FORBIDDEN_SUBSTRINGS: Array<{ fragment: RegExp; reason: string }> = [
  {
    fragment: /use this when\b/i,
    reason: '"use this when..." disambiguators are tracked separately',
  },
  {
    fragment: /\bnot\s+list_/i,
    reason: 'per-tool "not list_X" disambiguators are tracked separately',
  },
  {
    fragment: /\bnot\s+get_/i,
    reason: 'per-tool "not get_X" disambiguators are tracked separately',
  },
  {
    fragment: /this tool\b/i,
    reason: '"this tool" is filler; name the resource directly',
  },
];

const sentenceCount = (description: string): number =>
  description.split(/[.!?]+(?:\s+|$)/).filter((s) => s.trim().length > 0).length;

describe('tool descriptions (issue #469)', () => {
  let tools: ToolDefinition[];

  beforeAll(() => {
    setMCPMode('full');
    tools = getAvailableTools();
  });

  afterAll(() => {
    resetMCPMode();
  });

  it('every tool has a non-empty description within the length bounds', () => {
    const offenders: string[] = [];
    for (const t of tools) {
      const d = t.description ?? '';
      if (d.length < MIN_LENGTH || d.length > MAX_LENGTH) {
        offenders.push(`${t.name} (${d.length} chars): ${d}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every tool description ends with a period', () => {
    const offenders = tools.filter((t) => !t.description.trim().endsWith('.')).map((t) => t.name);
    expect(offenders).toEqual([]);
  });

  it('no read-only tool description exceeds two sentences', () => {
    const offenders: string[] = [];
    for (const t of tools) {
      if (t.annotations?.readOnlyHint !== true) continue;
      const count = sentenceCount(t.description);
      if (count > 2) offenders.push(`${t.name}: ${count} sentences — ${t.description}`);
    }
    expect(offenders).toEqual([]);
  });

  it('no mutating tool description exceeds three sentences', () => {
    const offenders: string[] = [];
    for (const t of tools) {
      if (t.annotations?.readOnlyHint !== false) continue;
      const count = sentenceCount(t.description);
      if (count > 3) offenders.push(`${t.name}: ${count} sentences — ${t.description}`);
    }
    expect(offenders).toEqual([]);
  });

  // The success-return clause must be independent of the error clause.
  // The negative lookahead excludes status-code contexts (e.g. "returns 404 …")
  // from the success-return match so a description that only carries an error
  // clause cannot satisfy both checks with the same evidence.
  const SUCCESS_RETURN = /\breturns\b(?!\s+\d{3}\b)/i;
  const SAFETY_MARKER = /\b(idempotent|irreversible|no-?op)\b/i;
  const STATUS_CODE = /\breturns\s+\d{3}\b/i;

  const isMutatorDescriptionConformant = (d: string): boolean => {
    const hasReturn = SUCCESS_RETURN.test(d) || SAFETY_MARKER.test(d);
    const hasError = STATUS_CODE.test(d) || SAFETY_MARKER.test(d);
    return hasReturn && hasError;
  };

  it('mutator description rule rejects descriptions with no independent success-return clause', () => {
    // Regression guard: an earlier draft of the rule used /\breturns\b/i for the
    // success-return match, which also matched "returns 404 …" inside the error
    // clause — so a description with only an error clause silently passed both
    // checks. Probe the predicate with known-bad and known-good shapes to catch
    // any future weakening of the regex.
    expect(
      isMutatorDescriptionConformant('Delete a project. Returns 404 if the project does not exist.')
    ).toBe(false);
    expect(isMutatorDescriptionConformant('Mute tests within a scope.')).toBe(false);
    expect(
      isMutatorDescriptionConformant(
        'Delete a project. Irreversible; returns 404 if the project does not exist.'
      )
    ).toBe(true);
    expect(
      isMutatorDescriptionConformant(
        'Update build configuration settings. Returns the updated configuration; returns 404 if the configuration is unknown.'
      )
    ).toBe(true);
  });

  it('every mutating tool discloses principal return and primary error (issue #470)', () => {
    const offenders: string[] = [];
    for (const t of tools) {
      if (t.annotations?.readOnlyHint !== false) continue;
      if (!isMutatorDescriptionConformant(t.description)) {
        offenders.push(`${t.name}: missing return and/or error clause — ${t.description}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every tool description starts with a recognized imperative verb', () => {
    const offenders: string[] = [];
    for (const t of tools) {
      const first = (t.description.split(/\s+/)[0] ?? '').replace(/[.,;:!?]+$/, '');
      if (!ALLOWED_LEADING_VERBS.has(first)) {
        offenders.push(`${t.name}: starts with "${first}" — ${t.description}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no tool description contains anti-pattern phrases', () => {
    const offenders: string[] = [];
    for (const t of tools) {
      for (const { fragment, reason } of FORBIDDEN_SUBSTRINGS) {
        if (fragment.test(t.description)) {
          offenders.push(`${t.name}: ${reason} — ${t.description}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
