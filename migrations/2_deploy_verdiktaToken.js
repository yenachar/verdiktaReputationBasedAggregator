
const VerdiktaToken = artifacts.require("VerdiktaToken");
const fs = require('fs');
const path = require('path');

module.exports = async function(deployer, network) {

  // Skip if flag is set for testing
  if (process.env.SKIP_MIGRATIONS) {
    console.log("Skipping migrations in 2_ because SKIP_MIGRATIONS is set.");
    return;
  }

  // Require explicit flag be set for ERC20 Token migration
  if (!process.env.MIGRATE_ERC20) {
    console.log("MIGRATE_ERC20 flag not set to '1'. Skipping ERC20 contract migration.");
    return;
  }

  await deployer.deploy(VerdiktaToken);
  const verdiktaToken = await VerdiktaToken.deployed();
  console.log("VerdiktaToken deployed at:", verdiktaToken.address);
  console.log(`On network: ${network}`);
  const cleanName = network.replace(/-fork$/, "");
  
  // Save the address to a JSON file
  const deploymentPath = path.join(__dirname, '../deployment-addresses.json');
  let deploymentAddresses = {};
  
  // Read existing file if it exists
  if (fs.existsSync(deploymentPath)) {
    const data = fs.readFileSync(deploymentPath);
    deploymentAddresses = JSON.parse(data);
  }
  
  // Update with new address
  if (!deploymentAddresses[cleanName]) {
    deploymentAddresses[cleanName] = {};
  }
  deploymentAddresses[cleanName].verdiktaTokenAddress = verdiktaToken.address;
  
  // Write back to file
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentAddresses, null, 2));
};

