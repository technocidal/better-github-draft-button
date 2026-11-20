// Aligns the Xcode project version with the release tag so Xcode Cloud
// builds/publishes the same version as the web stores.
//   MARKETING_VERSION       <- tag version (e.g. v1.0.2 -> 1.0.2)
//   CURRENT_PROJECT_VERSION <- GitHub run number (monotonic build number)
// Usage: VERSION=1.0.2 BUILD_NUMBER=123 node scripts/bump-ios-version.mjs

import { readFileSync, writeFileSync } from 'node:fs';

const { VERSION, BUILD_NUMBER } = process.env;
if (!VERSION) throw new Error('Missing env var VERSION');

const pbx = 'safari/Better GitHub Draft Button.xcodeproj/project.pbxproj';
let src = readFileSync(pbx, 'utf8');

const before = src;
src = src.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${VERSION};`);
if (BUILD_NUMBER) {
  src = src.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${BUILD_NUMBER};`);
}
if (src === before) {
  console.log('project.pbxproj already aligned — nothing to do.');
  process.exit(0);
}
writeFileSync(pbx, src);
console.log(`Bumped ${pbx}: MARKETING_VERSION=${VERSION}` + (BUILD_NUMBER ? `, CURRENT_PROJECT_VERSION=${BUILD_NUMBER}` : ''));
