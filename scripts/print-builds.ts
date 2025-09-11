import * as dotenv from 'dotenv';
dotenv.config();

import { TeamCityAPI } from '@/api-client';

async function main() {
  const locator = process.argv.slice(2).join(' ') || 'count:5';
  const api = TeamCityAPI.getInstance();
  // eslint-disable-next-line no-console
  console.log('Locator:', locator);
  const data = await api.listBuilds(locator);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(data, null, 2));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('Error:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});

