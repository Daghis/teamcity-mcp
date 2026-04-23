/**
 * Coverage test: every tool must declare all four MCP behavioral annotation hints.
 */
import { resetMCPMode, setMCPMode } from '@/config';
import { type ToolDefinition, getAvailableTools } from '@/tools';

describe('Tool Annotations Coverage', () => {
  let allTools: ToolDefinition[];

  beforeAll(() => {
    setMCPMode('full');
    allTools = getAvailableTools();
  });

  afterAll(() => {
    resetMCPMode();
  });

  it('should have at least 90 tools registered in full mode', () => {
    expect(allTools.length).toBeGreaterThanOrEqual(90);
  });

  it('every tool has an annotations object with all four boolean hints', () => {
    const missing: string[] = [];
    for (const tool of allTools) {
      const a = tool.annotations;
      if (
        typeof a.readOnlyHint !== 'boolean' ||
        typeof a.destructiveHint !== 'boolean' ||
        typeof a.idempotentHint !== 'boolean' ||
        typeof a.openWorldHint !== 'boolean'
      ) {
        missing.push(tool.name);
      }
    }
    expect(missing).toEqual([]);
  });

  it('no tool claims readOnly and destructive simultaneously', () => {
    const invalid = allTools
      .filter((t) => t.annotations.readOnlyHint && t.annotations.destructiveHint)
      .map((t) => t.name);
    expect(invalid).toEqual([]);
  });

  it('local-only tools have openWorldHint=false; all other tools have openWorldHint=true', () => {
    const localOnlyTools = new Set(['get_mcp_mode', 'set_mcp_mode']);
    const wrongLocalOnly = allTools
      .filter((t) => localOnlyTools.has(t.name) && t.annotations.openWorldHint !== false)
      .map((t) => t.name);
    const wrongOpenWorld = allTools
      .filter((t) => !localOnlyTools.has(t.name) && t.annotations.openWorldHint !== true)
      .map((t) => t.name);
    expect(wrongLocalOnly).toEqual([]);
    expect(wrongOpenWorld).toEqual([]);
  });
});
