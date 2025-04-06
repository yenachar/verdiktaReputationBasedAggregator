// scripts/oracle-poller-cli.js
// Polls registered oracle identities using the ReputationKeeper address extracted
// from a supplied ReputationAggregator contract address.
//
// Usage examples:
// Using an aggregator contract address:
//   truffle exec scripts/oracle-poller-cl.js --network base_sepolia --aggregator 0xYourAggregatorAddress
// If no aggregator is provided, the script will error (aggregator is required).
// Example:
// truffle exec scripts/oracle-poller-cl.js -a 0x59067815e006e245449E1A24a1091dF176b3CF09 --network base_sepolia

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// Minimal ABI for the aggregator contract to extract the keeper address.
const AggregatorABI = [
  {
    "inputs": [],
    "name": "reputationKeeper",
    "outputs": [
      { "internalType": "address", "name": "", "type": "address" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// Minimal ABI for the ReputationKeeper contract.
const ReputationKeeperABI = [
  // Public array registeredOracles(uint256) returns (OracleIdentity)
  {
    "constant": true,
    "inputs": [{ "name": "", "type": "uint256" }],
    "name": "registeredOracles",
    "outputs": [
      { "name": "oracle", "type": "address" },
      { "name": "jobId", "type": "bytes32" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // getOracleInfo(address _oracle, bytes32 _jobId)
  {
    "inputs": [
      { "name": "_oracle", "type": "address" },
      { "name": "_jobId", "type": "bytes32" }
    ],
    "name": "getOracleInfo",
    "outputs": [
      { "name": "isActive", "type": "bool" },
      { "name": "qualityScore", "type": "int256" },
      { "name": "timelinessScore", "type": "int256" },
      { "name": "callCount", "type": "uint256" },
      { "name": "jobId", "type": "bytes32" },
      { "name": "fee", "type": "uint256" },
      { "name": "stakeAmount", "type": "uint256" },
      { "name": "lockedUntil", "type": "uint256" },
      { "name": "blocked", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // getOracleClassesByKey(address _oracle, bytes32 _jobId)
  {
    "inputs": [
      { "name": "_oracle", "type": "address" },
      { "name": "_jobId", "type": "bytes32" }
    ],
    "name": "getOracleClassesByKey",
    "outputs": [
      { "name": "", "type": "uint64[]" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // owner() function
  {
    "constant": true,
    "inputs": [],
    "name": "owner",
    "outputs": [
      { "name": "", "type": "address" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// Minimal ABI for calling owner() on an oracle contract.
const minimalOwnerABI = [
  {
    "constant": true,
    "inputs": [],
    "name": "owner",
    "outputs": [
      { "name": "", "type": "address" }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
];

module.exports = async function(callback) {
  try {
    const argv = yargs(hideBin(process.argv))
      .option('aggregator', {
        alias: 'a',
        type: 'string',
        description: 'ReputationAggregator contract address',
        demandOption: true
      })
      .help()
      .argv;

    // Extract the ReputationKeeper address from the aggregator.
    console.log(`Looking up ReputationKeeper from Aggregator at: ${argv.aggregator}`);
    const aggregator = new web3.eth.Contract(AggregatorABI, argv.aggregator);
    const keeperAddress = await aggregator.methods.reputationKeeper().call();
    console.log(`Found ReputationKeeper at: ${keeperAddress}`);
    const keeper = new web3.eth.Contract(ReputationKeeperABI, keeperAddress);
    console.log(`Connected to ReputationKeeper at: ${keeperAddress}`);

    // Attempt to read registered oracles directly from the keeper's public array.
    console.log("\nAttempting to get oracles directly from registeredOracles array...");
    let i = 0;
    let foundOracles = [];
    while (i < 10) {
      try {
        const oracleIdentity = await keeper.methods.registeredOracles(i).call();
        // Check that the oracle address is not the zero address.
        if (oracleIdentity.oracle && oracleIdentity.oracle !== '0x0000000000000000000000000000000000000000') {
          const info = await keeper.methods.getOracleInfo(oracleIdentity.oracle, oracleIdentity.jobId).call();
          foundOracles.push({
            address: oracleIdentity.oracle,
            jobId: oracleIdentity.jobId,
            info: info
          });
        }
      } catch (error) {
        // Likely reached the end of the registeredOracles array.
        break;
      }
      i++;
    }

    if (foundOracles.length === 0) {
      console.log("\nNo oracles found.");
      console.log("To register an oracle, ensure that:");
      console.log("1. You have the required VDKA tokens (100 VDKA).");
      console.log("2. You call registerOracle() with the oracle address, jobId, and fee.");
    } else {
      console.log(`\nFound ${foundOracles.length} oracle(s):`);
      for (let index = 0; index < foundOracles.length; index++) {
        const oracle = foundOracles[index];
        console.log(`\nOracle ${index + 1}:`);
        console.log(`Address: ${oracle.address}`);
        console.log(`Active: ${oracle.info.isActive}`);
        console.log(`Quality Score: ${oracle.info.qualityScore.toString()}`);
        console.log(`Timeliness Score: ${oracle.info.timelinessScore.toString()}`);
        console.log(`Call Count: ${oracle.info.callCount.toString()}`);
        console.log(`Locked Until: ${oracle.info.lockedUntil.toString()}`);
        console.log(`Blocked: ${oracle.info.blocked}`);
        // Convert jobId from bytes32 to a readable string.
        console.log(`Job ID: ${web3.utils.hexToAscii(oracle.jobId)}`);
        const classes = await keeper.methods.getOracleClassesByKey(oracle.address, oracle.jobId).call();
        console.log(`Capability Classes: ${classes}`);
        console.log(`Fee: ${oracle.info.fee.toString()}`);
        // Retrieve the oracle contract's owner using a minimal ABI instance.
        let ownerAddress;
        try {
          const ownerContract = new web3.eth.Contract(minimalOwnerABI, oracle.address);
          ownerAddress = await ownerContract.methods.owner().call();
        } catch (error) {
          ownerAddress = "Error retrieving owner";
        }
        console.log(`Owner Address: ${ownerAddress}`);
      }
    }
    
    callback();
  } catch (error) {
    console.error("Error:", error);
    callback(error);
  }
};

