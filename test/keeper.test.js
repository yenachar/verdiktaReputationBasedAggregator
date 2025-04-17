// test/keeper.test.js
const ReputationKeeper     = artifacts.require("ReputationKeeper");
const WrappedVerdiktaToken = artifacts.require("WrappedVerdiktaToken");
const truffleAssert        = require('truffle-assertions');

contract("ReputationKeeper (register & config only)", accounts => {
  let keeper, token;
  const owner         = accounts[0];
  // we'll use the owner itself as the "external contract" to approve/remove
  const dummy         = owner;
  const fee           = web3.utils.toWei("0.05", "ether");
  const validClasses  = [1, 2, 3];

  before(async () => {
    token  = await WrappedVerdiktaToken.deployed();
    keeper = await ReputationKeeper.deployed();

    // Ensure owner has enough VDKA tokens to stake
    const stakeRequirement = await keeper.STAKE_REQUIREMENT();
    const bal              = await token.balanceOf(owner);
    assert(bal.gte(stakeRequirement), "owner must have stake tokens");

    // Approve staking
    await token.approve(keeper.address, stakeRequirement, { from: owner });
  });

  it("registers an oracle and returns correct info", async () => {
    const jobId = web3.utils.randomHex(32);
    const tx    = await keeper.registerOracle(
      owner,        // oracleAddress
      jobId,
      fee,
      validClasses,
      { from: owner }
    );
    assert(
      tx.logs.some(l => l.event === 'OracleRegistered'),
      "OracleRegistered event missing"
    );

    const info = await keeper.getOracleInfo(owner, jobId);
    const req  = await keeper.STAKE_REQUIREMENT();
    assert(info.isActive,               "should be active");
    assert.equal(info.fee.toString(), fee, "fee should match");
    assert(info.stakeAmount.gte(req),   "stakeAmount ≥ requirement");
  });

  it("reverts if fee == 0", async () => {
    await truffleAssert.reverts(
      keeper.registerOracle(
        owner,
        web3.utils.randomHex(32),
        0,
        validClasses,
        { from: owner }
      ),
      "Fee must be greater than 0"
    );
  });

  it("reverts if classes array is empty", async () => {
    await truffleAssert.reverts(
      keeper.registerOracle(
        owner,
        web3.utils.randomHex(32),
        fee,
        [],
        { from: owner }
      ),
      "At least one class must be provided"
    );
  });

  it("reverts if more than 5 classes provided", async () => {
    const tooMany = [1,2,3,4,5,6];
    await truffleAssert.reverts(
      keeper.registerOracle(
        owner,
        web3.utils.randomHex(32),
        fee,
        tooMany,
        { from: owner }
      ),
      "A maximum of 5 classes allowed"
    );
  });

  it("can approve and then remove an external contract (using owner itself)", async () => {
    // Approve owner as an "external contract"
    const tx1 = await keeper.approveContract(dummy, { from: owner });
    assert(
      tx1.logs.some(l => l.event === 'ContractApproved'),
      "ContractApproved event missing"
    );

    // Now remove it
    const tx2 = await keeper.removeContract(dummy, { from: owner });
    assert(
      tx2.logs.some(l => l.event === 'ContractRemoved'),
      "ContractRemoved event missing"
    );
  });
});

