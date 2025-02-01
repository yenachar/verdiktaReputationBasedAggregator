// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./VerdiktaToken.sol";

contract ReputationKeeper is Ownable {
    struct OracleInfo {
        int256 score;          // Actual score, can be negative
        uint256 stakeAmount;   // Amount of VDKA tokens staked
        bool isActive;         // Whether oracle is currently active
        bytes32 jobId;         // Chainlink job ID
        uint256 fee;           // LINK fee
        mapping(address => bool) approvedContracts;  // Contracts approved to use this oracle
    }
    
    struct ContractInfo {
        bool isApproved;      // Whether contract is approved to use oracles
        mapping(address => bool) usedOracles;  // Oracles used by this contract
    }
    
    VerdiktaToken public verdiktaToken;
    mapping(address => OracleInfo) public oracles;
    mapping(address => ContractInfo) public approvedContracts;
    
    // NEW: Keep an array of all registered oracle addresses.
    address[] public registeredOracles;
    
    uint256 public constant STAKE_REQUIREMENT = 100 * 10**18;  // 100 VDKA tokens
    uint256 public constant MAX_SCORE_FOR_SELECTION = 100;
    uint256 public constant MIN_SCORE_FOR_SELECTION = 1;
    
    event OracleRegistered(address indexed oracle, bytes32 jobId, uint256 fee);
    event OracleDeregistered(address indexed oracle);
    event ScoreUpdated(address indexed oracle, int256 newScore);
    event ContractApproved(address indexed contractAddress);
    event ContractRemoved(address indexed contractAddress);
    
    constructor(address _verdiktaToken) Ownable(msg.sender) {
        verdiktaToken = VerdiktaToken(_verdiktaToken);
    }
    
    function registerOracle(address oracle, bytes32 jobId, uint256 fee) external {
        require(!oracles[oracle].isActive, "Oracle already registered");
        require(fee > 0, "Fee must be greater than 0");
        
        // Transfer VDKA tokens from sender to this contract
        verdiktaToken.transferFrom(msg.sender, address(this), STAKE_REQUIREMENT);
        
        oracles[oracle].stakeAmount = STAKE_REQUIREMENT;
        oracles[oracle].score = 0;
        oracles[oracle].isActive = true;
        oracles[oracle].jobId = jobId;
        oracles[oracle].fee = fee;
        
        // Add this oracle to the registeredOracles list.
        registeredOracles.push(oracle);
        
        emit OracleRegistered(oracle, jobId, fee);
    }
    
    function deregisterOracle(address oracle) external {
        require(oracles[oracle].isActive, "Oracle not registered");
        require(msg.sender == oracle, "Only oracle can deregister itself");
        
        // Return staked tokens
        verdiktaToken.transfer(msg.sender, oracles[oracle].stakeAmount);
        
        oracles[oracle].stakeAmount = 0;
        oracles[oracle].isActive = false;
        
        // (For minimal changes we leave the oracle in the registeredOracles array.)
        emit OracleDeregistered(oracle);
    }

    function getOracleInfo(address oracle) external view returns (
        bool isActive,
        int256 score,
        uint256 stakeAmount,
        bytes32 jobId,
        uint256 fee
    ) {
        OracleInfo storage info = oracles[oracle];
        return (
            info.isActive,
            info.score,
            info.stakeAmount,
            info.jobId,
            info.fee
        );
    }
    
    function approveContract(address contractAddress) external onlyOwner {
        approvedContracts[contractAddress].isApproved = true;
        emit ContractApproved(contractAddress);
    }
    
    function removeContract(address contractAddress) external onlyOwner {
        approvedContracts[contractAddress].isApproved = false;
        emit ContractRemoved(contractAddress);
    }
    
    function getSelectionScore(address oracle) public view returns (uint256) {
        if (!oracles[oracle].isActive) return 0;
        
        int256 score = oracles[oracle].score;
        if (score < int256(MIN_SCORE_FOR_SELECTION)) return MIN_SCORE_FOR_SELECTION;
        if (score > int256(MAX_SCORE_FOR_SELECTION)) return MAX_SCORE_FOR_SELECTION;
        return uint256(score);
    }
    
    function updateScore(address oracle, int8 scoreChange) external {
        require(approvedContracts[msg.sender].isApproved, "Not approved to update scores");
        require(approvedContracts[msg.sender].usedOracles[oracle], "Oracle not used by this contract");
        
        oracles[oracle].score += scoreChange;
        emit ScoreUpdated(oracle, oracles[oracle].score);
    }
    
    // NEW: Modified selectOracles function that always picks from registered oracles.
    // It filters for active oracles and then selects `count` times (allowing duplicates).
    function selectOracles(uint256 count) external view returns (address[] memory) {
        require(approvedContracts[msg.sender].isApproved, "Not approved to select oracles");
        
        // Build an array of active oracles.
        uint256 activeCount = 0;
        for (uint256 i = 0; i < registeredOracles.length; i++) {
            if (oracles[registeredOracles[i]].isActive) {
                activeCount++;
            }
        }
        require(activeCount > 0, "No active oracles available");
        
        address[] memory activeOracles = new address[](activeCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < registeredOracles.length; i++) {
            if (oracles[registeredOracles[i]].isActive) {
                activeOracles[idx] = registeredOracles[i];
                idx++;
            }
        }
        
        // Compute total weight based on each oracle's selection score.
        uint256 totalWeight = 0;
        uint256[] memory weights = new uint256[](activeCount);
        for (uint256 i = 0; i < activeCount; i++) {
            weights[i] = getSelectionScore(activeOracles[i]);
            totalWeight += weights[i];
        }
        
        // Now select `count` oracles (allowing duplicates) via weighted random selection.
        address[] memory selectedOracles = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            uint256 seed = uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, i)));
            uint256 selection = seed % totalWeight;
            uint256 sum = 0;
            for (uint256 j = 0; j < activeCount; j++) {
                sum += weights[j];
                if (sum > selection) {
                    selectedOracles[i] = activeOracles[j];
                    break;
                }
            }
            // Fallback (should never happen): use the first active oracle.
            if (selectedOracles[i] == address(0)) {
                selectedOracles[i] = activeOracles[0];
            }
        }
        
        return selectedOracles;
    }

    function recordUsedOracles(address[] calldata _oracleAddresses) external {
        require(approvedContracts[msg.sender].isApproved, "Not approved to record oracles");
        
        for (uint256 i = 0; i < _oracleAddresses.length; i++) {
            approvedContracts[msg.sender].usedOracles[_oracleAddresses[i]] = true;
        }
    }
}

