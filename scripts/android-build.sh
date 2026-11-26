#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
flavor="${1:-sandbox}"
if [[ "$flavor" != sandbox && "$flavor" != team ]]; then echo 'Use sandbox or team'; exit 1; fi
python3 scripts/marmot-setup.py
export VITE_HUB_PREVIEW=false
export ANDROID_USER_HOME="$PWD/.android-local/user"
export JAVA_HOME="$PWD/.android-local/jdk" ANDROID_HOME="$PWD/.android-local/sdk" GRADLE_USER_HOME="$PWD/.android-local/gradle"
if [[ ! -x "$JAVA_HOME/bin/java" ]]; then echo 'Run npm run android:setup first'; exit 1; fi
if [[ "$flavor" == sandbox ]]; then export VITE_ANDROID_SANDBOX=true; task=assembleSandboxDebug; else unset VITE_ANDROID_SANDBOX; task=assembleTeamDebug; fi
if [[ ! -f "$PWD/.android-local/debug.keystore" ]]; then
  "$JAVA_HOME/bin/keytool" -genkeypair -keystore "$PWD/.android-local/debug.keystore" -storepass android -keypass android -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=BitPolito Local Debug,O=BitPolito,C=IT'
fi
npm run build
npx cap sync android
(cd android && ./gradlew ":app:$task" :app:testSandboxDebugUnitTest --no-daemon --console=plain)
mkdir -p artifacts
cp "android/app/build/outputs/apk/$flavor/debug/app-$flavor-debug.apk" "artifacts/bitpolito-$flavor.apk"
(cd artifacts && sha256sum "bitpolito-$flavor.apk" > "bitpolito-$flavor.apk.sha256")
printf 'APK: artifacts/bitpolito-%s.apk\n' "$flavor"
