#!/bin/bash
set -e

echo "Generating Gas Consumption Report..."

# 1. Build and Optimize
echo "Building contract..."
cd contracts/soroban
cargo build --target wasm32-unknown-unknown --release

echo "Optimizing contract..."
soroban contract optimize --wasm target/wasm32-unknown-unknown/release/multisig_safe.wasm

OPTIMIZED_WASM="target/wasm32-unknown-unknown/release/multisig_safe.optimized.wasm"

# 2. Get WASM size (indicator of gas cost for installation)
WASM_SIZE=$(du -h "$OPTIMIZED_WASM" | cut -f1)
echo "Optimized WASM size: $WASM_SIZE"

# 3. Use soroban-cli to get detailed audit
# In a CI environment, we'd need some setup for initial transactions
# to get a real 'execute' gas estimate.
# For now, we report the audit info from the binary.
echo "### Gas Audit Report ###"
soroban contract inspect --wasm "$OPTIMIZED_WASM"

# 4. Compare with baseline (if enabled)
# This could comment on the PR
echo "### PR Summary ###"
echo "| Metric | Value |"
echo "| --- | --- |"
echo "| WASM Size | $WASM_SIZE |"
echo "| Optimization | On (Oz) |"
echo "| Soroban SDK | 20.x |"

echo "Gas report generated."
