// scripts/monitor-contracts-cli.js
// Monitors contract deployments and status using user‐supplied contract addresses.
// The ReputationKeeper address is extracted from the ReputationAggregator contract.
//
// Usage example:
// truffle exec scripts/monitor-contracts-cli.js \
//   --wrappedverdikta 0xYourTokenAddress \
//   --aggregator 0xYourReputationAggregatorAddress \
//   --network your_network
// Example:
// truffle exec scripts/monitor-contracts-cl.js \
//   -w 0x6bF578606493b03026473F838bCD3e3b5bBa5515 \
//   -a 0x59067815e006e245449E1A24a1091dF176b3CF09 \
//   --network base_sepolia

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

//
// Minimal ABIs
//

// WrappedVerdiktaToken (ERC20 minimal) ABI: supports name, symbol, totalSupply.
const WrappedVerdiktaTokenABI = [
  {
    "constant": true,
    "inputs": [],
    "name": "name",
    "outputs": [{"name": "", "type": "string"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "symbol",
    "outputs": [{"name": "", "type": "string"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "totalSupply",
    "outputs": [{"name": "", "type": "uint256"}],
    "type": "function"
  }
];

// ReputationKeeper ABI: supports owner, getOracleInfo, getOracleClassesByKey,
// and includes the OracleRegistered event.
const ReputationKeeperABI = [
  {
    "constant": true,
    "inputs": [],
    "name": "owner",
    "outputs": [{"name": "", "type": "address"}],
    "type": "function"
  },
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
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "oracle", "type": "address" },
      { "indexed": false, "name": "jobId", "type": "bytes32" },
      { "indexed": false, "name": "fee", "type": "uint256" }
    ],
    "name": "OracleRegistered",
    "type": "event"
  }
];

// ReputationAggregator ABI: supports owner, oraclesToPoll, requiredResponses,
// clusterSize, responseTimeoutSeconds, maxOracleFee, getContractConfig, and
// the reputationKeeper getter to extract the keeper address.
const ReputationAggregatorABI = [
  {
    "constant": true,
    "inputs": [],
    "name": "owner",
    "outputs": [{"name": "", "type": "address"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "oraclesToPoll",
    "outputs": [{"name": "", "type": "uint256"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "requiredResponses",
    "outputs": [{"name": "", "type": "uint256"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "clusterSize",
    "outputs": [{"name": "", "type": "uint256"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "responseTimeoutSeconds",
    "outputs": [{"name": "", "type": "uint256"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "maxOracleFee",
    "outputs": [{"name": "", "type": "uint256"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "getContractConfig",
    "outputs": [
      { "name": "oracleAddr", "type": "address" },
      { "name": "linkAddr", "type": "address" },
      { "name": "jobId", "type": "bytes32" },
      { "name": "fee", "type": "uint256" }
    ],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "reputationKeeper",
    "outputs": [
      { "name": "", "type": "address" }
    ],
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "bytes32", "name": "requestId", "type": "bytes32" },
      { "indexed": false, "internalType": "string[]", "name": "cids", "type": "string[]" }
    ],
    "name": "RequestAIEvaluation",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "bytes32", "name": "requestId", "type": "bytes32" },
      { "indexed": false, "internalType": "uint256[]", "name": "aggregatedLikelihoods", "type": "uint256[]" },
      { "indexed": false, "internalType": "string", "name": "combinedJustificationCIDs", "type": "string" }
    ],
    "name": "FulfillAIEvaluation",
    "type": "event"
  }
];

module.exports = async function(callback) {
  try {
    console.log('Starting contract monitoring...\n');

    // Parse command-line options for contract addresses.
    // Only require WrappedVerdiktaToken and ReputationAggregator addresses.
    const argv = yargs(hideBin(process.argv))
      .option('wrappedverdikta', {
        alias: 'w',
        type: 'string',
        description: 'WrappedVerdiktaToken contract address'
      })
      .option('aggregator', {
        alias: 'a',
        type: 'string',
        description: 'ReputationAggregator contract address'
      })
      .demandOption(['wrappedverdikta', 'aggregator'], 'Please provide both the wrappedverdikta and aggregator addresses.')
      .help()
      .argv;

    // Instantiate contracts using user-supplied addresses.
    const token = new web3.eth.Contract(WrappedVerdiktaTokenABI, argv.wrappedverdikta);
    const aggregator = new web3.eth.Contract(ReputationAggregatorABI, argv.aggregator);

    // Extract the ReputationKeeper address from the aggregator.
    const keeperAddress = await aggregator.methods.reputationKeeper().call();
    console.log(`Derived ReputationKeeper address: ${keeperAddress}`);
    const keeper = new web3.eth.Contract(ReputationKeeperABI, keeperAddress);

    // Network information.
    const networkId = await web3.eth.net.getId();
    const networkType = await web3.eth.net.getNetworkType();
    console.log('\n=== Deployment Information ===');
    console.log(`Network: ${networkType} (ID: ${networkId})`);

    // WrappedVerdiktaToken information.
    console.log('\n=== WrappedVerdiktaToken Information ===');
    const tokenName = await token.methods.name().call();
    const tokenSymbol = await token.methods.symbol().call();
    const totalSupply = await token.methods.totalSupply().call();
    console.log(`Address: ${argv.wrappedverdikta}`);
    console.log(`Name: ${tokenName}`);
    console.log(`Symbol: ${tokenSymbol}`);
    console.log(`Supply: ${web3.utils.fromWei(totalSupply, 'ether')} tokens`);

    // ReputationKeeper information.
    console.log('\n=== ReputationKeeper Information ===');
    const keeperBalance = await web3.eth.getBalance(keeperAddress);
    const keeperOwner = await keeper.methods.owner().call();
    console.log(`Address: ${keeperAddress}`);
    console.log(`Owner: ${keeperOwner}`);
    console.log(`Balance: ${web3.utils.fromWei(keeperBalance, 'ether')} ETH`);

    // Retrieve registered oracles via OracleRegistered events.
    console.log('\n=== Registered Oracles Information ===');
    const registeredEvents = await keeper.getPastEvents('OracleRegistered', {
      fromBlock: 0,
      toBlock: 'latest'
    });

    // Use a Map to store unique oracle/jobID pairs.
    const uniqueOracles = new Map();
    for (const event of registeredEvents) {
      const oracle = event.returnValues.oracle;
      const jobId = event.returnValues.jobId; // bytes32 hex string
      const fee = event.returnValues.fee;
      const key = `${oracle}-${jobId}`;
      if (!uniqueOracles.has(key)) {
        uniqueOracles.set(key, { oracle, jobId, fee });
      }
    }

    if (uniqueOracles.size === 0) {
      console.log("No registered oracles found");
    } else {
      console.log("Active registered oracles:");
      let activeCount = 0;
      for (const [key, oracleEntry] of uniqueOracles.entries()) {
        const oracleInfo = await keeper.methods.getOracleInfo(oracleEntry.oracle, oracleEntry.jobId).call();
        if (oracleInfo.isActive) {
          console.log(`\nOracle Address: ${oracleEntry.oracle}`);
          console.log(`Job ID (raw bytes32): ${oracleEntry.jobId}`);
          console.log(`Quality Score: ${oracleInfo.qualityScore.toString()}`);
          console.log(`Timeliness Score: ${oracleInfo.timelinessScore.toString()}`);
          console.log(`Call Count: ${oracleInfo.callCount.toString()}`);
          console.log(`Fee: ${oracleInfo.fee.toString()}`);
          try {
            const classes = await keeper.methods.getOracleClassesByKey(oracleEntry.oracle, oracleEntry.jobId).call();
            console.log(`Classes: ${classes}`);
          } catch (err) {
            console.log(`Classes: Not available`);
          }
          activeCount++;
        }
      }
      if (activeCount === 0) {
        console.log("None of the registered oracles are active.");
      }
    }

    // ReputationAggregator information.
    console.log('\n=== ReputationAggregator Information ===');
    const aggBalance = await web3.eth.getBalance(argv.aggregator);
    const aggOwner = await aggregator.methods.owner().call();
    const oraclesToPoll = await aggregator.methods.oraclesToPoll().call();
    const requiredResponses = await aggregator.methods.requiredResponses().call();
    const clusterSize = await aggregator.methods.clusterSize().call();
    const responseTimeout = await aggregator.methods.responseTimeoutSeconds().call();
    const maxOracleFee = await aggregator.methods.maxOracleFee().call();

    try {
      const config = await aggregator.methods.getContractConfig().call();
      console.log(`Aggregator's LINK Token: ${config.linkAddr}`);
    } catch (error) {
      console.log('No active configuration for LINK Token address found');
    }

    console.log('\nAggregator Configuration:');
    console.log(`Address: ${argv.aggregator}`);
    console.log(`Owner: ${aggOwner}`);
    console.log(`Oracles to Poll: ${oraclesToPoll}`);
    console.log(`Required Responses: ${requiredResponses}`);
    console.log(`Cluster Size: ${clusterSize}`);
    console.log(`Response Timeout: ${responseTimeout.toString()} seconds`);
    console.log(`Max Oracle Fee: ${web3.utils.fromWei(maxOracleFee.toString(), 'ether')} LINK`);
    console.log(`Aggregator Balance: ${web3.utils.fromWei(aggBalance, 'ether')} ETH`);

    // Retrieve recent aggregator events (from the last 1000 blocks).
    const currentBlock = await web3.eth.getBlockNumber();
    const fromBlock = currentBlock - 1000;
    const events = await aggregator.getPastEvents('allEvents', {
      fromBlock: fromBlock,
      toBlock: 'latest'
    });

    console.log('\nRecent Aggregator Events:');
    events.forEach(event => {
      console.log(`\nEvent: ${event.event}`);
      console.log('Parameters:', event.returnValues);
      console.log(`Block: ${event.blockNumber}`);
      console.log(`Transaction: ${event.transactionHash}`);
    });

    // Get current gas price.
    const gasPrice = await web3.eth.getGasPrice();
    console.log(`\nCurrent Gas Price: ${web3.utils.fromWei(gasPrice, 'gwei')} gwei`);

    console.log('\nMonitoring completed successfully');
    callback();
  } catch (error) {
    console.error('Error during monitoring:', error);
    callback(error);
  }
};

