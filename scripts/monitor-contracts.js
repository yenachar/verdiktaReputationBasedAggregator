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
 
    // Check network
    const networkId = await web3.eth.net.getId();
    const networkType = await web3.eth.net.getNetworkType();
    console.log(`Network: ${networkType} (ID: ${networkId})`);
    
    console.log('\n=== WrappedVerdiktaToken Information ===');
    const tokenName = await verdikta.name();
    const tokenSymbol = await verdikta.symbol();
    const totalSupply = await verdikta.totalSupply();
    const tokenBalance = await web3.eth.getBalance(verdikta.address);
    console.log(`Address: ${verdikta.address}`);
    console.log(`Name: ${tokenName}`);
    console.log(`Symbol: ${tokenSymbol}`);
    console.log(`Supply: ${web3.utils.fromWei(totalSupply, 'ether')} tokens`);
    
    console.log('\n=== ReputationKeeper Information ===');
    const keeperBalance = await web3.eth.getBalance(keeper.address);
    const keeperOwner = await keeper.owner();
    console.log(`Address: ${keeper.address}`);
    console.log(`Owner: ${keeperOwner}`);
   
    // Specify the oracle address and the corresponding job ID.
    // const oracleAddress = "0x69b601fC8263E9c55674E5973837062706608DF3";
    const oracleAddress = "0xD67D6508D4E5611cd6a463Dd0969Fa153Be91101";
    console.log(`\n=== Oracle Status for ${oracleAddress} ===`);

    // Define the job ID (using the same job ID as registration)
    const jobIdString = "38f19572c51041baa5f2dea284614590";
    const jobId = web3.utils.fromAscii(jobIdString);

    // Call the getOracleInfo method on the keeper contract with both parameters.
    const oracleInfo = await keeper.getOracleInfo(oracleAddress, jobId);

    // Log the returned oracle information.
    console.log(`Active: ${oracleInfo.isActive}`);
    console.log(`Quality/Timeliness Scores: ${oracleInfo.qualityScore.toString()}, ${oracleInfo.timelinessScore.toString()}`);
    console.log(`Job ID: ${oracleInfo.jobId}`); // jobId is bytes32; convert if needed
    console.log(`Fee: ${oracleInfo.fee.toString()}`);

    console.log('\n=== ReputationAggregator Information ===');
    const aggBalance = await web3.eth.getBalance(aggregator.address);
    const aggOwner = await aggregator.owner();

    // Get configuration parameters
    const oraclesToPoll = await aggregator.oraclesToPoll();
    const requiredResponses = await aggregator.requiredResponses();
    const clusterSize = await aggregator.clusterSize();
    const responseTimeout = await aggregator.responseTimeoutSeconds();
    
    // Get Chainlink configuration
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
    console.log(`Max Fee: ${web3.utils.fromWei((await aggregator.maxFee()).toString(), 'ether')} LINK`);

    // Get recent events
    const fromBlock = await web3.eth.getBlockNumber() - 1000; // Last 1000 blocks
    const events = await aggregator.getPastEvents('allEvents', {
      fromBlock: fromBlock,
      toBlock: 'latest'
    });
    
    console.log('\nRecent Events:');
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

