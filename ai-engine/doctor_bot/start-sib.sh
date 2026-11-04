#!/usr/bin/env bash
# Compatibility entrypoint: reuse the canonical secret-loading, authenticated runtime.
set -e
SIB_WRAPPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SIB_WRAPPER_DIR/../../scripts/sib-fastapi-start.sh"
