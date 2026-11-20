#!/bin/sh
# Xcode Cloud Post-Clone custom build script.
# Must live in ci_scripts/ next to the .xcodeproj. Runs with ci_scripts/ as cwd;
# the cloned repo is at $CI_PRIMARY_REPOSITORY_PATH.
# Sets MARKETING_VERSION from CI_TAG on tag builds; branch builds keep the
# committed version. Xcode Cloud manages CURRENT_PROJECT_VERSION (build number).
set -e

REPO="${CI_PRIMARY_REPOSITORY_PATH:-$(git rev-parse --show-toplevel 2>/dev/null)}"
cd "$REPO"

TAG="${1:-${CI_TAG:-}}"
if [ -z "$TAG" ]; then
  echo "ci_post_clone: no CI_TAG (branch build) — keeping committed MARKETING_VERSION"
  exit 0
fi

VERSION="${TAG#v}"
echo "ci_post_clone: setting MARKETING_VERSION=$VERSION (from tag $TAG)"

cd "$REPO/safari"
agvtool new-version -all "$VERSION"
