const VerdiktaToken = artifacts.require("VerdiktaToken");
const fs = require('fs');
const path = require('path');

module.exports = async function(deployer, network) {
  await deployer.deploy(VerdiktaToken);
  const verdiktaToken = await VerdiktaToken.deployed();
  console.log("VerdiktaToken deployed at:", verdiktaToken.address);
  console.log(`On network: ${network}`);
  
  // Save the address to a JSON file
  const deploymentPath = path.join(__dirname, '../deployment-addresses.json');
  let deploymentAddresses = {};
  
  // Read existing file if it exists
  if (fs.existsSync(deploymentPath)) {
    const data = fs.readFileSync(deploymentPath);
    deploymentAddresses = JSON.parse(data);
  }
  
  // Update with new address
  if (!deploymentAddresses[network]) {
    deploymentAddresses[network] = {};
  }
  deploymentAddresses[network].verdiktaTokenAddress = verdiktaToken.address;
  
  // Write back to file
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentAddresses, null, 2));
};

