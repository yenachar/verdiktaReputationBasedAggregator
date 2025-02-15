// scripts/register-oracle-cl.js
// Registers one or more jobs associated with a single oracle address,
// using user-supplied contract addresses and minimal ABIs.
//
// Usage example:
// truffle exec scripts/register-oracle-cl.js \
//   --aggregator 0xAggregatorAddress \
//   --link 0xLinkTokenAddress \
//   --oracle 0xOracleAddress \
//   --verdikta 0xVerdiktaTokenAddress \
//   --jobids "jobid1" "jobid2" --network your_network
//   (Shortcuts, like -l instead of --link also works)
//   Here is an example registering two jobIDs:
//   truffle exec scripts/register-oracle-cl.js -a 0xF6b930bDC1b4b64080AA52fb6d4A5C7f9431a27a -l 0xE4aB69C077896252FAFBD49EFD26B5D171A32410 -v 0x9eF54beC2E9051411aFec2161E5eCC56993D9905 -o 0xD67D6508D4E5611cd6a463Dd0969Fa153Be91101 --jobids "38f19572c51041baa5f2dea284614590" "39515f75ac2947beb7f2eeae4d8eaf3e" --network base_sepolia

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

// ReputationKeeper: minimal functions for registration and info query.
const ReputationKeeperABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "_oracle", "type": "address" },
      { "internalType": "bytes32", "name": "_jobId", "type": "bytes32" },
      { "internalType": "uint256", "name": "fee", "type": "uint256" }
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
      { "internalType": "bytes32", "name": "jobId", "type": "bytes32" },
      { "internalType": "uint256", "name": "fee", "type": "uint256" }
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

// VerdiktaToken: minimal functions for balance, allowance, approval, and transferFrom.
const VerdiktaTokenABI = [
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
      .option('verdikta', {
        alias: 'v',
        type: 'string',
        description: 'VerdiktaToken contract address'
      })
      .option('jobids', {
        alias: 'j',
        type: 'array',
        description: 'Job ID strings (as an array)'
      })
      .demandOption('jobids', 'You must provide at least one job id')
      .help()
      .argv;

    if (!argv.aggregator || !argv.link || !argv.oracle || !argv.verdikta || !argv.jobids) {
      console.error('Error: aggregator, link, oracle, verdikta addresses and jobids must be specified.');
      return callback();
    }

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

    // Instantiate the VerdiktaToken contract
    const verdikta = new web3.eth.Contract(VerdiktaTokenABI, argv.verdikta);

    // Instantiate the LINK token contract using the user provided LINK address
    const linkToken = new web3.eth.Contract(LinkTokenABI, argv.link);

    // Oracle contract address (supplied by user)
    // const oracleAddress = argv.oracle;
    const oracleAddress = Array.isArray(argv.oracle) ? argv.oracle[0] : argv.oracle;

    console.log('Registering oracle contract:', oracleAddress);
    
    // Process job IDs from argv.jobids
    const jobIdStrings = argv.jobids;
    console.log('Job IDs:', jobIdStrings);

    const linkFee = "50000000000000000"; // 0.05 LINK (18 decimals)
    const vdkaStake = "100000000000000000000"; // 100 VDKA (18 decimals)

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
        jobId: web3.utils.hexToAscii(oracleInfo.jobId),
        fee: oracleInfo.fee
      });

      if (oracleInfo.isActive) {
          console.log(`Oracle for jobID ${currentJobIdString} is already registered. Proceeding with LINK approval...`);
      } else {
        // Log addresses for verification
        console.log('Using contracts:');
        console.log('VerdiktaToken:', verdikta.options.address);
        console.log('ReputationKeeper:', keeper.options.address);

        // Check VDKA balance
        const balance = await verdikta.methods.balanceOf(owner).call();
        console.log('VDKA Balance:', balance.toString());
        if (web3.utils.toBN(balance).lt(web3.utils.toBN(vdkaStake))) {
           throw new Error('Insufficient VDKA balance for staking');
        }

        // Check current allowance
        const currentAllowance = await verdikta.methods.allowance(owner, keeper.options.address).call();
        console.log('Current VDKA allowance:', currentAllowance.toString());

        // Approve keeper to spend VDKA
        console.log('Approving keeper to spend VDKA...');
        await verdikta.methods.approve(keeper.options.address, vdkaStake).send({ from: owner });
        console.log('VDKA spend approved');

        // Register oracle with the current jobID
        console.log(`Registering oracle for jobID ${currentJobIdString}...`);
        await keeper.methods.registerOracle(oracleAddress, jobId, linkFee).send({ from: owner });
        console.log(`Oracle registered successfully for jobID ${currentJobIdString}`);
      }
    }

    // Set up LINK approval for the aggregator
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
    
    // Approve a large amount of LINK (max uint256)
    const maxLinkApproval = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
    console.log('Approving LINK token spending...');

    // Approve for oracle
    await linkToken.methods.approve(oracleAddress, maxLinkApproval).send({ from: owner });
    console.log('LINK spending approved for oracle');
    
    // Approve for aggregator
    await linkToken.methods.approve(argv.aggregator, maxLinkApproval).send({ from: owner });
    console.log('LINK spending approved for aggregator');

    // Verify new allowances
    const newOracleAllowance = await linkToken.methods.allowance(owner, oracleAddress).call();
    const newAggregatorAllowance = await linkToken.methods.allowance(owner, argv.aggregator).call();
    console.log('New allowances:', {
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
