// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract VerdiktaToken is ERC20 {
    constructor() ERC20("Verdikta", "VDKA") {
        // Initial supply 
        _mint(msg.sender, 20_000_000 * 1e18);
    }
    
    // Allow token holders to burn their own tokens
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
