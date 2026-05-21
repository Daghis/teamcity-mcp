import { escapeTeamCityServiceMessage, formatServiceMessage } from '@/utils';

describe('utils: TeamCity service messages', () => {
  it('escapes special characters correctly', () => {
    const input = "pipe|quote'brackets[]new\nline\rcarriage";
    const escaped = escapeTeamCityServiceMessage(input);
    expect(escaped).toBe("pipe||quote|'brackets|[|]new|nline|rcarriage");
  });

  it('formats service message with escaped attributes', () => {
    const msg = formatServiceMessage('message', { text: 'hello|world' });
    expect(msg).toBe("##teamcity[message text='hello||world']");
  });

  it('handles empty and nullish inputs safely', () => {
    expect(escapeTeamCityServiceMessage('')).toBe('');
    expect(escapeTeamCityServiceMessage(null as unknown as string)).toBe('');
    expect(escapeTeamCityServiceMessage(undefined as unknown as string)).toBe('');

    const msg = formatServiceMessage('buildStatus', { text: '' });
    expect(msg).toBe("##teamcity[buildStatus text='']");
  });
});
