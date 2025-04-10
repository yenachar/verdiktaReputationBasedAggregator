#!/usr/bin/env node

// Load environment variables from .env file
require('dotenv').config();

const { spawn } = require('child_process');

// Retrieve your Infura API key from the .env file.
const INFURA_API_KEY = process.env.INFURA_API_KEY;
if (!INFURA_API_KEY) {
  console.error("Error: INFURA_API_KEY is not defined in your .env file.");
  process.exit(1);
}

// Construct the Infura URL for Base Sepolia.
// (Replace "base-sepolia" with the correct network name if needed.)
const FORK_URL = `https://base-sepolia.infura.io/v3/${INFURA_API_KEY}`;

// Define command-line arguments for Ganache CLI.
// --fork points to the URL of the network you wish to fork.
// --networkId sets the network id for your fork (optional, here set to 8453 which is Base Sepolia's network id).
const ganacheArgs = [
  '--fork', FORK_URL,
  '--networkId', '8453'
];

// Log the command for clarity.
console.log("Starting Ganache CLI fork for Base Sepolia...");
console.log(`Forking from: ${FORK_URL}`);

// Spawn a new Ganache CLI process using the defined arguments.
const ganacheProcess = spawn('ganache-cli', ganacheArgs, { stdio: 'inherit' });

// Handle exit event
ganacheProcess.on('close', (code) => {
  console.log(`Ganache CLI exited with code ${code}`);
});

