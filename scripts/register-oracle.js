// scripts/register-oracle.js
const VerdiktaToken = artifacts.require("VerdiktaToken");
const ReputationKeeper = artifacts.require("ReputationKeeper");

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

    callback();
  } catch (error) {
    console.error('Error during oracle registration:', error);
    callback(error);
  }
};

