#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export JAVA_HOME="$PWD/.android-local/jdk" ANDROID_HOME="$PWD/.android-local/sdk" GRADLE_USER_HOME="$PWD/.android-local/gradle" ANDROID_USER_HOME="$PWD/.android-local/user"
adb="$ANDROID_HOME/platform-tools/adb"
node --input-type=module - <<'JS'
for(const port of [3480,3481]){const r=await fetch(`http://127.0.0.1:${port}`);if(!r.ok||(await r.json()).name!=='BitPolito local test relay')throw Error('Start npm run dev:relays first.');}
JS
# A previous team build may have replaced Capacitor's shared web-assets directory.
# Recreate the sandbox cohort before compiling/installing its test APK.
bash scripts/android-build.sh sandbox
android/gradlew -p android :app:assembleSandboxDebugAndroidTest --no-daemon --console=plain
"$adb" reverse tcp:3480 tcp:3480
"$adb" reverse tcp:3481 tcp:3481
"$adb" install -r android/app/build/outputs/apk/sandbox/debug/app-sandbox-debug.apk
"$adb" install -r android/app/build/outputs/apk/androidTest/sandbox/debug/app-sandbox-debug-androidTest.apk
result="$(mktemp /tmp/bitpolito-protocol.XXXXXX)"
trap 'rm -f "$result"' EXIT
"$adb" shell am instrument -w -e class it.bitpolito.hub.DistributedOfficeTest,it.bitpolito.hub.SecureStoreInstrumentedTest it.bitpolito.hub.sandbox.test/androidx.test.runner.AndroidJUnitRunner | tee "$result"
if rg -q 'FAILURES|INSTRUMENTATION_FAILED|shortMsg=' "$result" || ! rg -q 'OK \([0-9]+ tests?\)' "$result"; then exit 1; fi
