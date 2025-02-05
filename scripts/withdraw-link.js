// truffle exec scripts/withdraw-link.js -a 0xbabE69DdF8CBbe63fEDB6f49904efB35522667Af -d 0xYourDepositAddress --network base_sepolia
//
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const AggregatorABI = [
  {
    "inputs": [],
    "name": "getContractConfig",
    "outputs": [
      { "name": "oracleAddr", "type": "address" },
      { "name": "linkAddr", "type": "address" },
      { "name": "jobId", "type": "bytes32" },
      { "name": "fee", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address payable",
        "name": "_to",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "_amount",
        "type": "uint256"
      }
    ],
    "name": "withdrawLink",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

const LinkTokenABI = [
  {
    "constant": true,
    "inputs": [{"name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
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
      .option('deposit', {
        alias: 'd',
        type: 'string',
        description: 'Address to receive the LINK tokens'
      })
      .help()
      .argv;

    // Get account that will send the transaction
    const accounts = await web3.eth.getAccounts();
    const sender = accounts[0];
    console.log(`Using account: ${sender}`);

    console.log(`\nConnecting to Aggregator at: ${argv.aggregator}`);
    const aggregator = new web3.eth.Contract(AggregatorABI, argv.aggregator);

    console.log('\nTrying to get LINK token address...');
    try {
      const config = await aggregator.methods.getContractConfig().call();
      const linkTokenAddress = config.linkAddr;
      console.log(`LINK token address: ${linkTokenAddress}`);

      const linkToken = new web3.eth.Contract(LinkTokenABI, linkTokenAddress);
      
      console.log('\nChecking LINK balance...');
      const balance = await linkToken.methods.balanceOf(argv.aggregator).call();
      console.log(`LINK balance: ${web3.utils.fromWei(balance, 'ether')} LINK`);

      if (balance === '0') {
        console.log('No LINK tokens to withdraw');
        callback();
        return;
      }

      console.log('\nPreparing withdrawal transaction...');
      console.log(`From: ${sender}`);
      console.log(`To: ${argv.deposit}`);
      console.log(`Amount: ${web3.utils.fromWei(balance, 'ether')} LINK`);

      const gas = await aggregator.methods.withdrawLink(argv.deposit, balance)
        .estimateGas({ from: sender });
      console.log(`Estimated gas: ${gas}`);

      console.log('\nSending withdrawal transaction...');
      const result = await aggregator.methods.withdrawLink(argv.deposit, balance)
        .send({ 
          from: sender,
          gas: Math.floor(gas * 1.2) // Add 20% buffer
        });

      console.log('Transaction successful!');
      console.log('TX Hash:', result.transactionHash);

      // Verify final balances
      const newBalance = await linkToken.methods.balanceOf(argv.aggregator).call();
      const depositBalance = await linkToken.methods.balanceOf(argv.deposit).call();
      console.log('\nFinal balances:');
      console.log(`Aggregator: ${web3.utils.fromWei(newBalance, 'ether')} LINK`);
      console.log(`Deposit address: ${web3.utils.fromWei(depositBalance, 'ether')} LINK`);

    } catch (error) {
      console.log('Failed at step:', error.message);
      throw error;
    }

    callback();
  } catch (error) {
    console.error('\nError:', error);
    callback(error);
  }
};
