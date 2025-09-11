#!/usr/bin/env tsx

/**
 * Script to fetch and cache TeamCity Swagger specification
 */

import { config as loadEnv } from 'dotenv';
import { SwaggerManager } from '../src/swagger';
import fs from 'fs/promises';
import path from 'path';

// Load environment variables
loadEnv();

async function main() {
  console.log('🔄 Fetching TeamCity Swagger specification...\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  const forceRefresh = args.includes('--force') || args.includes('-f');
  const outputPath = args.find(arg => arg.startsWith('--output='))?.split('=')[1] ?? 
                     args.find(arg => arg.startsWith('-o='))?.split('=')[1];
  const showHelp = args.includes('--help') || args.includes('-h');

  if (showHelp) {
    console.log(`
Usage: npm run fetch:swagger [options]

Options:
  -f, --force           Force refresh (ignore cache)
  -o, --output=<path>   Save spec to file
  -h, --help           Show this help message

Environment variables:
  TEAMCITY_URL         TeamCity server URL (required)
  TEAMCITY_TOKEN       TeamCity API token (required)

Examples:
  npm run fetch:swagger
  npm run fetch:swagger --force
  npm run fetch:swagger --output=./swagger.json
`);
    process.exit(0);
  }

  // Check required environment variables
  const baseUrl = process.env['TEAMCITY_URL'];
  const token = process.env['TEAMCITY_TOKEN'];

  if (!baseUrl || !token) {
    console.error('❌ Error: TEAMCITY_URL and TEAMCITY_TOKEN environment variables are required');
    console.error('\nExample:');
    console.error('  export TEAMCITY_URL=https://teamcity.example.com');
    console.error('  export TEAMCITY_TOKEN=your-api-token');
    process.exit(1);
  }

  try {
    // Create SwaggerManager instance
    const manager = new SwaggerManager({
      baseUrl,
      token,
      forceRefresh,
    });

    // Get server info
    console.log('📡 Connecting to TeamCity server...');
    const serverInfo = await manager.getServerInfo();
    
    if (!serverInfo.connected) {
      throw new Error('Failed to connect to TeamCity server');
    }

    console.log(`✅ Connected to TeamCity ${serverInfo.version ?? 'Unknown version'}\n`);

    // Fetch the specification
    console.log('📥 Fetching Swagger specification...');
    const spec = await manager.getSpec();

    // Validate the specification
    console.log('🔍 Validating specification...');
    const validation = await manager.validateSpec(spec);

    if (!validation.isValid) {
      console.error('❌ Specification validation failed:');
      validation.errors?.forEach(error => console.error(`  - ${error}`));
      process.exit(1);
    }

    console.log(`✅ Valid ${validation.version} specification`);
    if (validation.teamCityVersion) {
      console.log(`   TeamCity version: ${validation.teamCityVersion}`);
    }
    
    if (validation.warnings && validation.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      validation.warnings.forEach(warning => console.log(`  - ${warning}`));
    }

    // Save to file if requested
    if (outputPath) {
      console.log(`\n💾 Saving specification to ${outputPath}...`);
      const outputDir = path.dirname(outputPath);
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(outputPath, JSON.stringify(spec, null, 2), 'utf-8');
      console.log('✅ Specification saved');
    }

    // Show cache statistics
    const cacheStats = await manager.getCacheStats();
    console.log('\n📊 Cache Statistics:');
    console.log(`   Files: ${cacheStats.files}`);
    console.log(`   Size: ${Math.round(cacheStats.size / 1024)} KB`);
    if (cacheStats.oldestFile) {
      console.log(`   Oldest: ${cacheStats.oldestFile.toISOString()}`);
    }

    // Show summary
    const paths = Object.keys(spec.paths ?? {});
    console.log('\n📋 Specification Summary:');
    console.log(`   Total paths: ${paths.length}`);
    console.log(`   Builds endpoints: ${paths.filter(p => p.includes('/builds')).length}`);
    console.log(`   Projects endpoints: ${paths.filter(p => p.includes('/projects')).length}`);
    console.log(`   VCS endpoints: ${paths.filter(p => p.includes('/vcs')).length}`);
    console.log(`   Agent endpoints: ${paths.filter(p => p.includes('/agent')).length}`);

    console.log('\n✨ Success! Swagger specification is ready for client generation.');
    console.log('   Run "npm run generate:client" to generate the TypeScript client.');

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});