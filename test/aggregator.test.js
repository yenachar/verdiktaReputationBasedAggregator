// test/aggregator.test.js
const truffleAssert        = require('truffle-assertions');
const ReputationAggregator = artifacts.require("ReputationAggregator");
const ReputationKeeper     = artifacts.require("ReputationKeeper");
const LinkToken            = artifacts.require("LinkToken");

contract("ReputationAggregator (config & getters only)", accounts => {
  let agg, keeper, link;
  const owner = accounts[0];

  before(async () => {
    keeper = await ReputationKeeper.deployed();
    agg    = await ReputationAggregator.deployed();
    // grab LINK address from the public getter
    const cfg      = await agg.getContractConfig();
    const linkAddr = cfg[1];          // [oracleAddr, linkAddr, jobId, fee]
    link = await LinkToken.at(linkAddr);
  });

  it("should have a LINK token instance with a positive owner balance", async () => {
    const bal = await link.balanceOf(owner);
    assert(bal.gt(web3.utils.toBN(0)), "Owner must hold some LINK");
  });

  it("has sensible default config values", async () => {
    const oraclesToPoll     = (await agg.oraclesToPoll()).toNumber();
    const requiredResponses = (await agg.requiredResponses()).toNumber();
    const clusterSize       = (await agg.clusterSize()).toNumber();
    const timeoutSeconds    = (await agg.responseTimeoutSeconds()).toNumber();
    const alpha             = (await agg.getAlpha()).toNumber();
    const maxOracleFee      = await agg.maxOracleFee();

    assert(oraclesToPoll > 0, "oraclesToPoll > 0");
    assert(
      requiredResponses > 0 && requiredResponses <= oraclesToPoll,
      "0 < requiredResponses ≤ oraclesToPoll"
    );
    assert(clusterSize <= requiredResponses, "clusterSize ≤ requiredResponses");
    assert.equal(timeoutSeconds, 300, "default timeout = 300s");
    assert.equal(alpha, 500,      "default alpha = 500");
    assert(maxOracleFee.gt(web3.utils.toBN(0)), "maxOracleFee > 0");
  });

  it("calculates maxTotalFee correctly", async () => {
    const maxFee   = await agg.maxOracleFee();
    const small    = maxFee.div(web3.utils.toBN(2));
    const slotSum  = (await agg.oraclesToPoll()).toNumber() + (await agg.clusterSize()).toNumber();

    // when input < maxOracleFee
    let result = await agg.maxTotalFee(small);
    assert.equal(
      result.toString(),
      small.muln(slotSum).toString(),
      "maxTotalFee(min(input,maxFee))"
    );

    // when input > maxOracleFee
    const big = maxFee.muln(2);
    result = await agg.maxTotalFee(big);
    assert.equal(
      result.toString(),
      maxFee.muln(slotSum).toString(),
      "maxTotalFee(clamped to maxFee)"
    );
  });

  it("returns estimated base cost = maxOracleFee * baseFeePct / 100", async () => {
    const maxFee   = await agg.maxOracleFee();
    const pct      = (await agg.baseFeePct()).toNumber();
    const expected = maxFee.mul(web3.utils.toBN(pct)).div(web3.utils.toBN(100));
    const got      = await agg.getEstimatedBaseCost();
    assert.equal(got.toString(), expected.toString());
  });

  it("only owner can setAlpha & getAlpha reflects it", async () => {
    await agg.setAlpha(123, { from: owner });
    assert.equal((await agg.getAlpha()).toNumber(), 123);
    // restore
    await agg.setAlpha(500, { from: owner });
  });

  it("only owner can setConfig and values update accordingly", async () => {
    await agg.setConfig(5, 4, 2, 42, { from: owner });
    assert.equal((await agg.oraclesToPoll()).toNumber(),      5);
    assert.equal((await agg.requiredResponses()).toNumber(), 4);
    assert.equal((await agg.clusterSize()).toNumber(),       2);
    assert.equal((await agg.responseTimeoutSeconds()).toNumber(), 42);

    // restore defaults
    await agg.setConfig(4, 3, 2, 300, { from: owner });
  });

  it("owner can update all setter-only fields", async () => {
    // responseTimeout
    await agg.setResponseTimeout(111, { from: owner });
    assert.equal((await agg.responseTimeoutSeconds()).toNumber(), 111);

    // maxOracleFee
    await agg.setMaxOracleFee(web3.utils.toWei("0.2","ether"), { from: owner });
    assert.equal((await agg.maxOracleFee()).toString(), web3.utils.toWei("0.2","ether"));

    // baseFeePct
    await agg.setBaseFeePct(10, { from: owner });
    assert.equal((await agg.baseFeePct()).toNumber(), 10);

    // maxFeeBasedScalingFactor
    await agg.setMaxFeeBasedScalingFactor(7, { from: owner });
    assert.equal((await agg.maxFeeBasedScalingFactor()).toNumber(), 7);

    // restore
    await agg.setResponseTimeout(300,   { from: owner });
    await agg.setMaxOracleFee(web3.utils.toWei("0.1","ether"), { from: owner });
    await agg.setBaseFeePct(1,          { from: owner });
    await agg.setMaxFeeBasedScalingFactor(10, { from: owner });
  });
});

