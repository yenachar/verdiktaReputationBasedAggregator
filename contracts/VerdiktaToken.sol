// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract VerdiktaToken is ERC20, Ownable {
    constructor() ERC20("Verdikta", "VDKA") Ownable(msg.sender) {
        // Initial supply minted to owner
        _mint(msg.sender, 20000000 * 10 ** decimals());
    }
    
    // Only owner can mint new tokens
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
    
    // Allow token holders to burn their own tokens
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
