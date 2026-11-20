#!/bin/sh
# Xcode Cloud Post-Clone custom build script.
# Must live in ci_scripts/ next to the .xcodeproj. Runs with ci_scripts/ as cwd;
# the cloned repo is at $CI_PRIMARY_REPOSITORY_PATH.
# Sets MARKETING_VERSION from the tag being built (CI_TAG for tag-triggered
# builds). Xcode Cloud manages CURRENT_PROJECT_VERSION (build number) itself.
set -e

REPO="${CI_PRIMARY_REPOSITORY_PATH:-$(git rev-parse --show-toplevel 2>/dev/null)}"
cd "$REPO"

TAG="${1:-${CI_TAG:-}}"
if [ -z "$TAG" ]; then
  git fetch --tags --force 2>/dev/null || true
  TAG="$(git describe --tags --match 'v[0-9]*' --abbrev=0)"
fi
VERSION="${TAG#v}"
echo "ci_post_clone: setting MARKETING_VERSION=$VERSION (from tag $TAG)"

cd "$REPO/safari"
agvtool new-version -all "$VERSION"
