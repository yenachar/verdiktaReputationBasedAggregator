const VerdiktaToken = artifacts.require("VerdiktaToken");

module.exports = async function(deployer, network) {
  await deployer.deploy(VerdiktaToken);
  const verdiktaToken = await VerdiktaToken.deployed();
  console.log("VerdiktaToken deployed at:", verdiktaToken.address);
  console.log(`On network: ${network}`);
};

