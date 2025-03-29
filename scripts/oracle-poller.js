// scripts/oracle-poller.js
// To use an aggregator contract: 
// truffle exec scripts/oracle-poller.js --network base_sepolia -a 0xbabE69DdF8CBbe63fEDB6f49904efB35522667Af
// To use the aggregator in artifacts: 
// truffle exec scripts/oracle-poller.js --network base_sepolia

const ReputationKeeper = artifacts.require('ReputationKeeper');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// Minimal ABI for the aggregator contract
const AggregatorABI = [
  {
    "inputs": [],
    "name": "reputationKeeper",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
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
      {
        "name": "",
        "type": "address"
      }
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
        description: 'Aggregator contract address'
      })
      .help()
      .argv;

    let keeper;
    
    if (argv.aggregator) {
      console.log(`Looking up ReputationKeeper from Aggregator at: ${argv.aggregator}`);
      const aggregator = new web3.eth.Contract(AggregatorABI, argv.aggregator);
      const keeperAddress = await aggregator.methods.reputationKeeper().call();
      console.log(`Found ReputationKeeper at: ${keeperAddress}`);
      keeper = await ReputationKeeper.at(keeperAddress);
    } else {
      keeper = await ReputationKeeper.deployed();
    }
    
    console.log(`Connected to ReputationKeeper at: ${keeper.address}`);
    
    // Try to get registered oracles directly from the public array.
    console.log("\nAttempting to get oracles directly...");

    let i = 0;
    let foundOracles = [];
    
    // Try the first few indices to see if we can find any registered oracles.
    while (i < 10) {
      try {
        // registeredOracles is an array of OracleIdentity structs with 'oracle' and 'jobId' fields.
        const oracleIdentity = await keeper.registeredOracles(i);
        // Check that the oracle address is not the zero address.
        if (oracleIdentity.oracle && oracleIdentity.oracle !== '0x0000000000000000000000000000000000000000') {
          // Retrieve oracle info using both the oracle address and its job ID.
          const info = await keeper.getOracleInfo(oracleIdentity.oracle, oracleIdentity.jobId);
          foundOracles.push({
            address: oracleIdentity.oracle,
            jobId: oracleIdentity.jobId,
            info: info
          });
        }
      } catch (error) {
        // If an error occurs, we likely have reached the end of the array.
        break;
      }
      i++;
    }

    if (foundOracles.length === 0) {
      console.log("\nNo oracles found.");
      console.log("To register an oracle, you need to:");
      console.log("1. Have the required VDKA tokens (100 VDKA)");
      console.log("2. Call registerOracle() with:");
      console.log("   - oracle address");
      console.log("   - jobId");
      console.log("   - fee");
    } else {
      console.log(`\nFound ${foundOracles.length} oracle(s):`);
      // Use a for...of loop so we can await the owner() call for each oracle.
      for (let index = 0; index < foundOracles.length; index++) {
        const oracle = foundOracles[index];
        console.log(`\nOracle ${index + 1}:`);
        console.log(`Address: ${oracle.address}`);
        console.log(`Active: ${oracle.info.isActive}`);
        console.log(`Quality Score: ${oracle.info.qualityScore.toString()}`);
        console.log(`Timeliness Score: ${oracle.info.timelinessScore.toString()}`);
        // New: Print the call count.
        console.log(`Call Count: ${oracle.info.callCount.toString()}`);
	// locked/blocked info
	console.log(`Locked Until: ${oracle.info.lockedUntil.toString()}`);
	console.log(`Blocked: ${oracle.info.blocked}`);
        // Convert the jobId from bytes32 to a readable string.
        console.log(`Job ID: ${web3.utils.hexToAscii(oracle.jobId)}`);
	const classes = await keeper.getOracleClassesByKey(oracle.address, oracle.jobId);
	console.log(`Capability Classes: ${classes}`);
        console.log(`Fee: ${oracle.info.fee.toString()}`);

        // Create a minimal contract instance to query the owner() function.
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

