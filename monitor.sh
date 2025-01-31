#!/bin/bash
export GANACHE_SKIP_NATIVE_BINDINGS=true
export NODE_NO_WARNINGS=1
GANACHE_SKIP_NATIVE_BINDINGS=true truffle exec scripts/monitor-contracts.js --network base_sepolia GANACHE_SKIP_NATIVE_BINDINGS=true 
