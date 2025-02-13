// scripts/register-oracle.js
// Registers one or more jobs associated with a single oracle address.
const VerdiktaToken = artifacts.require("VerdiktaToken");
const ReputationKeeper = artifacts.require("ReputationKeeper");
const ReputationAggregator = artifacts.require("ReputationAggregator");
const LinkTokenInterface = artifacts.require("LinkTokenInterface");

module.exports = async function(callback) {
  try {
    console.log('Starting oracle registration...');

    // Get accounts
    const accounts = await web3.eth.getAccounts();
    const owner = accounts[0];
    console.log('Using owner account:', owner);

    // Oracle contract address
    const oracleAddress = "0xD67D6508D4E5611cd6a463Dd0969Fa153Be91101";
    console.log('Registering oracle contract:', oracleAddress);
    
    // Define oracle details.
    // Give array of jobId strings.
    const jobIdStrings = [
      "38f19572c51041baa5f2dea284614590",
      "39515f75ac2947beb7f2eeae4d8eaf3e"
      // Add additional jobId strings as needed, e.g.:
      // "anotherjobidstringhere",
      // "yetanotherjobidstring"
    ];
    const linkFee = "50000000000000000"; // 0.05 LINK (18 decimals)
    const vdkaStake = "100000000000000000000"; // 100 VDKA (18 decimals)

    // Get deployed contracts
    const verdikta = await VerdiktaToken.deployed();
    const keeper = await ReputationKeeper.deployed();

    // Loop over each jobId and register it if not already active
    for (let i = 0; i < jobIdStrings.length; i++) {
      const currentJobIdString = jobIdStrings[i];
      // Convert the job ID string to a bytes32 value.
      const jobId = web3.utils.fromAscii(currentJobIdString);
      console.log(`\nProcessing jobID ${currentJobIdString} (bytes32: ${jobId})`);

      // Check if oracle is already registered (using oracleAddress and jobId)
      const oracleInfo = await keeper.getOracleInfo(oracleAddress, jobId);
      console.log(`Oracle registration status for jobID ${currentJobIdString}:`, {
        isActive: oracleInfo.isActive,
        qualityScore: oracleInfo.qualityScore.toString(),
        timelinessScore: oracleInfo.timelinessScore.toString(),
        jobId: web3.utils.hexToAscii(oracleInfo.jobId),
        fee: oracleInfo.fee.toString()
      });

      if (oracleInfo.isActive) {
          console.log(`Oracle for jobID ${currentJobIdString} is already registered. Proceeding with LINK approval...`);
      } else {
        // Log addresses for verification
        console.log('Using contracts:');
        console.log('VerdiktaToken:', verdikta.address);
        console.log('ReputationKeeper:', keeper.address);

        // Check VDKA balance
        const balance = await verdikta.balanceOf(owner);
        console.log('VDKA Balance:', balance.toString());
        if (web3.utils.toBN(balance).lt(web3.utils.toBN(vdkaStake))) {
           throw new Error('Insufficient VDKA balance for staking');
        }

        // First check allowance
        const currentAllowance = await verdikta.allowance(owner, keeper.address);
        console.log('Current VDKA allowance:', currentAllowance.toString());

        // Approve keeper to spend VDKA
        console.log('Approving keeper to spend VDKA...');
        console.log('Approval params:', {
            owner: owner,
            spender: keeper.address,
            amount: vdkaStake
        });
        await verdikta.approve(keeper.address, vdkaStake, { from: owner });
        console.log('VDKA spend approved');

        // Register oracle with the current jobId
        console.log(`Registering oracle for jobID ${currentJobIdString}...`);
        console.log('Registering with params:', {
            oracleAddress,
            jobId,
            linkFee,
            from: owner,
            keeper: keeper.address
        });
        await keeper.registerOracle(oracleAddress, jobId, linkFee, { from: owner });
        console.log(`Oracle registered successfully for jobID ${currentJobIdString}`);
      }
    }

    // Set up LINK approval for the aggregator
    console.log('\nSetting up LINK token approval...');
    const aggregator = await ReputationAggregator.deployed();
    const config = await aggregator.getContractConfig();
    const linkTokenAddress = config.linkAddr;
    const LinkToken = artifacts.require("LinkTokenInterface");
    const linkToken = await LinkToken.at(linkTokenAddress);

    console.log('Aggregator config:', {
        oracleAddr: config.oracleAddr,
        linkAddr: config.linkAddr,
        jobId: config.jobId, // ensure correct property name (jobId)
        fee: config.fee.toString()
    });

    // Check if the oracle address matches
    if (config.oracleAddr.toLowerCase() !== oracleAddress.toLowerCase()) {
        console.warn('Warning: Aggregator oracle address does not match registered oracle');
    }

    // Check LINK balance and approval
    const aggregatorBalance = await linkToken.balanceOf(aggregator.address);
    console.log('Aggregator LINK balance:', aggregatorBalance.toString());

    // Check current LINK balances and allowances
    const linkBalance = await linkToken.balanceOf(owner);
    const currentLinkAllowance = await linkToken.allowance(owner, aggregator.address);
    console.log('LINK status:', {
        balance: linkBalance.toString(),
        currentAllowance: currentLinkAllowance.toString()
    });
    
    // Approve a large amount of LINK
    const maxLinkApproval = "115792089237316195423570985008687907853269984665640564039457584007913129639935"; // max uint256
    console.log('Approving LINK token spending...');

    // Approve for oracle
    await linkToken.approve(oracleAddress, maxLinkApproval, { from: owner });
    console.log('LINK spending approved for oracle');
    
    // Approve for aggregator
    await linkToken.approve(aggregator.address, maxLinkApproval, { from: owner });
    console.log('LINK spending approved for aggregator');

    // Verify new allowances
    const newOracleAllowance = await linkToken.allowance(owner, oracleAddress);
    const newAggregatorAllowance = await linkToken.allowance(owner, aggregator.address);
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

