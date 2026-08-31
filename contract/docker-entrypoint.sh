#!/usr/bin/env bash
# Entry point for the NEPA contract image.
#
#   build            verify the compiled wasm artifact (default; no network)
#   deploy           deploy to $STELLAR_NETWORK (needs STELLAR_SECRET_KEY)
#   <anything else>  exec'd verbatim (escape hatch for debugging)
set -euo pipefail

WASM="nepa_contract/target/wasm32-unknown-unknown/release/nepa_contract.wasm"

case "${1:-build}" in
  build)
    if [ ! -f "${WASM}" ]; then
      echo "::error:: contract wasm not found at ${WASM}" >&2
      exit 1
    fi
    echo "✅ Contract wasm built:"
    ls -l "${WASM}"
    sha256sum "${WASM}"
    ;;
  deploy)
    : "${STELLAR_NETWORK:?set STELLAR_NETWORK=testnet|mainnet}"
    : "${STELLAR_SECRET_KEY:?set STELLAR_SECRET_KEY for the deployer account}"
    echo "🚀 Deploying NEPA contract to ${STELLAR_NETWORK}…"
    exec npm run "deploy:${STELLAR_NETWORK}"
    ;;
  *)
    exec "$@"
    ;;
esac
