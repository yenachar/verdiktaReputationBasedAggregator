// scripts/unregister-oracle.js
// Unregisters one or more oracle identities (address/jobID combinations)
// and reclaims the staked 100 VDKA tokens for each.
const VerdiktaToken = artifacts.require("VerdiktaToken");
const ReputationKeeper = artifacts.require("ReputationKeeper");

// Minimal ABI for calling owner() on an oracle contract.
const minimalOwnerABI = [
  {
    "constant": true,
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
];

module.exports = async function(callback) {
  try {
    console.log('Starting oracle deregistration and VDKA reclaim process...');

    // Get accounts.
    const accounts = await web3.eth.getAccounts();
    const caller = accounts[0];
    console.log('Using caller account:', caller);

    // Specify the oracle address for which to deregister.
    // (This should be the address of the oracle smart contract.)
    const oracleAddress = "0xD67D6508D4E5611cd6a463Dd0969Fa153Be91101";
    console.log('Oracle address to deregister:', oracleAddress);

    // Get the deployed ReputationKeeper contract.
    const keeper = await ReputationKeeper.deployed();

    // Retrieve the ReputationKeeper owner.
    const keeperOwner = await keeper.owner();
    console.log("ReputationKeeper owner:", keeperOwner);

    // Retrieve the oracle contract's owner using the minimal ABI.
    const oracleOwnerContract = new web3.eth.Contract(minimalOwnerABI, oracleAddress);
    const oracleOwner = await oracleOwnerContract.methods.owner().call();
    console.log("Oracle contract owner:", oracleOwner);

    // Check if the caller is authorized: either the keeper owner or the oracle owner.
    if (
      caller.toLowerCase() !== keeperOwner.toLowerCase() &&
      caller.toLowerCase() !== oracleOwner.toLowerCase()
    ) {
      console.error("Error: The caller account is not authorized to unregister this oracle. It must be either the ReputationKeeper owner or the oracle contract owner.");
      return callback(new Error("Not authorized"));
    }

    // Define the list of job ID strings to deregister.
    const jobIdStrings = [
      "38f19572c51041baa5f2dea284614590",
      "39515f75ac2947beb7f2eeae4d8eaf3e"
      // Add additional jobId strings as needed.
    ];

    // Get deployed VerdiktaToken contract.
    const verdikta = await VerdiktaToken.deployed();

    // Check the caller's initial VDKA balance.
    const initialBalance = await verdikta.balanceOf(caller);
    console.log('Initial VDKA balance:', initialBalance.toString());

    // Loop over each job ID and deregister if the registration is active.
    for (let i = 0; i < jobIdStrings.length; i++) {
      const currentJobIdString = jobIdStrings[i];
      // Convert the job ID string to a bytes32 value.
      const jobId = web3.utils.fromAscii(currentJobIdString);
      console.log(`\nProcessing jobID ${currentJobIdString} (bytes32: ${jobId})`);

      // Retrieve registration info.
      const oracleInfo = await keeper.getOracleInfo(oracleAddress, jobId);
      console.log(`Oracle registration status for jobID ${currentJobIdString}:`, {
        isActive: oracleInfo.isActive,
        qualityScore: oracleInfo.qualityScore.toString(),
        timelinessScore: oracleInfo.timelinessScore.toString(),
        jobId: web3.utils.hexToAscii(oracleInfo.jobId),
        fee: oracleInfo.fee.toString()
      });

      if (!oracleInfo.isActive) {
        console.log(`Oracle for jobID ${currentJobIdString} is not registered. Skipping...`);
        continue;
      }

      // Call deregisterOracle with the oracle address and jobId.
      console.log(`Deregistering oracle for jobID ${currentJobIdString}...`);
      const tx = await keeper.deregisterOracle(oracleAddress, jobId, { from: caller });
      console.log(`Deregister transaction for jobID ${currentJobIdString} hash:`, tx.tx);
    }

    // Check the caller's final VDKA balance after reclaiming the stake(s).
    const finalBalance = await verdikta.balanceOf(caller);
    console.log('Final VDKA balance:', finalBalance.toString());

    console.log('Oracle deregistration and VDKA reclaim completed successfully.');
    callback();
  } catch (error) {
    console.error('Error during oracle deregistration:', error);
    callback(error);
  }
};

