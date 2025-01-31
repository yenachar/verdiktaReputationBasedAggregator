// scripts/register-oracle.js
const VerdiktaToken = artifacts.require("VerdiktaToken");
const ReputationKeeper = artifacts.require("ReputationKeeper");

module.exports = async function(callback) {
  try {
    console.log('Starting oracle registration...');

    // Get deployed contract instances directly
    const verdikta = await VerdiktaToken.deployed();
    const keeper = await ReputationKeeper.deployed();

    // Log addresses for verification
    console.log('Using contracts:');
    console.log('VerdiktaToken:', verdikta.address);
    console.log('ReputationKeeper:', keeper.address);

    // Replace this with your oracle address
    const oracleAddress = "0x1f3829ca4Bce27ECbB55CAA8b0F8B51E4ba2cCF6";
    
    // Approve keeper to spend VDKA
    console.log('Approving VDKA spend...');
    await verdikta.approve(keeper.address, web3.utils.toWei("100", "ether"));
    console.log('VDKA spend approved');
    
    // Register oracle
    console.log('Registering oracle...');
    await keeper.registerOracle(oracleAddress);
    console.log('Oracle registered successfully');
    
    callback();
  } catch (error) {
    console.error('Error during oracle registration:', error);
    callback(error);
  }
};
