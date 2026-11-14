#!/usr/bin/env bash
# Private CA for the Mediqzy <-> SmartCRM partner link (mutual TLS, ADR-001).
#
# Each side keeps its own private key. SmartCRM generates its server key on
# its own box and sends only a CSR; this script signs it. No private key ever
# crosses between the two servers.
#
#   smartcrm-pki.sh init                 create the CA (once)
#   smartcrm-pki.sh client               Mediqzy's client key + certificate
#   smartcrm-pki.sh sign-server <csr>    sign SmartCRM's CSR for smartcrm.internal.mediqzy.com
#   smartcrm-pki.sh fetch-ca             bring ca.key back from SSM to renew (admin creds)
#   smartcrm-pki.sh show                 print what exists and when it expires
#
# PKI_DIR defaults to ~/.mediqzy-pki/smartcrm (0700). After signing SmartCRM's
# certificate, move ca.key OFF this server; it is only needed again to renew.
#
# Where ca.key lives now (since 2026-11-14): SSM SecureString
# /mediczy/pki/smartcrm/ca-key (ap-south-1), readable only by an admin login,
# not by the app's instance role. To renew, bring it back for the signing only:
#   smartcrm-pki.sh fetch-ca     # needs admin AWS credentials
#   smartcrm-pki.sh sign-server <csr>   (or delete client.* and run client)
#   shred -u ~/.mediqzy-pki/smartcrm/ca.key
set -euo pipefail
umask 077

PKI_DIR="${PKI_DIR:-$HOME/.mediqzy-pki/smartcrm}"
SERVER_NAME="${SERVER_NAME:-smartcrm.internal.mediqzy.com}"
CLIENT_CN="mediqzy-partner-client"
mkdir -p "$PKI_DIR" && chmod 700 "$PKI_DIR"
cd "$PKI_DIR"

die() { echo "error: $*" >&2; exit 1; }

case "${1:-}" in
  init)
    [ -e ca.key ] && die "CA already exists in $PKI_DIR"
    openssl ecparam -name prime256v1 -genkey -noout -out ca.key
    openssl req -x509 -new -key ca.key -sha256 -days 1825 -out ca.crt \
      -subj "/O=My SmartHealth/CN=Mediqzy SmartCRM Partner CA" \
      -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
      -addext "keyUsage=critical,keyCertSign,cRLSign"
    echo "CA created: $PKI_DIR/ca.crt (share this) and ca.key (keep private)"
    ;;
  client)
    [ -e ca.key ] || die "ca.key is not here — run init (new CA) or fetch-ca (existing CA)"
    [ -e client.key ] && die "client key already exists; delete it deliberately to rotate"
    openssl ecparam -name prime256v1 -genkey -noout -out client.key
    openssl req -new -key client.key -out client.csr -subj "/O=My SmartHealth/CN=$CLIENT_CN"
    openssl x509 -req -in client.csr -CA ca.crt -CAkey ca.key -CAcreateserial -sha256 -days 397 -out client.crt \
      -extfile <(printf "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=clientAuth\n")
    chmod 600 client.key
    echo "Client certificate: $PKI_DIR/client.crt, key: $PKI_DIR/client.key"
    echo "Set SMARTCRM_TLS_CA_FILE=$PKI_DIR/ca.crt SMARTCRM_TLS_CERT_FILE=$PKI_DIR/client.crt SMARTCRM_TLS_KEY_FILE=$PKI_DIR/client.key"
    ;;
  sign-server)
    csr="${2:-}"; [ -f "$csr" ] || die "usage: $0 sign-server <path-to-smartcrm.csr>"
    [ -e ca.key ] || die "ca.key is not here — run: $0 fetch-ca (admin AWS credentials), sign, then shred it"
    openssl req -in "$csr" -noout -verify >/dev/null 2>&1 || die "CSR signature does not verify"
    # The name comes from here, not from the CSR: whatever SmartCRM asked for,
    # the certificate is only valid for the private partner hostname.
    openssl x509 -req -in "$csr" -CA ca.crt -CAkey ca.key -CAcreateserial -sha256 -days 397 -out server.crt \
      -extfile <(printf "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:%s\n" "$SERVER_NAME")
    chmod 644 server.crt
    echo "Signed: $PKI_DIR/server.crt — send it and ca.crt to SmartCRM. Then move ca.key offline."
    ;;
  fetch-ca)
    [ -e ca.key ] && die "ca.key is already here"
    aws ssm get-parameter --region ap-south-1 --name /mediczy/pki/smartcrm/ca-key --with-decryption \
      --query Parameter.Value --output text > ca.key
    chmod 600 ca.key
    [ "$(openssl ec -in ca.key -pubout 2>/dev/null | sha256sum)" = "$(openssl x509 -in ca.crt -noout -pubkey | sha256sum)" ] \
      || { shred -u ca.key; die "fetched key does not match ca.crt"; }
    echo "ca.key restored for signing. Shred it when done: shred -u $PKI_DIR/ca.key"
    ;;
  show)
    for f in ca.crt client.crt server.crt; do
      [ -e "$f" ] && echo "$f: $(openssl x509 -in "$f" -noout -subject -enddate | tr '\n' ' ')"
    done
    [ -e ca.key ] && echo "ca.key: PRESENT on this server" || echo "ca.key: not here"
    ;;
  *) sed -n '2,22p' "$0"; exit 1 ;;
esac
