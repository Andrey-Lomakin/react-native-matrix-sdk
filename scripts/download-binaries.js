#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const tar = require('tar');

const PACKAGE_JSON = require('../package.json');
const VERSION = PACKAGE_JSON.version;

// Fork configuration. The upstream script hardcoded the vendor repo; we build
// our own binaries, so both the source repo and skipping the download entirely
// have to be controllable from the environment.
const REPO = process.env.RNMS_BINARIES_REPO || 'unomed-dev/react-native-matrix-sdk';
const SKIP = process.env.RNMS_SKIP_BINARY_DOWNLOAD === '1';
const TOKEN = process.env.RNMS_BINARIES_TOKEN || process.env.GITHUB_TOKEN;

function get(url, dest, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const options = { headers: { 'User-Agent': 'rnms-download-binaries' } };
    // A token must not be forwarded to the redirect target: GitHub release
    // assets redirect to S3, which rejects requests carrying an Authorization
    // header.
    if (TOKEN && redirectsLeft === 5) {
      options.headers.Authorization = `Bearer ${TOKEN}`;
      options.headers.Accept = 'application/octet-stream';
    }

    https
      .get(url, options, (response) => {
        const { statusCode, headers } = response;

        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          response.resume();
          if (redirectsLeft === 0) {
            reject(new Error('too many redirects'));
            return;
          }
          get(headers.location, dest, redirectsLeft - 1).then(resolve, reject);
          return;
        }

        if (statusCode !== 200) {
          response.resume();
          reject(new Error(`HTTP ${statusCode} for ${url}`));
          return;
        }

        const file = fs.createWriteStream(dest);
        response.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
      })
      .on('error', reject);
  });
}

async function downloadBinaries() {
  const projectDir = path.join(__dirname, '..');
  const buildDir = path.join(projectDir, 'build');

  if (fs.existsSync(path.join(buildDir, 'RnMatrixRustSdk.xcframework'))) {
    console.log('[rnms] Binaries already exist, skipping download.');
    return;
  }

  if (SKIP) {
    console.log(
      '[rnms] RNMS_SKIP_BINARY_DOWNLOAD=1 — not downloading binaries.\n' +
        '[rnms] Build them locally with `yarn generate:release:android` / `yarn generate:release:ios`.',
    );
    return;
  }

  const releaseUrl = `https://github.com/${REPO}/releases/download/${VERSION}/binaries.tar.gz`;
  const tempFile = path.join(projectDir, 'binaries.tar.gz');

  console.log(`[rnms] Downloading binaries ${VERSION} from ${REPO}...`);

  try {
    await get(releaseUrl, tempFile);
    console.log('[rnms] Extracting binaries...');
    await tar.x({ file: tempFile, cwd: projectDir });
    fs.unlinkSync(tempFile);
    console.log('[rnms] Binaries downloaded successfully.');
  } catch (error) {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    // Upstream exited 0 here, which produced an install that looks fine and
    // then fails at runtime in an unrelated place. Say what is missing and how
    // to get it, and still let the install finish so a source-only checkout
    // (lint, typecheck, bindings generation) keeps working.
    console.error(
      `\n[rnms] Failed to download binaries: ${error.message}\n` +
        `[rnms]   url:  ${releaseUrl}\n` +
        '[rnms] The package is installed WITHOUT native binaries — any app\n' +
        '[rnms] consuming it will fail to link or crash on first Matrix call.\n' +
        '[rnms] Fix by one of:\n' +
        '[rnms]   - build locally:  yarn generate:release:android && yarn generate:release:ios\n' +
        '[rnms]   - point at another repo:  RNMS_BINARIES_REPO=<owner>/<repo>\n' +
        '[rnms]   - private repo:  RNMS_BINARIES_TOKEN=<token>\n' +
        '[rnms]   - silence this on purpose:  RNMS_SKIP_BINARY_DOWNLOAD=1\n',
    );
  }
}

if (require.main === module) {
  downloadBinaries().catch((error) => {
    console.error('[rnms] download-binaries failed:', error);
  });
}

module.exports = { downloadBinaries };
