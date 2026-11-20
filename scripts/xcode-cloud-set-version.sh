#!/bin/sh
# Xcode Cloud pre-action script: set the app version from the tag being built.
#
# Wire it up in App Store Connect -> Xcode Cloud -> your workflow -> Pre-action
# script:  sh scripts/xcode-cloud-set-version.sh
# The built ref is the tag (workflow runs on tag changes), so git describe
# returns it; pass it explicitly as $1 to override.
set -e

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT/safari"

TAG="${1:-$(git describe --tags --abbrev=0)}"
VERSION="${TAG#v}"
echo "Setting MARKETING_VERSION=$VERSION (from tag $TAG)"
agvtool new-version -all "$VERSION"

# Monotonic build number for CURRENT_PROJECT_VERSION.
if [ -n "$CI_BUILD_NUMBER" ]; then
  agvtool new-build-version -all "$CI_BUILD_NUMBER" 2>/dev/null || true
else
  agvtool next-version -all
fi
