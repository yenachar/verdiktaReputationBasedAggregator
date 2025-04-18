// scripts/unregister-oracle-cl.js
// Unregisters one or more oracle identities (address/jobID combinations)
// and reclaims the staked 100 wVDKA tokens for each,
// using user-supplied contract addresses via command-line options.
//
// Usage example:
// truffle exec scripts/unregister-oracle-cl.js \
//   --aggregator 0xAggregatorAddress \
//   --oracle 0xOracleAddress \
//   --wrappedverdikta 0xWrappedVerdiktaTokenAddress \
//   --jobids "38f19572c51041baa5f2dea284614590" "39515f75ac2947beb7f2eeae4d8eaf3e" \
//   --network your_network
//
// Example:
// truffle exec scripts/unregister-oracle-cl.js -a 0x59067815e006e245449E1A24a1091dF176b3CF09 \
//   -w 0x6bF578606493b03026473F838bCD3e3b5bBa5515 \
//   -o 0xD67D6508D4E5611cd6a463Dd0969Fa153Be91101 \
//   --jobids "38f19572c51041baa5f2dea284614590" "39515f75ac2947beb7f2eeae4d8eaf3e" \
//   --network base_sepolia

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

//
// Minimal ABIs
//

// Aggregator: used only to derive the ReputationKeeper address.
const AggregatorABI = [
  {
    "inputs": [],
    "name": "reputationKeeper",
    "outputs": [
      { "internalType": "address", "name": "", "type": "address" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getContractConfig",
    "outputs": [
      { "internalType": "address", "name": "oracleAddr", "type": "address" },
      { "internalType": "address", "name": "linkAddr", "type": "address" },
      { "internalType": "bytes32", "name": "jobId", "type": "bytes32" },
      { "internalType": "uint256", "name": "fee", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// ReputationKeeper: updated minimal functions for deregistration and info query.
const ReputationKeeperABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "_oracle", "type": "address" },
      { "internalType": "bytes32", "name": "_jobId", "type": "bytes32" }
    ],
    "name": "deregisterOracle",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "_oracle", "type": "address" },
      { "internalType": "bytes32", "name": "_jobId", "type": "bytes32" }
    ],
    "name": "getOracleInfo",
    "outputs": [
      { "internalType": "bool", "name": "isActive", "type": "bool" },
      { "internalType": "int256", "name": "qualityScore", "type": "int256" },
      { "internalType": "int256", "name": "timelinessScore", "type": "int256" },
      { "internalType": "uint256", "name": "callCount", "type": "uint256" },
      { "internalType": "bytes32", "name": "jobId", "type": "bytes32" },
      { "internalType": "uint256", "name": "fee", "type": "uint256" },
      { "internalType": "uint256", "name": "stakeAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "lockedUntil", "type": "uint256" },
      { "internalType": "bool", "name": "blocked", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      { "internalType": "address", "name": "", "type": "address" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// WrappedVerdiktaToken: minimal function for balance checking.
const WrappedVerdiktaTokenABI = [
  {
    "constant": true,
    "inputs": [{ "name": "account", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "name": "", "type": "uint256" }],
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
    console.log('Starting oracle deregistration and wVDKA reclaim process...');

    const argv = yargs(hideBin(process.argv))
      .option('aggregator', {
        alias: 'a',
        type: 'string',
        description: 'Reputation Aggregator contract address'
      })
      .option('oracle', {
        alias: 'o',
        type: 'string',
        description: 'Oracle contract address'
      })
      .option('wrappedverdikta', {
        alias: 'w',
        type: 'string',
        description: 'WrappedVerdiktaToken contract address'
      })
      .option('jobids', {
        alias: 'j',
        type: 'array',
        description: 'Job ID strings (as an array)'
      })
      .demandOption(
        ['aggregator', 'oracle', 'wrappedverdikta', 'jobids'],
        'Please provide aggregator, oracle, wrappedverdikta addresses and at least one job id.'
      )
      .help()
      .argv;

    // Get the caller account.
    const accounts = await web3.eth.getAccounts();
    const caller = accounts[0];
    console.log('Using caller account:', caller);

    // Instantiate the Aggregator contract and derive the ReputationKeeper address.
    const aggregator = new web3.eth.Contract(AggregatorABI, argv.aggregator);
    const keeperAddress = await aggregator.methods.reputationKeeper().call();
    console.log('Derived ReputationKeeper address:', keeperAddress);

    // Instantiate the ReputationKeeper contract.
    const keeper = new web3.eth.Contract(ReputationKeeperABI, keeperAddress);

    // Instantiate the WrappedVerdiktaToken contract.
    const wrappedVerdikta = new web3.eth.Contract(WrappedVerdiktaTokenABI, argv.wrappedverdikta);

    // Instantiate a minimal contract to fetch the oracle contract's owner.
    const oracleOwnerContract = new web3.eth.Contract(minimalOwnerABI, argv.oracle);
    const oracleOwner = await oracleOwnerContract.methods.owner().call();
    console.log("Oracle contract owner:", oracleOwner);

    // Retrieve the ReputationKeeper owner.
    const keeperOwner = await keeper.methods.owner().call();
    console.log("ReputationKeeper owner:", keeperOwner);

    // Check if the caller is authorized: must be either the keeper owner or the oracle owner.
    if (
      caller.toLowerCase() !== keeperOwner.toLowerCase() &&
      caller.toLowerCase() !== oracleOwner.toLowerCase()
    ) {
      console.error("Error: The caller account is not authorized to unregister this oracle. It must be either the ReputationKeeper owner or the oracle contract owner.");
      return callback(new Error("Not authorized"));
    }

    // Check the caller's initial wVDKA balance.
    const initialBalance = await wrappedVerdikta.methods.balanceOf(caller).call();
    console.log('Initial wVDKA balance:', initialBalance.toString());

    // Process each job ID.
    const jobIdStrings = argv.jobids;
    console.log('Job IDs:', jobIdStrings);

    for (let i = 0; i < jobIdStrings.length; i++) {
      const currentJobIdString = jobIdStrings[i];
      // Convert the job ID string to a bytes32 value.
      const jobId = web3.utils.fromAscii(currentJobIdString);
      console.log(`\nProcessing jobID ${currentJobIdString} (bytes32: ${jobId})`);

      // Retrieve registration info.
      const oracleInfo = await keeper.methods.getOracleInfo(argv.oracle, jobId).call();
      console.log(`Oracle registration status for jobID ${currentJobIdString}:`, {
        isActive: oracleInfo.isActive,
        qualityScore: oracleInfo.qualityScore,
        timelinessScore: oracleInfo.timelinessScore,
        callCount: oracleInfo.callCount,
        jobId: web3.utils.hexToAscii(oracleInfo.jobId),
        fee: oracleInfo.fee,
        stakeAmount: oracleInfo.stakeAmount,
        lockedUntil: oracleInfo.lockedUntil,
        blocked: oracleInfo.blocked
      });

      if (!oracleInfo.isActive) {
        console.log(`Oracle for jobID ${currentJobIdString} is not registered. Skipping...`);
        continue;
      }

      // Call deregisterOracle with the oracle address and jobId.
      console.log(`Deregistering oracle for jobID ${currentJobIdString}...`);
      const tx = await keeper.methods.deregisterOracle(argv.oracle, jobId).send({ from: caller });
      console.log(`Deregister transaction for jobID ${currentJobIdString} hash:`, tx.transactionHash || tx.tx);
    }

    // Check the caller's final wVDKA balance after reclaiming the stake(s).
    const finalBalance = await wrappedVerdikta.methods.balanceOf(caller).call();
    console.log('Final wVDKA balance:', finalBalance.toString());

    console.log('Oracle deregistration and wVDKA reclaim completed successfully.');
    callback();
  } catch (error) {
    console.error('Error during oracle deregistration:', error);
    callback(error);
  }
};

