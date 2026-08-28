# syntax=docker/dockerfile:1
#
# Build + deploy image for the NEPA Soroban smart contract.
#
# Two responsibilities:
#   1. Compile the Rust contract to a wasm32 artifact (the real, verifiable
#      output — same command as ci.yml's contract-ci job).
#   2. Carry the Stellar SDK deploy tooling so the same image can publish the
#      wasm to testnet/mainnet.
#
# The default entrypoint command is `build`, which only verifies the compiled
# wasm and never touches the network. On-chain `deploy` is opt-in and requires
# STELLAR_NETWORK + STELLAR_SECRET_KEY.

############################
# 1. Rust → wasm builder
############################
FROM rust:1.85-slim-bookworm AS wasm-builder
WORKDIR /contract
RUN rustup target add wasm32-unknown-unknown
# Manifests first for layer caching, then sources.
COPY nepa_contract/Cargo.toml nepa_contract/Cargo.lock ./nepa_contract/
COPY nepa_contract/src ./nepa_contract/src
RUN cd nepa_contract \
 && cargo build --release --target wasm32-unknown-unknown \
 && ls -l target/wasm32-unknown-unknown/release/nepa_contract.wasm

############################
# 2. Node deploy tooling
############################
FROM node:20-slim AS runtime
ENV NODE_ENV=production \
    STELLAR_NETWORK=testnet
WORKDIR /contract
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# ts-node + @stellar/stellar-sdk drive scripts/deploy.ts (deploy:testnet / :mainnet).
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
COPY deployments ./deployments
# Compiled wasm from stage 1, at the path the tooling and CI expect.
COPY --from=wasm-builder \
     /contract/nepa_contract/target/wasm32-unknown-unknown/release/nepa_contract.wasm \
     ./nepa_contract/target/wasm32-unknown-unknown/release/nepa_contract.wasm
COPY docker-entrypoint.sh /usr/local/bin/nepa-contract
RUN chmod +x /usr/local/bin/nepa-contract
ENTRYPOINT ["nepa-contract"]
CMD ["build"]
