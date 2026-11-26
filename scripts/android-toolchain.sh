#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
root="$PWD/.android-local"
mkdir -p "$root"
if [[ ! -x "$root/jdk/bin/java" ]]; then
  curl --fail --location --retry 2 'https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse' -o "$root/jdk.tar.gz"
  mkdir -p "$root/jdk"
  tar -xzf "$root/jdk.tar.gz" -C "$root/jdk" --strip-components=1
  rm "$root/jdk.tar.gz"
fi
export ANDROID_USER_HOME="$root/user"
export JAVA_HOME="$root/jdk"
export ANDROID_HOME="$root/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
export GRADLE_USER_HOME="$root/gradle"
if [[ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]]; then
  curl --fail --location --retry 2 'https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip' -o "$root/tools.zip"
  mkdir -p "$root/tools" "$ANDROID_HOME/cmdline-tools"
  unzip -q "$root/tools.zip" -d "$root/tools"
  mv "$root/tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm "$root/tools.zip"
  rmdir "$root/tools"
fi
# SDK licenses are accepted for this local Android build environment only.
set +o pipefail
yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses > "$root/licenses.log"
set -o pipefail
"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0' 'build-tools;35.0.0'
printf 'Android toolchain ready at %s\n' "$root"
