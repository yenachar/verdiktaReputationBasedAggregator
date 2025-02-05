const ReputationKeeper = artifacts.require('ReputationKeeper');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// Minimal ABI for the aggregator contract
const AggregatorABI = [
  {
    "inputs": [],
    "name": "reputationKeeper",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

module.exports = async function(callback) {
  try {
    const argv = yargs(hideBin(process.argv))
      .option('aggregator', {
        alias: 'a',
        type: 'string',
        description: 'Aggregator contract address'
      })
      .help()
      .argv;

    let keeper;
    
    if (argv.aggregator) {
      console.log(`Looking up ReputationKeeper from Aggregator at: ${argv.aggregator}`);
      const aggregator = new web3.eth.Contract(AggregatorABI, argv.aggregator);
      const keeperAddress = await aggregator.methods.reputationKeeper().call();
      console.log(`Found ReputationKeeper at: ${keeperAddress}`);
      keeper = await ReputationKeeper.at(keeperAddress);
    } else {
      keeper = await ReputationKeeper.deployed();
    }
    
    console.log(`Connected to ReputationKeeper at: ${keeper.address}`);
    
    const length = await keeper.registeredOracles.length;
    console.log(`\nFound ${length} registered oracles`);
    
    if (length === 0) {
      console.log("\nNo oracles registered yet. To register an oracle, you need to:");
      console.log("1. Have the required VDKA tokens (100 VDKA)")
      console.log("2. Call registerOracle() with:")
      console.log("   - oracle address")
      console.log("   - jobId")
      console.log("   - fee")
    } else {
      for(let i = 0; i < length; i++) {
        const oracleAddress = await keeper.registeredOracles(i);
        const info = await keeper.getOracleInfo(oracleAddress);
        
        console.log(`\nOracle ${i + 1}:`);
        console.log(`Address: ${oracleAddress}`);
        console.log(`Active: ${info.isActive}`);
        console.log(`Score: ${info.score.toString()}`);
        console.log(`Stake: ${web3.utils.fromWei(info.stakeAmount.toString())} VDKA`);
      }
    }
    callback();
  } catch (error) {
    console.error(error);
    callback(error);
  }
};
