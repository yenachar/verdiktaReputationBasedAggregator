// migrations/1_initial_migration.js
const Migrations = artifacts.require("Migrations");

module.exports = function (deployer) {
  deployer.deploy(Migrations);
};

// migrations/2_deploy_contracts.js
const VerdiktaToken = artifacts.require("VerdiktaToken");
const ReputationKeeper = artifacts.require("ReputationKeeper");
const ReputationAggregator = artifacts.require("ReputationAggregator");

module.exports = async function(deployer, network) {
  // Base Mainnet LINK token address
  const LINK_TOKEN_ADDRESS = {
    'base': '0xd886e2286fd1073df82462ea1822119600af80b6',
    'base_goerli': '0xd886e2286fd1073df82462ea1822119600af80b6',
    'base_sepolia': '0xE4aB69C077896252FAFBD49EFD26B5D171A32410',
    'development': '0x0000000000000000000000000000000000000000' // Set this for local testing
  };

  // Check if we have a LINK address for this network
  if (!LINK_TOKEN_ADDRESS[network]) {
    throw new Error(`No LINK token address configured for network: ${network}`);
  }

  // 1. Deploy Verdikta Token
  await deployer.deploy(VerdiktaToken);
  const verdiktaToken = await VerdiktaToken.deployed();
  console.log('VerdiktaToken deployed at:', verdiktaToken.address);

  // 2. Deploy Reputation Keeper with Verdikta Token address
  await deployer.deploy(ReputationKeeper, verdiktaToken.address);
  const reputationKeeper = await ReputationKeeper.deployed();
  console.log('ReputationKeeper deployed at:', reputationKeeper.address);

  // 3. Set Reputation Keeper address in Verdikta Token
  await verdiktaToken.setReputationKeeper(reputationKeeper.address);
  console.log('ReputationKeeper set in VerdiktaToken');

  // 4. Deploy Reputation Aggregator
  await deployer.deploy(
    ReputationAggregator,
    LINK_TOKEN_ADDRESS[network],
    reputationKeeper.address
  );
  const reputationAggregator = await ReputationAggregator.deployed();
  console.log('ReputationAggregator deployed at:', reputationAggregator.address);

  // 5. Approve Reputation Aggregator in Reputation Keeper
  await reputationKeeper.approveContract(reputationAggregator.address);
  console.log('ReputationAggregator approved in ReputationKeeper');
};
