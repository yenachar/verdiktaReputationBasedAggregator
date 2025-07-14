
const WrappedVerdiktaToken = artifacts.require("WrappedVerdiktaToken");
const fs = require('fs');
const path = require('path');

// Base Standard Bridge addresses
// const L1_BRIDGE_ADDRESS = "0xfd0Bf71F60660E2f608ed56e1659C450eB113120"; // Sepolia Standard Bridge
// const L2_BRIDGE_ADDRESS = "0x4200000000000000000000000000000000000010"; // Base Sepolia

// Which L1 goes with which L2?
//   base_sepolia -> sepolia
//   base         -> mainnet
const PARTNER_L1_OF = { base_sepolia: "sepolia", base: "mainnet" };

// L1,L2 Standard Bridge proxies 
const L1_BRIDGE = {
  sepolia:  "0xfd0Bf71F60660E2f608ed56e1659C450eB113120",          // Sepolia
  mainnet:  "0x3154Cf16ccdb4C6d922629664174b904d80F2C35"           // Ethereum Mainnet
};
const L2_BRIDGE_ADDRESS = "0x4200000000000000000000000000000000000010"; // identical on every OP-Stack L2

module.exports = async function(deployer, network, accounts) {

  // Skip if flag is set for testing
  if (process.env.SKIP_MIGRATIONS) {
    console.log("Skipping migrations in 3_ because SKIP_MIGRATIONS is set.");
    return;
  }

  // Require explicit flag be set for ERC20 Token migration
  if (!process.env.MIGRATE_ERC20) {
    console.log("MIGRATE_ERC20 flag not set to '1'. Skipping ERC20 contract migration.");
    return;
  }

  console.log(`\n----- Deploying WrappedVerdiktaToken to ${network} network -----`);
  console.log(`Deployer account: ${accounts[0]}`);
  
  // Get the L1 token address from deployment file
  // let L1_TOKEN_ADDRESS;
  // Determine which L1 we’re paired with (sepolia or mainnet)
  // const l1Net = PARTNER_L1_OF[network];
  const cleanName = network.replace(/-fork$/, "");   
  const l1Net = PARTNER_L1_OF[cleanName];

  if (!l1Net) throw new Error(`Unknown partner for ${network}`);
  const L1_BRIDGE_ADDRESS = L1_BRIDGE[l1Net];

  // Fetch the canonical token address for that L1
  let L1_TOKEN_ADDRESS;
  const deploymentPath = path.join(__dirname, '../deployment-addresses.json');
  
  if (fs.existsSync(deploymentPath)) {
    const deploymentAddresses = JSON.parse(fs.readFileSync(deploymentPath));
    // Use sepolia network's address since that's where the L1 token is
    // if (deploymentAddresses['sepolia'] && deploymentAddresses['sepolia'].verdiktaTokenAddress) {
    //  L1_TOKEN_ADDRESS = deploymentAddresses['sepolia'].verdiktaTokenAddress;
    if (deploymentAddresses[l1Net]?.verdiktaTokenAddress) {
      L1_TOKEN_ADDRESS = deploymentAddresses[l1Net].verdiktaTokenAddress;
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
    L1_BRIDGE_ADDRESS
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
  
  if (!deploymentAddresses[cleanName]) {
    deploymentAddresses[cleanName] = {};
  }
  deploymentAddresses[cleanName].wrappedVerdiktaTokenAddress = wrappedToken.address;
  
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentAddresses, null, 2));
  
  console.log(`\nWrappedVerdiktaToken address saved to deployment file for ${network}`);
};

