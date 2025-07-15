/**
 * Truffle configuration — four networks
 *  • development   – local Ganache/Hardhat fork (TESTNET key)
 *  • sepolia       – Ethereum Sepolia
 *  • base_sepolia  – Base Sepolia
 *  • mainnet       – Ethereum mainnet
 *  • base          – Base mainnet
 *
 * .env required keys
 *   # shared
 *   INFURA_API_KEY, ETHERSCAN_API_KEY, BASESCAN_API_KEY
 *
 *   # production
 *   PRIVATE_KEY_MAINNET = 0xabc...
 *
 *   # testnets / local
 *   PRIVATE_KEY_TESTNET    = 0xdef...
 *   PRIVATE_KEY_TESTNET_2  = 0xghi...   (optional)
 */

require('dotenv').config();
const HDWalletProvider = require('@truffle/hdwallet-provider');
const https  = require('https');
const fetch  = require('node-fetch');

module.exports = {
  networks: {
    // ───────────────────────── development ─────────────────────────
    development: {
      provider: () =>
        new HDWalletProvider(
          process.env.PRIVATE_KEY_TESTNET,   // Rich account's private key
          "http://127.0.0.1:8545"            // Ganache fork URL
        ),
      network_id: "*",
    },

    // ───────────────────────── Sepolia ─────────────────────────
    sepolia: {
      provider: () => {
        const agent = new https.Agent({
          keepAlive: true,
          keepAliveMsecs: 60 * 1000
        });

        return new HDWalletProvider({
          privateKeys: [
            process.env.PRIVATE_KEY_TESTNET,
            process.env.PRIVATE_KEY_TESTNET_2
          ],
          providerOrUrl: `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
          fetch: (url, options) => fetch(url, { ...options, agent })
        });
      },
      network_id: 11155111,
      chain_id: 11155111,
      gas: 18500000,
      gasPrice: 10000000000,   // 10 gwei
      confirmations: 2,
      timeoutBlocks: 200,
      networkCheckTimeout: 30000,
      skipDryRun: true
    },

    // ───────────────────────── Base Sepolia ─────────────────────────
    base_sepolia: {
      provider: () => {
        const agent = new https.Agent({
          keepAlive: true,
          keepAliveMsecs: 60 * 1000
        });

        return new HDWalletProvider({
          privateKeys: [
            process.env.PRIVATE_KEY_TESTNET,
            process.env.PRIVATE_KEY_TESTNET_2
          ],
          providerOrUrl: `https://base-sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
          fetch: (url, options) => fetch(url, { ...options, agent })
        });
      },
      network_id: 84532,
      chain_id: 84532,
      gas: 10000000,
      gasPrice: 2000000000,    // 2 gwei
      confirmations: 2,
      timeoutBlocks: 400,
      networkCheckTimeout: 30000,
      skipDryRun: true
    },

    // ───────────────────────── Ethereum MAINNET ─────────────────────────
    mainnet: {
      provider: () => {
        const agent = new https.Agent({ keepAlive: true, keepAliveMsecs: 60 * 1000 });
        return new HDWalletProvider({
          privateKeys: [process.env.PRIVATE_KEY_MAINNET],
          providerOrUrl: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
          fetch: (url, opts) => fetch(url, { ...opts, agent })
        });
      },
      network_id: 1,
      chain_id: 1,
      gas: 0,
      //gasPrice: 30000000000,   // 30 gwei (tune before deploy)
      maxFeePerGas:          1e9,          // 1 gwei ceiling
      maxPriorityFeePerGas:   1.5e8,       // 0.15 gwei tip
      confirmations: 2,
      timeoutBlocks: 400,
      networkCheckTimeout: 60000,
      skipDryRun: false
    },

    // ───────────────────────── Base MAINNET ─────────────────────────
    base: {
      provider: () => {
        const agent = new https.Agent({ keepAlive: true, keepAliveMsecs: 60 * 1000 });
        return new HDWalletProvider({
          privateKeys: [process.env.PRIVATE_KEY_MAINNET],   // reuse prod key
          providerOrUrl: `https://base-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
          fetch: (url, opts) => fetch(url, { ...opts, agent })
        });
      },
      network_id: 8453,
      chain_id: 8453,
      gas: 10000000,
      gasPrice: 60000000,    // 0.06 gwei
      confirmations: 2,
      timeoutBlocks: 400,
      networkCheckTimeout: 60000,
      skipDryRun: true
    }
  },

  // ───────────────────────── plugins & verification ─────────────────────────
  plugins: ['truffle-plugin-verify'],

  api_keys: {
    etherscan: process.env.ETHERSCAN_API_KEY,
    basescan:  process.env.BASESCAN_API_KEY
  },

  mocha: { timeout: 100000 },

  compilers: {
    solc: {
      version: "0.8.21",
      settings: {
        optimizer: { enabled: true, runs: 200 }
      }
    }
  }
};

