# truffle migrate --network base_sepolia 

echo "Running migrations 1-2 on Ethereum Mainnet..."
MIGRATE_ERC20=1 truffle migrate --dry-run -f 1 --to 2 --network mainnet
echo "Running migration 3 on Base..."
MIGRATE_ERC20=1 truffle migrate --dry-run -f 3 --to 3 --network base
