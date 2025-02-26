// scripts/configure-contracts.js
const VerdiktaToken = artifacts.require("VerdiktaToken");
const ReputationKeeper = artifacts.require("ReputationKeeper");
const ReputationAggregator = artifacts.require("ReputationAggregator");

module.exports = async function(callback) {
  try {
    console.log('Starting post-deployment configuration...');

    // Get deployed contracts
    const verdikta = await VerdiktaToken.deployed();
    const keeper = await ReputationKeeper.deployed();
    const aggregator = await ReputationAggregator.deployed();

    // Log addresses
    console.log('Contract Addresses:');
    console.log('Verdikta:', verdikta.address);
    console.log('Keeper:', keeper.address);
    console.log('Aggregator:', aggregator.address);

    // Set ReputationKeeper in VerdiktaToken
    console.log('Setting ReputationKeeper in VerdiktaToken...');
    await verdikta.setReputationKeeper(keeper.address);
    console.log('ReputationKeeper set in VerdiktaToken');
	               
    // Configure aggregator
    console.log('Configuring aggregator...');
    // oraclesToPoll: 4 (poll four times)
    // requiredResponses: 3 (need three responses)
    // clusterSize: 2 (cluster size of two)
    // timeout: 300 seconds (5 minutes)
    await aggregator.setConfig(4, 3, 2, 300);
    await aggregator.setMaxFee(web3.utils.toWei('0.08', 'ether'));
    console.log('Aggregator configured');

    // Approve aggregator to use keeper
    console.log('Approving aggregator in keeper...');
    await keeper.approveContract(aggregator.address);
    console.log('Aggregator approved in keeper');

    // Transfer some VDKA tokens to the oracle address
    const oracleAddress = "0x1f3829ca4Bce27ECbB55CAA8b0F8B51E4ba2cCF6";
    const stakeAmount = web3.utils.toWei("100", "ether");
    console.log('Transferring VDKA tokens to oracle operator...');
    await verdikta.transfer(oracleAddress, stakeAmount);
    console.log('VDKA tokens transferred');

    console.log('Post-deployment configuration completed successfully');
    callback();
  } catch (error) {
    console.error('Error during post-deployment configuration:', error);
    callback(error);
  }
};
