import * as dotenv from 'dotenv';
dotenv.config();

import { TeamCityAPI } from '@/api-client';

async function main() {
  const buildId = process.argv[2] || '54';
  try {
    const api = TeamCityAPI.getInstance();
    // Try chunked first
    const chunk = await api.getBuildLogChunk(buildId, { startLine: 0, lineCount: 200 });
    // Print as JSON to see structure
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, where: 'chunk', meta: chunk }, null, 2));
    // eslint-disable-next-line no-console
    console.log('--- lines start ---');
    // eslint-disable-next-line no-console
    console.log(chunk.lines.join('\n'));
    // eslint-disable-next-line no-console
    console.log('--- lines end ---');
  } catch (e1) {
    // eslint-disable-next-line no-console
    console.error('Chunk fetch failed:', e1 instanceof Error ? e1.message : String(e1));
    // Try to resolve buildId from a build number if a plain number was provided
    const maybeNumber = buildId;
    if (/^\d+$/.test(maybeNumber)) {
      try {
        const api = TeamCityAPI.getInstance();
        const resp = await api.listBuilds(`number:${maybeNumber},count:5`);
        // eslint-disable-next-line no-console
        console.log('\nLocator search results for build number', maybeNumber);
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(resp, null, 2));
        const items = (resp as any).build || [];
        if (items.length > 0) {
          const first = items[0];
          // eslint-disable-next-line no-console
          console.log('First match id:', first.id, 'buildTypeId:', first.buildTypeId);
        } else {
          // eslint-disable-next-line no-console
          console.log('No builds found with build number', maybeNumber);
        }
      } catch (e3) {
        // eslint-disable-next-line no-console
        console.error('Failed to search by build number:', e3 instanceof Error ? e3.message : String(e3));
      }
    }
    process.exit(1);
  }
}

main();
