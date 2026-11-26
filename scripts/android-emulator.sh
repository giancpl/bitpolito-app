#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export JAVA_HOME="$PWD/.android-local/jdk" ANDROID_HOME="$PWD/.android-local/sdk"
export ANDROID_USER_HOME="$PWD/.android-local/user" ANDROID_AVD_HOME="$PWD/.android-local/avd"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
mkdir -p "$ANDROID_AVD_HOME"
manager="$ANDROID_HOME/cmdline-tools/latest/bin"
"$manager/sdkmanager" emulator 'system-images;android-36;google_apis;x86_64'
if [[ ! -f "$ANDROID_AVD_HOME/bitpolito-test.ini" ]]; then
  printf 'no\n' | "$manager/avdmanager" create avd --name bitpolito-test --package 'system-images;android-36;google_apis;x86_64' --device pixel_7
fi
# On this host the headless software renderer crashes; the host GPU boots normally.
exec "$ANDROID_HOME/emulator/emulator" -avd bitpolito-test -no-snapshot -gpu host -feature -Vulkan -no-audio -no-boot-anim
