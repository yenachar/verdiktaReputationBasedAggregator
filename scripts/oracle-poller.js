// To use an aggregator contract: truffle exec scripts/oracle-poller.js --network base_sepolia -a 0xbabE69DdF8CBbe63fEDB6f49904efB35522667Af
// To use the aggregator in artifacts: truffle exec scripts/oracle-poller.js --network base_sepolia

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
    
    // Try to get registered oracles differently
    console.log("\nAttempting to get oracles directly...");

    let i = 0;
    let foundOracles = [];
    
    // Try the first few indices to see if we can find any registered oracles
    while (i < 10) {
        try {
            const oracleAddress = await keeper.registeredOracles(i);
            if (oracleAddress && oracleAddress !== '0x0000000000000000000000000000000000000000') {
                const info = await keeper.getOracleInfo(oracleAddress);
                foundOracles.push({
                    address: oracleAddress,
                    info: info
                });
            }
        } catch (error) {
            // If we get an error, we've probably hit the end of the array
            break;
        }
        i++;
    }

    if (foundOracles.length === 0) {
        console.log("\nNo oracles found.");
        console.log("To register an oracle, you need to:");
        console.log("1. Have the required VDKA tokens (100 VDKA)")
        console.log("2. Call registerOracle() with:")
        console.log("   - oracle address")
        console.log("   - jobId")
        console.log("   - fee")
    } else {
        console.log(`\nFound ${foundOracles.length} oracle(s):`);
        foundOracles.forEach((oracle, index) => {
            console.log(`\nOracle ${index + 1}:`);
            console.log(`Address: ${oracle.address}`);
            console.log(`Active: ${oracle.info.isActive}`);
            console.log(`Score: ${oracle.info.score.toString()}`);
            console.log(`Stake: ${web3.utils.fromWei(oracle.info.stakeAmount.toString(), 'ether')} VDKA`);
            console.log(`Job ID: ${oracle.info.jobId}`);
            console.log(`Fee: ${oracle.info.fee.toString()}`);
        });
    }
    
    callback();
  } catch (error) {
    console.error("Error:", error);
    callback(error);
  }
};
