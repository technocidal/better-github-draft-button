#!/bin/sh
# Xcode Cloud custom build script — runs automatically after the clone.
# Sets MARKETING_VERSION from the git tag being built (workflow runs on tags).
# Xcode Cloud manages CURRENT_PROJECT_VERSION (build number) itself.
set -e

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# Xcode Cloud clones are shallow — fetch tags or `git describe` sees stale/none.
git fetch --tags --force 2>/dev/null || true

TAG="${1:-$(git describe --tags --match 'v[0-9]*' --abbrev=0)}"
VERSION="${TAG#v}"
echo "ci_post_clone: setting MARKETING_VERSION=$VERSION (from tag $TAG)"

cd "$ROOT/safari"
agvtool new-version -all "$VERSION"
