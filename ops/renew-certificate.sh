#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

readonly ACME_SH="${HOME}/deploy/acme.sh-src/acme.sh"
readonly ACME_HOME="${HOME}/deploy/acme"
readonly CERT_HOME="${ACME_HOME}/certs"
readonly CERT_DIR="${CERT_HOME}/astrotrue.ru"
readonly WEB_ROOT="${HOME}/astrotrue.ru/www"
readonly EXPORT_DIR="${HOME}/deploy/astrotrue.ru/certificate-upload"

test -x "${ACME_SH}" || {
  printf 'acme.sh not found: %s\n' "${ACME_SH}" >&2
  exit 1
}
test -d "${WEB_ROOT}"

if [[ -f "${CERT_DIR}/astrotrue.ru.conf" ]]; then
  "${ACME_SH}" --renew \
    --server letsencrypt \
    --home "${ACME_HOME}" \
    --config-home "${ACME_HOME}" \
    --cert-home "${CERT_HOME}" \
    -d astrotrue.ru
else
  "${ACME_SH}" --issue \
    --server letsencrypt \
    --home "${ACME_HOME}" \
    --config-home "${ACME_HOME}" \
    --cert-home "${CERT_HOME}" \
    --keylength 2048 \
    -d astrotrue.ru \
    -d www.astrotrue.ru \
    -w "${WEB_ROOT}"
fi

test -s "${CERT_DIR}/fullchain.cer"
test -s "${CERT_DIR}/astrotrue.ru.cer"
test -s "${CERT_DIR}/astrotrue.ru.key"
test -s "${CERT_DIR}/ca.cer"

readonly CERT_PUBLIC_KEY="$(openssl x509 -in "${CERT_DIR}/astrotrue.ru.cer" -pubkey -noout | openssl sha256)"
readonly PRIVATE_PUBLIC_KEY="$(openssl pkey -in "${CERT_DIR}/astrotrue.ru.key" -pubout | openssl sha256)"
[[ "${CERT_PUBLIC_KEY}" == "${PRIVATE_PUBLIC_KEY}" ]]
openssl verify -CAfile "${CERT_DIR}/ca.cer" "${CERT_DIR}/astrotrue.ru.cer"

install -m 700 -d "${EXPORT_DIR}"
install -m 600 "${CERT_DIR}/fullchain.cer" "${EXPORT_DIR}/astrotrue.ru.crt"
install -m 600 "${CERT_DIR}/astrotrue.ru.key" "${EXPORT_DIR}/astrotrue.ru.key"

openssl x509 -in "${EXPORT_DIR}/astrotrue.ru.crt" -noout -subject -issuer -dates -ext subjectAltName
printf '\nUpload these files through the Masterhost UI:\n%s\n%s\n' \
  "${EXPORT_DIR}/astrotrue.ru.crt" \
  "${EXPORT_DIR}/astrotrue.ru.key"
