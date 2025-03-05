// scripts/configure-contracts-base.js
const WrappedVerdiktaToken = artifacts.require("WrappedVerdiktaToken");
const ReputationKeeper = artifacts.require("ReputationKeeper");
const ReputationAggregator = artifacts.require("ReputationAggregator");

module.exports = async function(callback) {
  try {
    console.log('Starting post-deployment configuration for Base Sepolia...');
    
    // Get deployed contracts on Base Sepolia
    const wrappedToken = await WrappedVerdiktaToken.deployed();
    const keeper = await ReputationKeeper.deployed();
    const aggregator = await ReputationAggregator.deployed();
    
    // Log addresses
    console.log('Contract Addresses:');
    console.log('WrappedVerdiktaToken:', wrappedToken.address);
    console.log('Keeper:', keeper.address);
    console.log('Aggregator:', aggregator.address);
    
    // Set the token in the ReputationKeeper
    console.log('Setting WrappedVerdiktaToken in ReputationKeeper...');
    await keeper.setVerdiktaToken(wrappedToken.address);
    console.log('Token address set in ReputationKeeper');
    
    // Configure aggregator
    console.log('Configuring aggregator...');
    await aggregator.setConfig(4, 3, 2, 300);
    await aggregator.setMaxFee(web3.utils.toWei('0.08', 'ether'));
    console.log('Aggregator configured');
    
    // Approve aggregator to use keeper
    console.log('Approving aggregator in keeper...');
    await keeper.approveContract(aggregator.address);
    console.log('Aggregator approved in keeper');
    
    // Note: For token transfers, you'll need to mint or bridge tokens first
    // The wrappedToken doesn't have the same supply as the original
    
    console.log('Post-deployment configuration completed successfully');
    callback();
  } catch (error) {
    console.error('Error during post-deployment configuration:', error);
    callback(error);
  }
};

