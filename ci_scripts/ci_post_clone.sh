#!/bin/sh
# Xcode Cloud custom build script — runs automatically after the clone.
# Sets MARKETING_VERSION from the git tag being built (workflow runs on tags).
# Xcode Cloud manages CURRENT_PROJECT_VERSION (build number) itself.
set -e

cd "$CI_PROJECT_DIR/safari" 2>/dev/null || cd "$(git rev-parse --show-toplevel)/safari"

TAG="$(git describe --tags --abbrev=0)"
VERSION="${TAG#v}"
echo "ci_post_clone: setting MARKETING_VERSION=$VERSION (from tag $TAG)"
agvtool new-version -all "$VERSION"
