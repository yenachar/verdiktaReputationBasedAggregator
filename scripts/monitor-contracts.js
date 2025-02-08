// scripts/monitor-contracts.js

const VerdiktaToken = artifacts.require("VerdiktaToken");
const ReputationKeeper = artifacts.require("ReputationKeeper");
const ReputationAggregator = artifacts.require("ReputationAggregator");

module.exports = async function(callback) {
  try {
    console.log('Starting contract monitoring...\n');
    
    // Get deployed contracts
    const verdikta = await VerdiktaToken.deployed();
    const keeper = await ReputationKeeper.deployed();
    const aggregator = await ReputationAggregator.deployed();

    // Get deployment information
    console.log('\n=== Deployment Information ===');
    try {
        if (aggregator.transactionHash && typeof aggregator.transactionHash === 'string') {
            const deployedBlock = await web3.eth.getTransactionReceipt(aggregator.transactionHash);
            if (deployedBlock) {
                console.log(`Deployed at block: ${deployedBlock.blockNumber}`);
                console.log(`Deployment transaction: ${aggregator.transactionHash}`);
            }
        } else {
            console.log('Deployment transaction information not available');
        }
    } catch (error) {
        console.log('Could not fetch deployment information:', error.message);
    }
    
    // Check network
    const networkId = await web3.eth.net.getId();
    const networkType = await web3.eth.net.getNetworkType();
    console.log(`\nNetwork: ${networkType} (ID: ${networkId})`);
    
    console.log('\n=== VerdiktaToken Information ===');
    const tokenName = await verdikta.name();
    const tokenSymbol = await verdikta.symbol();
    const totalSupply = await verdikta.totalSupply();
    const tokenBalance = await web3.eth.getBalance(verdikta.address);
    console.log(`Address: ${verdikta.address}`);
    console.log(`Name: ${tokenName}`);
    console.log(`Symbol: ${tokenSymbol}`);
    console.log(`Total Supply: ${web3.utils.fromWei(totalSupply, 'ether')} tokens`);
    console.log(`Contract Balance: ${web3.utils.fromWei(tokenBalance, 'ether')} ETH`);
    
    console.log('\n=== ReputationKeeper Information ===');
    const keeperBalance = await web3.eth.getBalance(keeper.address);
    const keeperOwner = await keeper.owner();
    console.log(`Address: ${keeper.address}`);
    console.log(`Contract Balance: ${web3.utils.fromWei(keeperBalance, 'ether')} ETH`);
    console.log(`Owner: ${keeperOwner}`);
   
// set address explicitly for checking
const oracleAddress = "0x1f3829ca4Bce27ECbB55CAA8b0F8B51E4ba2cCF6";
console.log(`\n=== Oracle Status for ${oracleAddress} ===`);

// Call the getOracleInfo method on the keeper contract.
// The function returns: isActive, score, stakeAmount, jobId, fee.
const oracleInfo = await keeper.getOracleInfo(oracleAddress);

// The returned object properties depend on your web3 version and contract ABI,
// but typically you can access them like this:
console.log(`Active: ${oracleInfo.isActive}`);
console.log(`Quality Score: ${oracleInfo.qualityScore.toString()}`);
console.log(`Timeliness Score: ${oracleInfo.timelinessScore.toString()}`);
console.log(`Job ID: ${oracleInfo.jobId}`);
console.log(`Fee: ${oracleInfo.fee.toString()}`);

    console.log('\n=== ReputationAggregator Information ===');
    const aggBalance = await web3.eth.getBalance(aggregator.address);
    const aggOwner = await aggregator.owner();


    // Get LINK balance
    try {
        const contractConfig = await aggregator.getContractConfig();
        const linkTokenAddress = contractConfig.linkAddr;
        const LinkToken = new web3.eth.Contract([
            {
                "constant": true,
                "inputs": [{"name": "owner", "type": "address"}],
                "name": "balanceOf",
                "outputs": [{"name": "", "type": "uint256"}],
                "type": "function"
            }
        ], linkTokenAddress);
        
        const linkBalance = await LinkToken.methods.balanceOf(aggregator.address).call();
        console.log(`LINK Balance: ${web3.utils.fromWei(linkBalance, 'ether')} LINK`);
    } catch (error) {
        console.log('Could not fetch LINK balance:', error.message);
    }

    
    // Get configuration parameters
    const oraclesToPoll = await aggregator.oraclesToPoll();
    const requiredResponses = await aggregator.requiredResponses();
    const clusterSize = await aggregator.clusterSize();
    const responseTimeout = await aggregator.responseTimeoutSeconds();
    
    // Get Chainlink configuration
    try {
        const contractConfig = await aggregator.getContractConfig();
        console.log('\nChainlink Configuration:');
        console.log(`Oracle Address: ${contractConfig.oracleAddr}`);
        console.log(`LINK Token: ${contractConfig.linkAddr}`);
        console.log(`Job ID: ${web3.utils.toAscii(contractConfig.jobid)}`);
        console.log(`Fee: ${web3.utils.fromWei(contractConfig.fee.toString(), 'ether')} LINK`);
    } catch (error) {
        console.log('No active oracle configuration found');
    }
    
    console.log('\nAggregator Configuration:');
    console.log(`Address: ${aggregator.address}`);
    console.log(`Contract Balance: ${web3.utils.fromWei(aggBalance, 'ether')} ETH`);
    console.log(`Owner: ${aggOwner}`);
    console.log(`Oracles to Poll: ${oraclesToPoll}`);
    console.log(`Required Responses: ${requiredResponses}`);
    console.log(`Cluster Size: ${clusterSize}`);
    console.log(`Response Timeout: ${responseTimeout.toString()} seconds`);
    
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
