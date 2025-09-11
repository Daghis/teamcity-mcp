#!/usr/bin/env node

/**
 * Build script using esbuild for fast TypeScript compilation
 */

const esbuild = require('esbuild');
const { TsconfigPathsPlugin } = require('@esbuild-plugins/tsconfig-paths');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';

async function build() {
  try {
    console.log('🔨 Building TypeScript project with esbuild...');
    
    // Clean dist directory
    const distPath = path.join(__dirname, '..', 'dist');
    if (fs.existsSync(distPath)) {
      fs.rmSync(distPath, { recursive: true, force: true });
    }
    fs.mkdirSync(distPath, { recursive: true });
    
    // Build with esbuild
    await esbuild.build({
      entryPoints: ['src/index.ts'],
      bundle: true,
      outfile: 'dist/index.js',
      platform: 'node',
      target: 'node20',
      format: 'cjs',
      banner: {
        js: '#!/usr/bin/env node'
      },
      sourcemap: !isProduction,
      minify: isProduction,
      treeShaking: true,
      plugins: [
        TsconfigPathsPlugin({
          tsconfig: path.resolve(__dirname, '..', 'tsconfig.json')
        })
      ],
      external: [
        '@modelcontextprotocol/sdk',
        'express',
        'dotenv',
        'winston',
        'morgan',
        'zod'
      ],
      logLevel: 'info',
      define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
      }
    });
    
    // Generate TypeScript declarations using tsc
    console.log('📝 Generating TypeScript declarations...');
    try {
      execSync('npx tsc --emitDeclarationOnly --declaration --project tsconfig.build.json', {
        stdio: 'inherit'
      });
      
      // Apply path aliases to generated .d.ts files
      console.log('🔗 Resolving path aliases...');
      execSync('npx tsc-alias -p tsconfig.build.json', {
        stdio: 'inherit'
      });
    } catch (error) {
      console.warn('⚠️ TypeScript declaration generation had some issues, but JavaScript build succeeded');
    }
    
    // Make the file executable (shebang will be added by esbuild for ESM)
    const builtFile = path.join(__dirname, '..', 'dist', 'index.js');
    fs.chmodSync(builtFile, '755');
    
    console.log('✅ Build completed successfully!');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

// Run build
build();