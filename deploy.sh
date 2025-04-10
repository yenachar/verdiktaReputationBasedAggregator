# truffle migrate --network base_sepolia 

# echo "=== Verdikta Deployment Script ==="
# echo "Moving build directory..."
# mv build build_bk
echo "Running migrations 1-2 on Sepolia..."
MIGRATE_ERC20=1 truffle migrate -f 1 --to 2 --network sepolia
# echo "Running migrations 1 and 3-5 on Base Sepolia..."
# truffle migrate -f 1 --to 1 --network base_sepolia
echo "Running migrations 3-5 on Sepolia..."
MIGRATE_ERC20=1 truffle migrate -f 3 --to 5 --network base_sepolia
# truffle migrate -f 3 --to 3 --network base_sepolia
