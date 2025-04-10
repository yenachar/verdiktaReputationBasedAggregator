
const WrappedVerdiktaToken = artifacts.require("WrappedVerdiktaToken");
const ReputationKeeper = artifacts.require("ReputationKeeper");
const ReputationAggregator = artifacts.require("ReputationAggregator");

module.exports = async function(deployer, network) {

  // Skip if flag is set for testing
  if (process.env.SKIP_MIGRATIONS) {
    console.log("Skipping migrations in 5_ because SKIP_MIGRATIONS is set.");
    return;
  }

  try {
    // Get the already deployed WrappedVerdiktaToken and ReputationAggregator
    const wrappedVerdiktaToken = await WrappedVerdiktaToken.deployed();
    console.log("Found WrappedVerdiktaToken at:", wrappedVerdiktaToken.address);
    
    const reputationAggregator = await ReputationAggregator.deployed();
    console.log("Found ReputationAggregator at:", reputationAggregator.address);
    
    // Deploy ReputationKeeper with the WrappedVerdiktaToken address
    await deployer.deploy(ReputationKeeper, wrappedVerdiktaToken.address);
    const reputationKeeper = await ReputationKeeper.deployed();
    console.log("ReputationKeeper deployed at:", reputationKeeper.address);
    
    // Approve ReputationAggregator in ReputationKeeper
    await reputationKeeper.approveContract(reputationAggregator.address);
    console.log("ReputationAggregator approved in ReputationKeeper");
    
    // Connect aggregator with the reputation keeper
    await reputationAggregator.setReputationKeeper(reputationKeeper.address);
    console.log("ReputationAggregator updated with ReputationKeeper address");
  } catch (error) {
    console.error("Error in ReputationKeeper deployment:", error.message);
    throw error;
  }
};

