// scripts/register-oracle.js
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
    const oracleAddress = "0x1f3829ca4Bce27ECbB55CAA8b0F8B51E4ba2cCF6";
    console.log('Registering oracle contract:', oracleAddress);
	  
    // Get deployed contracts
    const verdikta = await VerdiktaToken.deployed();
    const keeper = await ReputationKeeper.deployed();

    // Check if oracle is already registered
    const oracleInfo = await keeper.getOracleInfo(oracleAddress);
    console.log('Oracle registration status:', {
        isActive: oracleInfo.isActive,
        score: oracleInfo.score.toString(),
        stakeAmount: oracleInfo.stakeAmount.toString(),
        jobId: web3.utils.hexToAscii(oracleInfo.jobId),
        fee: oracleInfo.fee.toString()
    });


    if (oracleInfo.isActive) {
        console.log('Oracle is already registered. Proceeding with LINK approval...');
    } else {

    // Log addresses for verification
    console.log('Using contracts:');
    console.log('VerdiktaToken:', verdikta.address);
    console.log('ReputationKeeper:', keeper.address);

    // Oracle details
    const jobId = web3.utils.fromAscii("38f19572c51041baa5f2dea284614590").padEnd(66, '0');
    const linkFee = "50000000000000000"; // 0.05 LINK (18 decimals)
    const vdkaStake = "100000000000000000000"; // 100 VDKA (18 decimals)

    // Check VDKA balance
    const balance = await verdikta.balanceOf(owner);
    console.log('VDKA Balance:', balance.toString());
    if (balance.lt(web3.utils.toBN(vdkaStake))) {
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
    // await verdikta.approve(keeper.address, vdkaStake, { from: oracleAddress });
    console.log('VDKA spend approved');

    // Register oracle
    console.log('Registering oracle...');
    console.log('Registering with params:', {
        oracleAddress,
        jobId,
        linkFee,
        from: owner,
        keeper: keeper.address
    });
    await keeper.registerOracle(oracleAddress, jobId, linkFee, { from: owner });
    console.log('Oracle registered successfully');
    }

    // Set up LINK approval for the aggregator
    console.log('Setting up LINK token approval...');
    const aggregator = await ReputationAggregator.deployed();
    const config = await aggregator.getContractConfig();
    const linkTokenAddress = config.linkAddr;
    const LinkToken = artifacts.require("LinkTokenInterface");
    const linkToken = await LinkToken.at(linkTokenAddress);
    
    // Approve a large amount of LINK
    const maxLinkApproval = "115792089237316195423570985008687907853269984665640564039457584007913129639935"; // max uint256
    console.log('Approving LINK token spending for aggregator...');
    await linkToken.approve(aggregator.address, maxLinkApproval, { from: owner });
    console.log('LINK token spending approved');

    callback();
  } catch (error) {
    console.error('Error during oracle registration:', error);
    callback(error);
  }
};

