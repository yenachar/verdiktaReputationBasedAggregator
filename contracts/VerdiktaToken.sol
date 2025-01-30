// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract VerdiktaToken is ERC20, Ownable {
    address public reputationKeeper;
    
    constructor() ERC20("Verdikta", "VDKA") Ownable(msg.sender) {
        // Initial supply minted to owner
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }
    
    function setReputationKeeper(address _reputationKeeper) external onlyOwner {
        require(_reputationKeeper != address(0), "Invalid reputation keeper address");
        reputationKeeper = _reputationKeeper;
    }
    
    // Only reputation keeper can mint new tokens
    function mint(address to, uint256 amount) external {
        require(msg.sender == reputationKeeper, "Only reputation keeper can mint");
        _mint(to, amount);
    }
    
    // Only reputation keeper can burn tokens
    function burn(address from, uint256 amount) external {
        require(msg.sender == reputationKeeper, "Only reputation keeper can burn");
        _burn(from, amount);
    }
}
