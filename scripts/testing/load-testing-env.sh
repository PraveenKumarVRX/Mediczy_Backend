#!/bin/bash
# Load optional testing environment variables for smoke tests.

if [ -f ".env.testing" ]; then
  set -a
  # shellcheck disable=SC1091
  . ".env.testing"
  set +a
fi
