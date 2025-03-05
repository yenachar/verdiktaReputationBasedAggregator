const WrappedVerdiktaToken = artifacts.require("WrappedVerdiktaToken");
const fs = require('fs');
const path = require('path');

// Base Standard Bridge addresses
// const L1_BRIDGE_ADDRESS = "0x8E5E40f8f9103168C7d7CF361C6C0fcBCB8b9b2b"; // Sepolia to Base Sepolia
const L1_BRIDGE_ADDRESS = "0xfd0Bf71F60660E2f608ed56e1659C450eB113120"; // Sepolia Standard Bridge
const L2_BRIDGE_ADDRESS = "0x4200000000000000000000000000000000000010"; // Base Sepolia

module.exports = async function(deployer, network, accounts) {
  console.log(`\n----- Deploying WrappedVerdiktaToken to ${network} network -----`);
  console.log(`Deployer account: ${accounts[0]}`);
  
  // Get the L1 token address from deployment file
  let L1_TOKEN_ADDRESS;
  const deploymentPath = path.join(__dirname, '../deployment-addresses.json');
  
  if (fs.existsSync(deploymentPath)) {
    const deploymentAddresses = JSON.parse(fs.readFileSync(deploymentPath));
    // Use sepolia network's address since that's where the L1 token is
    if (deploymentAddresses['sepolia'] && deploymentAddresses['sepolia'].verdiktaTokenAddress) {
      L1_TOKEN_ADDRESS = deploymentAddresses['sepolia'].verdiktaTokenAddress;
    }
  }
  
  if (!L1_TOKEN_ADDRESS) {
    console.error("ERROR: Could not find VerdiktaToken address in deployment file");
    // Using return instead of process.exit to allow other migrations to continue
    return;
  }
  
  console.log(`Using L1 Token: ${L1_TOKEN_ADDRESS}`);
  console.log(`Using L1 Bridge: ${L1_BRIDGE_ADDRESS}`);
  console.log(`Using L2 Bridge: ${L2_BRIDGE_ADDRESS}`);
  
  // Deploy WrappedVerdiktaToken
  await deployer.deploy(
    WrappedVerdiktaToken,
    L1_TOKEN_ADDRESS,
    L1_BRIDGE_ADDRESS,
    L2_BRIDGE_ADDRESS
  );
  const wrappedToken = await WrappedVerdiktaToken.deployed();
  
  console.log(`\nWrappedVerdiktaToken successfully deployed at: ${wrappedToken.address}`);
  console.log(`Network: ${network}`);
  console.log(`Transaction hash: ${wrappedToken.transactionHash}`);
  console.log(`----- Deployment complete -----\n`);
  
  // Save the address to the deployment file
  let deploymentAddresses = {};
  if (fs.existsSync(deploymentPath)) {
    deploymentAddresses = JSON.parse(fs.readFileSync(deploymentPath));
  }
  
  if (!deploymentAddresses[network]) {
    deploymentAddresses[network] = {};
  }
  deploymentAddresses[network].wrappedVerdiktaTokenAddress = wrappedToken.address;
  
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentAddresses, null, 2));
  
  console.log(`\nWrappedVerdiktaToken address saved to deployment file for ${network}`);
};

