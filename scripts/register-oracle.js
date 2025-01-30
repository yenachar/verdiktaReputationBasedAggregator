// scripts/register-oracle.js
const VerdiktaToken = artifacts.require("VerdiktaToken");
const ReputationKeeper = artifacts.require("ReputationKeeper");

module.exports = async function(callback) {
  try {
    console.log('Starting oracle registration...');

    // Contract addresses - replace with your deployed addresses
    const verdiktaAddress = "YOUR_VERDIKTA_ADDRESS";
    const keeperAddress = "YOUR_KEEPER_ADDRESS";
    const oracleAddress = "YOUR_ORACLE_ADDRESS";

    // Get contract instances
    const verdikta = await VerdiktaToken.at(verdiktaAddress);
    const keeper = await ReputationKeeper.at(keeperAddress);

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
