// scripts/register-oracle-cl.js
// Registers one or more jobs associated with a single oracle address,
// using user-supplied contract addresses and minimal ABIs.
//
// Usage example:
// truffle exec scripts/register-oracle-cl.js \
//   --aggregator 0xAggregatorAddress \
//   --link 0xLinkTokenAddress \
//   --oracle 0xOracleAddress \
//   --wrappedverdikta 0xWrappedVerdiktaTokenAddress \
//   --jobids "jobid1" "jobid2" \
//   --classes class1 class2 --network your_network
//
// Example registering two jobIDs each with two classes:
// truffle exec scripts/register-oracle-cl.js -a 0x59067815e006e245449E1A24a1091dF176b3CF09 \
//   -l 0xE4aB69C077896252FAFBD49EFD26B5D171A32410 \
//   -w 0x6bF578606493b03026473F838bCD3e3b5bBa5515 \
//   -o 0xD67D6508D4E5611cd6a463Dd0969Fa153Be91101 \
//   --jobids "38f19572c51041baa5f2dea284614590" "39515f75ac2947beb7f2eeae4d8eaf3e" \
//   --classes 128 129 --network base_sepolia

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

//
// Minimal ABIs
//

// Aggregator: must supply reputationKeeper() and getContractConfig()
const AggregatorABI = [
  {
    "inputs": [],
    "name": "reputationKeeper",
    "outputs": [
      { "internalType": "address", "name": "", "type": "address" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getContractConfig",
    "outputs": [
      { "internalType": "address", "name": "oracleAddr", "type": "address" },
      { "internalType": "address", "name": "linkAddr", "type": "address" },
      { "internalType": "bytes32", "name": "jobId", "type": "bytes32" },
      { "internalType": "uint256", "name": "fee", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// ReputationKeeper: updated to include an array parameter for classes and correct outputs.
const ReputationKeeperABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "_oracle", "type": "address" },
      { "internalType": "bytes32", "name": "_jobId", "type": "bytes32" },
      { "internalType": "uint256", "name": "fee", "type": "uint256" },
      { "internalType": "uint64[]", "name": "_classes", "type": "uint64[]" }
    ],
    "name": "registerOracle",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "_oracle", "type": "address" },
      { "internalType": "bytes32", "name": "_jobId", "type": "bytes32" }
    ],
    "name": "getOracleInfo",
    "outputs": [
      { "internalType": "bool", "name": "isActive", "type": "bool" },
      { "internalType": "int256", "name": "qualityScore", "type": "int256" },
      { "internalType": "int256", "name": "timelinessScore", "type": "int256" },
      { "internalType": "uint256", "name": "callCount", "type": "uint256" },
      { "internalType": "bytes32", "name": "jobId", "type": "bytes32" },
      { "internalType": "uint256", "name": "fee", "type": "uint256" },
      { "internalType": "uint256", "name": "stakeAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "lockedUntil", "type": "uint256" },
      { "internalType": "bool", "name": "blocked", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// LINK Token: minimal functions for balance, allowance, and approval.
const LinkTokenABI = [
  {
    "constant": true,
    "inputs": [{ "name": "account", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      { "name": "owner", "type": "address" },
      { "name": "spender", "type": "address" }
    ],
    "name": "allowance",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      { "name": "spender", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// WrappedVerdiktaToken: minimal functions for balance, allowance, approval, and transferFrom.
const WrappedVerdiktaTokenABI = [
  {
    "constant": true,
    "inputs": [{ "name": "account", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      { "name": "owner", "type": "address" },
      { "name": "spender", "type": "address" }
    ],
    "name": "allowance",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      { "name": "spender", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      { "name": "sender", "type": "address" },
      { "name": "recipient", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "name": "transferFrom",
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

module.exports = async function(callback) {
  try {
    console.log('Starting oracle registration...');

    const argv = yargs(hideBin(process.argv))
      .option('aggregator', {
        alias: 'a',
        type: 'string',
        description: 'Reputation Aggregator contract address'
      })
      .option('link', {
        alias: 'l',
        type: 'string',
        description: 'LINK token contract address'
      })
      .option('oracle', {
        alias: 'o',
        type: 'string',
        description: 'Oracle contract address'
      })
      .option('wrappedverdikta', {
        alias: 'w',
        type: 'string',
        description: 'WrappedVerdiktaToken contract address'
      })
      .option('jobids', {
        alias: 'j',
        type: 'array',
        description: 'Job ID strings (as an array)'
      })
      .option('classes', {
        alias: 'c',
        type: 'array',
        description: 'Array of class values (e.g. --classes 128 129)',
        demandOption: true
      })
      .demandOption('jobids', 'You must provide at least one job id')
      .help()
      .argv;

    if (!argv.aggregator || !argv.link || !argv.oracle || !argv.wrappedverdikta || !argv.jobids) {
      console.error('Error: aggregator, link, oracle, wrappedverdikta addresses and jobids must be specified.');
      return callback();
    }

    // Convert classes to numbers (if not already)
    const classes = argv.classes.map(x => Number(x));

    // Get the sender account
    const accounts = await web3.eth.getAccounts();
    const owner = accounts[0];
    console.log('Using owner account:', owner);

    // Instantiate the Aggregator contract
    const aggregator = new web3.eth.Contract(AggregatorABI, argv.aggregator);

    // Derive the ReputationKeeper address from the aggregator
    const keeperAddress = await aggregator.methods.reputationKeeper().call();
    console.log('Derived ReputationKeeper address:', keeperAddress);

    // Instantiate the ReputationKeeper contract
    const keeper = new web3.eth.Contract(ReputationKeeperABI, keeperAddress);

    // Instantiate the WrappedVerdiktaToken contract
    const wrappedVerdikta = new web3.eth.Contract(WrappedVerdiktaTokenABI, argv.wrappedverdikta);

    // Instantiate the LINK token contract using the user provided LINK address
    const linkToken = new web3.eth.Contract(LinkTokenABI, argv.link);

    // Oracle contract address (supplied by user)
    const oracleAddress = Array.isArray(argv.oracle) ? argv.oracle[0] : argv.oracle;

    console.log('Registering oracle contract:', oracleAddress);
    
    // Process job IDs from argv.jobids
    const jobIdStrings = argv.jobids;
    console.log('Job IDs:', jobIdStrings);

    const linkFee = "50000000000000000"; // 0.05 LINK (18 decimals)
    const vdkaStake = "100000000000000000000"; // 100 wVDKA (18 decimals)

    // Loop over each jobID and register it if not already active
    for (let i = 0; i < jobIdStrings.length; i++) {
      const currentJobIdString = jobIdStrings[i];
      // Convert the job ID string to a bytes32 value.
      const jobId = web3.utils.fromAscii(currentJobIdString);
      console.log(`\nProcessing jobID ${currentJobIdString} (bytes32: ${jobId})`);

      // Check if oracle is already registered (using oracleAddress and jobId)
      const oracleInfo = await keeper.methods.getOracleInfo(oracleAddress, jobId).call();
      console.log(`Oracle registration status for jobID ${currentJobIdString}:`, {
        isActive: oracleInfo.isActive,
        qualityScore: oracleInfo.qualityScore,
        timelinessScore: oracleInfo.timelinessScore,
        callCount: oracleInfo.callCount,
        jobId: web3.utils.hexToAscii(oracleInfo.jobId),
        fee: oracleInfo.fee,
        stakeAmount: oracleInfo.stakeAmount,
        lockedUntil: oracleInfo.lockedUntil,
        blocked: oracleInfo.blocked
      });

      if (oracleInfo.isActive) {
        console.log(`Oracle for jobID ${currentJobIdString} is already registered. Proceeding with LINK approval...`);
      } else {
        // Log addresses for verification
        console.log('Using contracts:');
        console.log('WrappedVerdiktaToken:', wrappedVerdikta.options.address);
        console.log('ReputationKeeper:', keeper.options.address);

        // Check wVDKA balance
        const balance = await wrappedVerdikta.methods.balanceOf(owner).call();
        console.log('wVDKA Balance:', balance.toString());
        if (web3.utils.toBN(balance).lt(web3.utils.toBN(vdkaStake))) {
          throw new Error('Insufficient wVDKA balance for staking');
        }

        // Check current allowance
        const currentAllowance = await wrappedVerdikta.methods.allowance(owner, keeper.options.address).call();
        console.log('Current wVDKA allowance:', currentAllowance.toString());

        // Approve keeper to spend wVDKA
        console.log('Approving keeper to spend wVDKA...');
        await wrappedVerdikta.methods.approve(keeper.options.address, vdkaStake).send({ from: owner });
        console.log('wVDKA spend approved');

        // Register oracle with the current jobID and pass the classes parameter from the command line.
        console.log(`Registering oracle for jobID ${currentJobIdString} with classes ${JSON.stringify(classes)}...`);
        await keeper.methods.registerOracle(oracleAddress, jobId, linkFee, classes).send({ from: owner });
        console.log(`Oracle registered successfully for jobID ${currentJobIdString}`);
      }
    }

    // Set up LINK token approval for the aggregator
    console.log('\nSetting up LINK token approval...');
    // Get aggregator configuration from aggregator contract
    const config = await aggregator.methods.getContractConfig().call();
    console.log('Aggregator config:', {
      oracleAddr: config.oracleAddr,
      linkAddr: config.linkAddr,
      jobId: web3.utils.hexToAscii(config.jobId),
      fee: config.fee
    });

    // Check if the aggregator's configured oracle address matches the provided oracle address
    if (config.oracleAddr.toLowerCase() !== oracleAddress.toLowerCase()) {
      console.warn('Warning: Aggregator oracle address does not match registered oracle');
    }

    // Check LINK balance and approval for aggregator
    const aggregatorBalance = await linkToken.methods.balanceOf(argv.aggregator).call();
    console.log('Aggregator LINK balance:', aggregatorBalance.toString());

    // Check current LINK balances and allowances for the owner
    const linkBalance = await linkToken.methods.balanceOf(owner).call();
    const currentLinkAllowance = await linkToken.methods.allowance(owner, argv.aggregator).call();
    console.log('LINK status:', {
      balance: linkBalance.toString(),
      currentAllowance: currentLinkAllowance.toString()
    });
    
    // Verify allowances
    const newOracleAllowance = await linkToken.methods.allowance(owner, oracleAddress).call();
    const newAggregatorAllowance = await linkToken.methods.allowance(owner, argv.aggregator).call();
    console.log('Allowances:', {
      oracleAllowance: newOracleAllowance.toString(),
      aggregatorAllowance: newAggregatorAllowance.toString()
    });

    console.log('Setup completed successfully');

    callback();
  } catch (error) {
    console.error('Error during oracle registration:', error);
    callback(error);
  }
};

