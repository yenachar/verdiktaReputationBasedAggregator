const VerdiktaToken = artifacts.require("VerdiktaToken");
const ReputationKeeper = artifacts.require("ReputationKeeper");
const ReputationAggregator = artifacts.require("ReputationAggregator");

module.exports = async function(deployer, network) {
  // Get the already deployed VerdiktaToken and ReputationAggregator.
  const verdiktaToken = await VerdiktaToken.deployed();
  const reputationAggregator = await ReputationAggregator.deployed();

  // Deploy ReputationKeeper with the VerdiktaToken address.
  await deployer.deploy(ReputationKeeper, verdiktaToken.address);
  const reputationKeeper = await ReputationKeeper.deployed();
  console.log("ReputationKeeper deployed at:", reputationKeeper.address);

  // Update VerdiktaToken with the ReputationKeeper address.
  await verdiktaToken.setReputationKeeper(reputationKeeper.address);
  console.log("ReputationKeeper set in VerdiktaToken");

  // Approve ReputationAggregator in ReputationKeeper.
  await reputationKeeper.approveContract(reputationAggregator.address);
  console.log("ReputationAggregator approved in ReputationKeeper");

  // Connect aggregator (after deploying ReputationKeeper):
  await reputationAggregator.setReputationKeeper(reputationKeeper.address);
  console.log("ReputationAggregator updated with ReputationKeeper address");


  // If ReputationAggregator provides a setter function to update its ReputationKeeper,
  // update it now. For example:
  //
  // await reputationAggregator.setReputationKeeper(reputationKeeper.address);
  // console.log("ReputationAggregator updated with ReputationKeeper address");
};

