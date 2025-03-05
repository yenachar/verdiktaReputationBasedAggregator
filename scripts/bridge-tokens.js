// scripts/bridge-tokens.js
const VerdiktaToken = artifacts.require("VerdiktaToken");
const fs = require('fs');
const path = require('path');

// Base Standard Bridge on Sepolia
// const L1_BRIDGE_ADDRESS = "0x8E5E40f8f9103168C7d7CF361C6C0fcBCB8b9b2b";
const L1_BRIDGE_ADDRESS = "0xfd0Bf71F60660E2f608ed56e1659C450eB113120"; // Sepolia Standard

// Bridge Interface
const BRIDGE_ABI = [
  {
    "inputs": [
      {"internalType": "address", "name": "_l1Token", "type": "address"},
      {"internalType": "address", "name": "_l2Token", "type": "address"},
      {"internalType": "uint256", "name": "_amount", "type": "uint256"},
      {"internalType": "uint32", "name": "_minGasLimit", "type": "uint32"},
      {"internalType": "bytes", "name": "_extraData", "type": "bytes"}
    ],
    "name": "depositERC20",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  }
];

module.exports = async function(callback) {
  try {
    console.log('Starting token bridging process...');
    
    // Get accounts
    const accounts = await web3.eth.getAccounts();
    const deployer = accounts[0];
    console.log('Using account:', deployer);
    
    // This script should be run on Sepolia network
    const networkId = await web3.eth.net.getId();
    console.log('Current network ID:', networkId);
    if (networkId !== 11155111) { // Sepolia network ID
      throw new Error("This script must be run on Sepolia network");
    }
    
    // Read deployment addresses from file
    const deploymentPath = path.join(__dirname, '../deployment-addresses.json');
    if (!fs.existsSync(deploymentPath)) {
      throw new Error("deployment-addresses.json file not found");
    }
    
    const deploymentAddresses = JSON.parse(fs.readFileSync(deploymentPath));
    
    // Get token addresses
    const L1_TOKEN_ADDRESS = deploymentAddresses.sepolia.verdiktaTokenAddress;
    const L2_TOKEN_ADDRESS = deploymentAddresses.base_sepolia.wrappedVerdiktaTokenAddress;
    
    if (!L1_TOKEN_ADDRESS) {
      throw new Error("VerdiktaToken address not found in deployment file");
    }
    
    if (!L2_TOKEN_ADDRESS) {
      throw new Error("WrappedVerdiktaToken address not found in deployment file");
    }
    
    console.log('Using VerdiktaToken address:', L1_TOKEN_ADDRESS);
    console.log('Using WrappedVerdiktaToken address:', L2_TOKEN_ADDRESS);
    
    // Get the VerdiktaToken on Sepolia using its address directly
    const verdiktaToken = await VerdiktaToken.at(L1_TOKEN_ADDRESS);
    
    // Check balance first
    const balance = await verdiktaToken.balanceOf(deployer);
    console.log('Your VDKA balance:', web3.utils.fromWei(balance, 'ether'));
    
    // Amount to bridge (e.g., 100 VDKA)
    const amountToBridge = web3.utils.toWei("100", "ether");
    console.log(`Bridging ${web3.utils.fromWei(amountToBridge)} VDKA tokens...`);
    
    // Verify sufficient balance
    if (web3.utils.toBN(balance).lt(web3.utils.toBN(amountToBridge))) {
      throw new Error(`Insufficient balance. You have ${web3.utils.fromWei(balance, 'ether')} VDKA but trying to bridge ${web3.utils.fromWei(amountToBridge, 'ether')} VDKA`);
    }
    
    // Check ETH balance for gas
    const ethBalance = await web3.eth.getBalance(deployer);
    console.log('Your ETH balance:', web3.utils.fromWei(ethBalance, 'ether'));
    
    // Bridge instance
    const bridge = new web3.eth.Contract(BRIDGE_ABI, L1_BRIDGE_ADDRESS);
    
    // First, check current allowance
    const currentAllowance = await verdiktaToken.allowance(deployer, L1_BRIDGE_ADDRESS);
    console.log('Current bridge allowance:', web3.utils.fromWei(currentAllowance, 'ether'));
    
    // Approve the bridge to spend tokens if needed
    if (web3.utils.toBN(currentAllowance).lt(web3.utils.toBN(amountToBridge))) {
      console.log('Approving bridge to spend tokens...');
      const approvalTx = await verdiktaToken.approve(L1_BRIDGE_ADDRESS, amountToBridge);
      console.log('Approval transaction hash:', approvalTx.tx);
      console.log('Approval gas used:', approvalTx.receipt.gasUsed);
      
      // Verify new allowance
      const newAllowance = await verdiktaToken.allowance(deployer, L1_BRIDGE_ADDRESS);
      console.log('New bridge allowance:', web3.utils.fromWei(newAllowance, 'ether'));
    } else {
      console.log('Bridge already has sufficient allowance');
    }
    
    // Bridge parameters
    const minGasLimit = 800000; // Minimum gas for the L2 execution
    const extraData = "0x"; // No extra data needed
    
    console.log('Preparing bridge transaction with parameters:');
    console.log('- L1 Token:', L1_TOKEN_ADDRESS);
    console.log('- L2 Token:', L2_TOKEN_ADDRESS);
    console.log('- Amount:', web3.utils.fromWei(amountToBridge, 'ether'));
    console.log('- Min Gas Limit:', minGasLimit);
    
    try {
      // Estimate gas needed
      console.log('Estimating gas...');
      const gasEstimate = await bridge.methods.depositERC20(
        L1_TOKEN_ADDRESS,
        L2_TOKEN_ADDRESS,
        amountToBridge,
        minGasLimit,
        extraData
      ).estimateGas({ from: deployer });
      
      console.log(`Estimated gas for bridging: ${gasEstimate}`);
      
      // Execute the bridge transaction
      console.log('Executing bridge transaction...');
      const bridgeTx = await bridge.methods.depositERC20(
        L1_TOKEN_ADDRESS,
        L2_TOKEN_ADDRESS,
        amountToBridge,
        minGasLimit,
        extraData
      ).send({ 
        from: deployer,
        gas: Math.floor(gasEstimate * 1.2) // Add 20% buffer
      });
      
      console.log('Bridge transaction successful!');
      console.log('Transaction hash:', bridgeTx.transactionHash);
      console.log('Gas used:', bridgeTx.gasUsed);
      
      // Check balance after bridging
      const newBalance = await verdiktaToken.balanceOf(deployer);
      console.log('Your VDKA balance after bridging:', web3.utils.fromWei(newBalance, 'ether'));
      
      console.log('Tokens sent to bridge! They should arrive on Base Sepolia soon.');
      console.log('Note: This process can take several minutes to complete.');
    } catch (txError) {
      console.error('Bridge transaction failed:', txError.message);
      if (txError.reason) {
        console.error('Reason:', txError.reason);
      }
      // Try to get more info if available
      if (txError.receipt) {
        console.error('Transaction receipt:', txError.receipt);
      }
    }
    
    callback();
  } catch (error) {
    console.error('Error during token bridging:', error);
    callback(error);
  }
};

