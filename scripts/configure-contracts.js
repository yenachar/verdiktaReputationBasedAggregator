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

    // Configure aggregator
    console.log('Configuring aggregator...');
    await aggregator.setConfig(4, 3, 2, 300);
    console.log('Aggregator configured');

    // ---------------------------------------------------------------
    // Add sample oracle and jobID (replace with your oracle details)
    // ---------------------------------------------------------------
    const oracleAddress = "0x1f3829ca4Bce27ECbB55CAA8b0F8B51E4ba2cCF6";
    const jobId = web3.utils.fromAscii("38f19572c51041baa5f2dea284614590").padEnd(66, '0');
    const fee = web3.utils.toWei("0.1", "ether");

    console.log('Adding oracle configuration...');
    await aggregator.addOracleConfig(
        oracleAddress,
        jobId,
        fee
    );
    console.log('Oracle configuration added');

    console.log('Post-deployment configuration completed successfully');
    callback();
  } catch (error) {
    console.error('Error during post-deployment configuration:', error);
    callback(error);
  }
};
