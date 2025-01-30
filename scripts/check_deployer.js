require('dotenv').config();
const HDWalletProvider = require('@truffle/hdwallet-provider');
const Web3 = require('web3');

async function main() {
    const provider = new HDWalletProvider(
        process.env.PRIVATE_KEY,
        `https://sepolia.base.org`  // Or your Infura URL
    );
    
    const web3 = new Web3(provider);
    const accounts = await web3.eth.getAccounts();
    console.log('Deploying from address:', accounts[0]);
    
    // Get balance
    const balance = await web3.eth.getBalance(accounts[0]);
    console.log('Account balance:', web3.utils.fromWei(balance, 'ether'), 'ETH');
    
    provider.engine.stop();
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
