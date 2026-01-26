#!/bin/bash
set -e

echo "Stopping any running Arcium nodes..."
docker-compose -f artifacts/docker-compose-arx-env.yml down || true
docker ps -q | xargs -r docker stop
docker ps -q | xargs -r docker rm

echo "Killing any lingering arx processes..."
pkill -f arx || true

echo "Killing any lingering solana or faucet processes..."
pkill -f solana-test-validator || true
pkill -f solana-faucet || true
pkill -f "solana-test-validator" || true

echo "Waiting for ports to clear..."
while lsof -i :8899 >/dev/null 2>&1 || lsof -i :9900 >/dev/null 2>&1; do
    echo "Ports 8899 or 9900 still in use, waiting..."
    sleep 1
done

echo "Cleaning up test-ledger..."
rm -rf .anchor/test-ledger

echo "Environment nuked. You can now run 'arcium localnet' cleanly."
