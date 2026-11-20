#!/bin/sh
# Xcode Cloud Post-Clone custom build script.
# Must live in ci_scripts/ next to the .xcodeproj. Runs with ci_scripts/ as cwd;
# the cloned repo is at $CI_PRIMARY_REPOSITORY_PATH.
#
# Sets MARKETING_VERSION from the tag being built:
#   - tag builds: CI_TAG
#   - branch builds: latest v* tag from the remote (shallow clones don't carry
#     tags, so list them via ls-remote instead of git describe)
# Xcode Cloud manages CURRENT_PROJECT_VERSION (build number) itself.
set -e

REPO="${CI_PRIMARY_REPOSITORY_PATH:-$(git rev-parse --show-toplevel 2>/dev/null)}"
cd "$REPO"

TAG="${1:-${CI_TAG:-}}"
if [ -z "$TAG" ]; then
  TAG="$(git ls-remote --tags origin 'refs/tags/v[0-9]*' 2>/dev/null \
    | sed 's|.*refs/tags/||' | grep -v '\^{}' | sort -V | tail -1)"
fi
if [ -z "$TAG" ]; then
  echo "ci_post_clone: no tag found — keeping committed MARKETING_VERSION"
  exit 0
fi

VERSION="${TAG#v}"
echo "ci_post_clone: setting MARKETING_VERSION=$VERSION (from tag $TAG)"

cd "$REPO/safari"
# Set MARKETING_VERSION directly in the pbxproj instead of via agvtool:
# agvtool's new-marketing-version argument parsing differs across Xcode versions
# (-all after the subcommand -> "requires a single argument"). MARKETING_VERSION
# is set per-target (8 build configurations), so rewrite every occurrence.
# (macOS sed requires the empty -i argument.)
PBXPROJ="Better GitHub Draft Button.xcodeproj/project.pbxproj"
sed -i '' "s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = $VERSION;/" "$PBXPROJ"
grep -q "MARKETING_VERSION = $VERSION;" "$PBXPROJ" \
  || { echo "ci_post_clone: failed to set MARKETING_VERSION=$VERSION" >&2; exit 1; }
