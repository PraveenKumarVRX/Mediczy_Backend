#!/usr/bin/env bash
set -euo pipefail
# Retired: blanket runtime ownership lets application SQL drop audit history and disable RLS.
printf '%s\n' 'Refusing to grant schema/table ownership to an application runtime.' >&2
printf '%s\n' 'Restore with original owner roles and ACLs; use reviewed deployment migrations.' >&2
printf '%s\n' 'See docs/deployment/DATABASE_HARDENING_2026-10-19.md.' >&2
exit 2
