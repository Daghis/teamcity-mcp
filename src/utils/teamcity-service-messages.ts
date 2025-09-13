/**
 * TeamCity service message escaping utilities.
 * Escapes special characters according to TeamCity rules to prevent parsing warnings.
 *
 * Rules:
 *  - '|'  => '||'
 *  - '\n' => '|n'
 *  - '\r' => '|r'
 *  - '['  => '|['
 *  - ']'  => '|]'
 *  - "'" => "|'"
 */
export const escapeTeamCityServiceMessage = (text: string): string => {
  if (text == null || text === '') return '';
  return text
    .replace(/\|/g, '||')
    .replace(/\n/g, '|n')
    .replace(/\r/g, '|r')
    .replace(/\[/g, '|[')
    .replace(/\]/g, '|]')
    .replace(/'/g, "|'");
};

/**
 * Wraps a message as a TeamCity service message with proper escaping for values.
 * Example: serviceMessage('message', { text: 'Hello' }) => ##teamcity[message text='Hello']
 */
export const formatServiceMessage = (
  name: string,
  attrs: Record<string, string | number | boolean | undefined>
): string => {
  const parts = Object.entries(attrs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}='${escapeTeamCityServiceMessage(String(v))}'`)
    .join(' ');
  return `##teamcity[${name}${parts ? ` ${parts}` : ''}]`;
};
