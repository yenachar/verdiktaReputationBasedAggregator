const VerdiktaToken = artifacts.require("VerdiktaToken");
const WrappedVerdiktaToken = artifacts.require("WrappedVerdiktaToken");
const Web3 = require('web3');
require('dotenv').config();

// Base Standard Bridge addresses
const L1_BRIDGE_ADDRESS = "0x8E5e40F8F9103168c7D7cF361C6C0FCBcB8B9b2b"; // Sepolia to Base Sepolia

// Standard Bridge ABI for depositERC20
const L1_BRIDGE_ABI = [
  {
    "inputs": [
      { "name": "_l1Token", "type": "address" },
      { "name": "_l2Token", "type": "address" },
      { "name": "_amount", "type": "uint256" },
      { "name": "_minGasLimit", "type": "uint32" },
      { "name": "_extraData", "type": "bytes" }
    ],
    "name": "depositERC20",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  }
];

module.exports = async function(callback) {
  try {
    const accounts = await web3.eth.getAccounts();
    const sender = accounts[0];
    
    // Get addresses from env
    const L1_TOKEN_ADDRESS = process.env.L1_TOKEN_ADDRESS;
    const L2_TOKEN_ADDRESS = process.env.L2_TOKEN_ADDRESS;
    const AMOUNT = process.env.AMOUNT || "100"; // Default to 100 tokens
    
    if (!L1_TOKEN_ADDRESS || !L2_TOKEN_ADDRESS) {
      console.error("Please set L1_TOKEN_ADDRESS and L2_TOKEN_ADDRESS in your environment variables");
      return callback(new Error("Missing environment variables"));
    }
    
    // Parse amount with 18 decimals
    const amount = web3.utils.toWei(AMOUNT, 'ether');
    
    console.log(`Bridging ${AMOUNT} tokens from Sepolia to Base Sepolia...`);
    console.log(`L1 Token: ${L1_TOKEN_ADDRESS}`);
    console.log(`L2 Token: ${L2_TOKEN_ADDRESS}`);
    console.log(`Amount: ${amount}`);
    console.log(`From account: ${sender}`);
    
    // Get the token contract instance
    const tokenContract = await VerdiktaToken.at(L1_TOKEN_ADDRESS);
    
    // Create bridge contract instance
    const bridge = new web3.eth.Contract(L1_BRIDGE_ABI, L1_BRIDGE_ADDRESS);
    
    // First, approve tokens to the bridge
    console.log("Approving tokens to the bridge...");
    const approveTx = await tokenContract.approve(L1_BRIDGE_ADDRESS, amount, { from: sender });
    console.log(`Tokens approved. Tx hash: ${approveTx.tx}`);
    
    // Parameters for bridging
    const minGasLimit = 200000; // Default minimum gas limit
    const extraData = "0x"; // No extra data needed
    
    // Bridge the tokens
    console.log("Depositing tokens to the bridge...");
    
    // Estimate gas price
    const gasPrice = await web3.eth.getGasPrice();
    
    // Execute the bridge transaction
    const bridgeTx = await bridge.methods.depositERC20(
      L1_TOKEN_ADDRESS,
      L2_TOKEN_ADDRESS,
      amount,
      minGasLimit,
      extraData
    ).send({ 
      from: sender,
      value: web3.utils.toWei('0.01', 'ether'), // ETH for L2 gas
      gas: 300000, // Gas limit
      gasPrice
    });
    
    console.log(`Bridge transaction submitted. Tx hash: ${bridgeTx.transactionHash}`);
    console.log("Tokens are being bridged to Base Sepolia. This may take several minutes.");
    
    callback();
  } catch (error) {
    console.error("Error:", error);
    callback(error);
  }
};

