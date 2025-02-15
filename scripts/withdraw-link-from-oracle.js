// Withdraws LINK from the Operator (Oracle) contract.
// Usage example:
// truffle exec scripts/withdraw-link-from-oracle.js -a <operator address> -d <deposit address> -l <link token address> --network your_network
// Here is an example using Base Sepoia:
// truffle exec scripts/withdraw-link-from-oracle.js -a 0xD67D6508D4E5611cd6a463Dd0969Fa153Be91101 -d 0xFBDE840eb654E0f8B9F3e6c69C354B309A9ffE6b -l 0xE4aB69C077896252FAFBD49EFD26B5D171A32410 --network base_sepolia
// Note you might have to change the index in sender = accounts[0] below to use another account configured for Truffle

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const OperatorABI = [
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address payable",
        "name": "_recipient",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "_amount",
        "type": "uint256"
      }
    ],
    "name": "withdraw",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "withdrawable",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

const LinkTokenABI = [
  {
    "constant": true,
    "inputs": [{ "name": "account", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "name": "", "type": "uint256" }],
    "type": "function"
  }
];

module.exports = async function(callback) {
  try {
    const argv = yargs(hideBin(process.argv))
      .option('operator', {
        alias: 'a',
        type: 'string',
        description: 'Operator (Oracle) contract address'
      })
      .option('deposit', {
        alias: 'd',
        type: 'string',
        description: 'Address to receive the LINK tokens'
      })
      .option('link', {
        alias: 'l',
        type: 'string',
        description: 'LINK token contract address'
      })
      .help()
      .argv;

    if (!argv.operator || !argv.deposit || !argv.link) {
      console.error('Error: operator (-a), deposit (-d) and link token (-l) addresses must be specified.');
      return callback();
    }

    // Get account that will send the transaction
    const accounts = await web3.eth.getAccounts();
    const sender = accounts[0]; // change this to another index if needed
    console.log(`Using account: ${sender}`);

    console.log(`\nConnecting to Operator at: ${argv.operator}`);
    const operator = new web3.eth.Contract(OperatorABI, argv.operator);

    // These lines get and print owner and sender addresses
    const ownerAddress = await operator.methods.owner().call();
    console.log(`\nOracle owner address: ${ownerAddress}`);
    console.log(`Sender address: ${sender}`);
    console.log(`Are they the same? ${ownerAddress.toLowerCase() === sender.toLowerCase() ? 'Yes' : 'No'}`);

    // Use the provided LINK token address instead of trying to fetch it from the contract.
    const linkTokenAddress = argv.link;
    console.log(`LINK token address provided: ${linkTokenAddress}`);

    const linkToken = new web3.eth.Contract(LinkTokenABI, linkTokenAddress);

    console.log('\nChecking LINK balance in the Operator contract...');
    const totalBalance = await linkToken.methods.balanceOf(argv.operator).call();
    console.log(`Total LINK balance: ${web3.utils.fromWei(totalBalance, 'ether')} LINK`);

    // Instead of using the total balance, get the withdrawable amount.
    const withdrawableAmount = await operator.methods.withdrawable().call();
    console.log(`Withdrawable LINK balance: ${web3.utils.fromWei(withdrawableAmount, 'ether')} LINK`);

    if (withdrawableAmount === '0') {
      console.log('No LINK tokens to withdraw.');
      return callback();
    }

    console.log('\nPreparing withdrawal transaction...');
    console.log(`From: ${sender}`);
    console.log(`To: ${argv.deposit}`);
    console.log(`Amount: ${web3.utils.fromWei(withdrawableAmount, 'ether')} LINK`);

    const estimatedGas = await operator.methods.withdraw(argv.deposit, withdrawableAmount)
      .estimateGas({ from: sender });
    console.log(`Estimated gas: ${estimatedGas}`);

    console.log('\nSending withdrawal transaction...');
    const result = await operator.methods.withdraw(argv.deposit, withdrawableAmount)
      .send({ 
        from: sender,
        gas: Math.floor(estimatedGas * 1.2) // 20% gas buffer
      });

    console.log('Transaction successful!');
    console.log('TX Hash:', result.transactionHash);

    // Verify final balances
    const operatorFinalBalance = await linkToken.methods.balanceOf(argv.operator).call();
    const depositFinalBalance = await linkToken.methods.balanceOf(argv.deposit).call();
    console.log('\nFinal balances:');
    console.log(`Operator: ${web3.utils.fromWei(operatorFinalBalance, 'ether')} LINK`);
    console.log(`Deposit address: ${web3.utils.fromWei(depositFinalBalance, 'ether')} LINK`);

    callback();
  } catch (error) {
    console.error('\nError:', error);
    callback(error);
  }
};

