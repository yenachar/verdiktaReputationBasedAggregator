
const ReputationAggregator = artifacts.require("ReputationAggregator");

module.exports = async function(deployer, network) {

  // Skip if flag is set for testing
  if (process.env.SKIP_MIGRATIONS) {
    console.log("Skipping migrations in 4_ because SKIP_MIGRATIONS is set.");
    return;
  }

  // Define LINK token addresses per network.
  const LINK_TOKEN_ADDRESS = {
    base: '0xd886e2286fd1073df82462ea1822119600af80b6',
    base_goerli: '0xd886e2286fd1073df82462ea1822119600af80b6',
    base_sepolia: '0xE4aB69C077896252FAFBD49EFD26B5D171A32410',
    development: '0x0000000000000000000000000000000000000000'
  };

  if (!LINK_TOKEN_ADDRESS[network]) {
    throw new Error(`No LINK token address configured for network: ${network}`);
  }

  // Use a placeholder for ReputationKeeper (to be updated later).
  const placeholderReputationKeeper = "0x0000000000000000000000000000000000000000";

  await deployer.deploy(
    ReputationAggregator,
    LINK_TOKEN_ADDRESS[network],
    placeholderReputationKeeper
  );
  const reputationAggregator = await ReputationAggregator.deployed();
  console.log("ReputationAggregator deployed at:", reputationAggregator.address);
};

