#!/usr/bin/env bash
# Build the WealthTrack debug APK and copy it to wealthtrack/dist/WealthTrack-debug.apk.
#
#   ANDROID_HOME=/path/to/sdk ./build-apk.sh          # debug (default)
#   BUILD_TYPE=release ./build-apk.sh                  # release (debug-signed)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST="$HERE/../dist"
DEFAULT_SDK="/tmp/claude-0/-home-user-Business-Tracker-All-in-1-/ea871b97-2593-5181-9e87-340e0a52b0ed/scratchpad/android-sdk"

export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$DEFAULT_SDK}}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
if [ ! -d "$ANDROID_HOME/platforms" ]; then
  echo "Android SDK not found at $ANDROID_HOME (set ANDROID_HOME)." >&2
  exit 1
fi

BUILD_TYPE="${BUILD_TYPE:-debug}"
case "$BUILD_TYPE" in
  debug)   TASK=assembleDebug;   SRC="$HERE/app/build/outputs/apk/debug/app-debug.apk";     OUT="WealthTrack-debug.apk" ;;
  release) TASK=assembleRelease; SRC="$HERE/app/build/outputs/apk/release/app-release.apk"; OUT="WealthTrack-release.apk" ;;
  *) echo "BUILD_TYPE must be debug or release" >&2; exit 1 ;;
esac

if [ ! -f "$HERE/../web/index.html" ]; then
  echo "WARNING: ../web/index.html is missing; the APK will contain whatever is in wealthtrack/web/." >&2
fi

cd "$HERE"
./gradlew --no-daemon "$TASK"

mkdir -p "$DIST"
cp "$SRC" "$DIST/$OUT"
echo "APK: $(cd "$DIST" && pwd)/$OUT ($(du -h "$DIST/$OUT" | cut -f1))"
