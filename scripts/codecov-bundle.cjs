#!/usr/bin/env node

/**
 * Codecov bundle analysis for teamcity-mcp.
 *
 * Runs @codecov/bundle-analyzer against dist/ and uploads the report to
 * Codecov. Called from CI after `npm run build`. Exits 0 (no-op) when
 * CODECOV_TOKEN is unset, so local runs and Dependabot jobs don't fail.
 */

const path = require('path');
const fs = require('fs');

const uploadToken = process.env.CODECOV_TOKEN;
if (!uploadToken) {
  console.log('CODECOV_TOKEN not set — skipping Codecov bundle analysis upload.');
  process.exit(0);
}

const { createAndUploadReport } = require('@codecov/bundle-analyzer');

const distDir = path.resolve(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
  console.error(`Build output not found at ${distDir}. Run \`npm run build\` first.`);
  process.exit(1);
}

const coreOpts = {
  dryRun: false,
  uploadToken,
  retryCount: 3,
  apiUrl: 'https://api.codecov.io',
  bundleName: '@daghis/teamcity-mcp',
  enableBundleAnalysis: true,
  debug: process.env.CODECOV_DEBUG === 'true',
};

const bundleAnalyzerOpts = {
  ignorePatterns: ['*.map'],
};

createAndUploadReport([distDir], coreOpts, bundleAnalyzerOpts)
  .then(() => {
    console.log('Codecov bundle analysis uploaded.');
  })
  .catch((err) => {
    console.error('Codecov bundle analysis failed:', err);
    process.exit(1);
  });
