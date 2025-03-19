// scripts/monitor-contracts.js

const WrappedVerdiktaToken = artifacts.require("WrappedVerdiktaToken");
const ReputationKeeper = artifacts.require("ReputationKeeper");
const ReputationAggregator = artifacts.require("ReputationAggregator");

module.exports = async function(callback) {
  try {
    console.log('Starting contract monitoring...\n');
    
    // Get deployed contracts
    const verdikta = await WrappedVerdiktaToken.deployed();
    const keeper = await ReputationKeeper.deployed();
    const aggregator = await ReputationAggregator.deployed();

    // Get deployment information
    console.log('\n=== Deployment Information ===');
    const networkId = await web3.eth.net.getId();
    const networkType = await web3.eth.net.getNetworkType();
    console.log(`Network: ${networkType} (ID: ${networkId})`);
    
    console.log('\n=== WrappedVerdiktaToken Information ===');
    const tokenName = await verdikta.name();
    const tokenSymbol = await verdikta.symbol();
    const totalSupply = await verdikta.totalSupply();
    console.log(`Address: ${verdikta.address}`);
    console.log(`Name: ${tokenName}`);
    console.log(`Symbol: ${tokenSymbol}`);
    console.log(`Supply: ${web3.utils.fromWei(totalSupply, 'ether')} tokens`);
    
    console.log('\n=== ReputationKeeper Information ===');
    const keeperBalance = await web3.eth.getBalance(keeper.address);
    const keeperOwner = await keeper.owner();
    console.log(`Address: ${keeper.address}`);
    console.log(`Owner: ${keeperOwner}`);

    // Instead of hard-coding oracle addresses and job IDs, retrieve them from OracleRegistered events.
    console.log('\n=== Registered Oracles Information ===');

    // Fetch OracleRegistered events from the beginning of time until the latest block.
    const registeredEvents = await keeper.getPastEvents('OracleRegistered', {
      fromBlock: 0,
      toBlock: 'latest'
    });

    // Use a map to store unique oracle/jobID pairs (in case an oracle is registered multiple times).
    const uniqueOracles = new Map();
    for (const event of registeredEvents) {
      const oracle = event.returnValues.oracle;
      const jobId = event.returnValues.jobId; // bytes32 as a hex string
      const fee = event.returnValues.fee;
      const key = `${oracle}-${jobId}`;
      if (!uniqueOracles.has(key)) {
        uniqueOracles.set(key, { oracle, jobId, fee });
      }
    }

    if (uniqueOracles.size === 0) {
      console.log("No registered oracles found");
    } else {
      console.log("Registered oracles found. Active ones:");
      for (const [key, oracleEntry] of uniqueOracles.entries()) {
        const oracleInfo = await keeper.getOracleInfo(oracleEntry.oracle, oracleEntry.jobId);
	if(oracleInfo.isActive)
	{
        console.log(`\nOracle Address: ${oracleEntry.oracle}`);
        console.log(`Job ID (raw bytes32): ${oracleEntry.jobId}`);
        console.log(`Quality,Timeliness Scores: ${oracleInfo.qualityScore.toString()},${oracleInfo.timelinessScore.toString()}`);
        //console.log(`Call Count: ${oracleInfo.callCount.toString()}`);
        //console.log(`Locked Until: ${oracleInfo.lockedUntil.toString()}`);
        //console.log(`Blocked: ${oracleInfo.blocked}`);
	}
      }
    }

    console.log('\n=== ReputationAggregator Information ===');
    const aggBalance = await web3.eth.getBalance(aggregator.address);
    const aggOwner = await aggregator.owner();

    // Get configuration parameters (using appropriate aggregator methods)
    const oraclesToPoll = await aggregator.oraclesToPoll();
    const requiredResponses = await aggregator.requiredResponses();
    const clusterSize = await aggregator.clusterSize();
    const responseTimeout = await aggregator.responseTimeoutSeconds();
    
    // Get Chainlink configuration if available
    try {
      const contractConfig = await aggregator.getContractConfig();
      console.log(`Aggregator's LINK Token: ${contractConfig.linkAddr}`);
    } catch (error) {
      console.log('No active configuration for LINK Token address found');
    }
    
    console.log('\nAggregator Configuration:');
    console.log(`Address: ${aggregator.address}`);
    console.log(`Owner: ${aggOwner}`);
    console.log(`Oracles to Poll: ${oraclesToPoll}`);
    console.log(`Required Responses: ${requiredResponses}`);
    console.log(`Cluster Size: ${clusterSize}`);
    console.log(`Response Timeout: ${responseTimeout.toString()} seconds`);
    console.log(`Max Fee: ${web3.utils.fromWei((await aggregator.maxOracleFee()).toString(), 'ether')} LINK`);

    // Get recent events from the aggregator contract
    const fromBlock = await web3.eth.getBlockNumber() - 1000; // Last 1000 blocks
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
    
    // Get latest gas prices
    const gasPrice = await web3.eth.getGasPrice();
    console.log(`\nCurrent Gas Price: ${web3.utils.fromWei(gasPrice, 'gwei')} gwei`);
    
    console.log('\nMonitoring completed successfully');
    callback();
  } catch (error) {
    console.error('Error during monitoring:', error);
    callback(error);
  }
};

