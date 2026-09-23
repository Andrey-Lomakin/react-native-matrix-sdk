#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const tar = require('tar');

async function packageBinaries() {
  const projectDir = path.join(__dirname, '..');
  const xcframework = path.join(projectDir, 'build', 'RnMatrixRustSdk.xcframework');
  const androidLibsDir = path.join(projectDir, 'android', 'src', 'main', 'jniLibs');
  const outputFile = path.join(projectDir, 'binaries.tar.gz');

  // Android and iOS are built by separate commands and, while iterating, only
  // one of them is usually current. Package whatever exists and say which side
  // is missing, instead of refusing to package at all.
  const entries = [];
  if (fs.existsSync(xcframework)) {
    entries.push('build');
  } else {
    console.warn('[rnms] No iOS xcframework in build/ — packaging Android only.');
    console.warn('[rnms] Run `yarn generate:release:ios` to include iOS.');
  }
  if (fs.existsSync(androidLibsDir)) {
    entries.push('android/src/main/jniLibs');
  } else {
    console.warn('[rnms] No Android jniLibs — packaging iOS only.');
    console.warn('[rnms] Run `yarn generate:release:android` to include Android.');
  }

  if (entries.length === 0) {
    console.error('[rnms] Nothing to package: neither iOS nor Android binaries were found.');
    process.exit(1);
  }

  console.log(`[rnms] Packaging binaries: ${entries.join(', ')}`);

  await tar.c({ gzip: true, file: outputFile, cwd: projectDir }, entries);

  const sizeMB = (fs.statSync(outputFile).size / 1024 / 1024).toFixed(2);
  console.log(`[rnms] Binaries packaged: ${outputFile} (${sizeMB} MB)`);
}

if (require.main === module) {
  packageBinaries().catch((error) => {
    console.error('[rnms] package-binaries failed:', error);
    process.exit(1);
  });
}

module.exports = { packageBinaries };
