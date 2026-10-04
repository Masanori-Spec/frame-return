#!/usr/bin/env bash
# Run ONLY on the hosted ubuntu-24.04 native-validation job.
set -euo pipefail
if [[ "${GITHUB_ACTIONS:-}" != "true" || "${RUNNER_OS:-}" != "Linux" ]]; then
  echo 'Native package installation is restricted to the hosted GitHub Actions job.' >&2
  exit 2
fi
. /etc/os-release
if [[ "$ID" != ubuntu || "$VERSION_ID" != 24.04 ]]; then
  echo 'The native gate requires ubuntu-24.04 (noble).' >&2
  exit 2
fi
sudo timeout --kill-after=15s 180s apt-get update
sudo timeout --kill-after=15s 480s apt-get install --no-install-recommends -y \
  scribus=1.6.1-0ubuntu7 scribus-data=1.6.1-0ubuntu7 \
  fonts-dejavu-core fontconfig xvfb xauth poppler-utils
test "$(dpkg-query -W -f='${Version}' scribus)" = 1.6.1-0ubuntu7
test "$(dpkg-query -W -f='${Version}' scribus-data)" = 1.6.1-0ubuntu7
fc-cache -f
dpkg-query -W -f='${Package}=${Version}\n' \
  scribus scribus-data fonts-dejavu-core xvfb xauth poppler-utils
