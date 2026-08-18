#!/usr/bin/env bash
set -Eeuo pipefail

umask 022

readonly ARCHIVE="${1:?Usage: install-release.sh <archive> <revision>}"
readonly REVISION="${2:?Usage: install-release.sh <archive> <revision>}"
readonly DEPLOY_ROOT="${HOME}/deploy/astrotrue.ru"
readonly STATE_DIR="${DEPLOY_ROOT}/state"
readonly ROLLBACK_DIR="${DEPLOY_ROOT}/rollback"
readonly WEB_ROOT="${HOME}/astrotrue.ru/www"
readonly LOG_FILE="${STATE_DIR}/deploy.log"
readonly REVISION_FILE="${STATE_DIR}/deployed-revision"
readonly HEALTH_IP="90.156.201.94"

mkdir -p "${STATE_DIR}" "${ROLLBACK_DIR}" "${WEB_ROOT}"
exec 9>"${STATE_DIR}/deploy.lock"
flock -n 9 || exit 0

exec >>"${LOG_FILE}" 2>&1
printf '\n[%s] Installing %s\n' "$(date --iso-8601=seconds)" "${REVISION}"

INCOMING_DIR="$(mktemp -d "${DEPLOY_ROOT}/incoming.XXXXXX")"
cleanup() {
  rm -rf "${INCOMING_DIR}" "${ARCHIVE}"
}
trap cleanup EXIT

tar -xzf "${ARCHIVE}" -C "${INCOMING_DIR}"
find "${INCOMING_DIR}" \( -name '.DS_Store' -o -name '._*' \) -delete
test -s "${INCOMING_DIR}/index.html"
test -s "${INCOMING_DIR}/styles.css"
test -s "${INCOMING_DIR}/script.js"

ROLLBACK_READY=0
restore_previous_release() {
  local status=$?
  if [[ "${ROLLBACK_READY}" -eq 1 ]]; then
    printf '[%s] Installation failed; restoring previous release\n' "$(date --iso-8601=seconds)"
    rsync -a --delete --exclude='.well-known/' "${ROLLBACK_DIR}/" "${WEB_ROOT}/"
  fi
  exit "${status}"
}
trap restore_previous_release ERR

rsync -a --delete --exclude='.well-known/' "${WEB_ROOT}/" "${ROLLBACK_DIR}/"
ROLLBACK_READY=1
rsync -a --delete --exclude='.well-known/' "${INCOMING_DIR}/" "${WEB_ROOT}/"

HEALTH_BODY="$(mktemp "${STATE_DIR}/health.XXXXXX")"
curl --fail --silent --show-error --max-time 20 \
  --resolve "astrotrue.ru:80:${HEALTH_IP}" \
  -o "${HEALTH_BODY}" \
  "http://astrotrue.ru/"
grep -q 'Простая астрология' "${HEALTH_BODY}"
rm -f "${HEALTH_BODY}"

ROLLBACK_READY=0
printf '%s\n' "${REVISION}" >"${REVISION_FILE}"
printf '[%s] Installation completed\n' "$(date --iso-8601=seconds)"
