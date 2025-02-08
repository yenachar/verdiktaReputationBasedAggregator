// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./VerdiktaToken.sol";

contract ReputationKeeper is Ownable {
    struct OracleInfo {
        int256 qualityScore;    // Score based on clustering accuracy
        int256 timelinessScore; // Score based on response timeliness
        uint256 stakeAmount;    // Amount of VDKA tokens staked
        bool isActive;          // Whether oracle is currently active
        bytes32 jobId;          // Chainlink job ID
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
    address[] public registeredOracles;
    
    uint256 public constant STAKE_REQUIREMENT = 100 * 10**18;  // 100 VDKA tokens
    uint256 public constant MAX_SCORE_FOR_SELECTION = 100;
    uint256 public constant MIN_SCORE_FOR_SELECTION = 1;
    
    event OracleRegistered(address indexed oracle, bytes32 jobId, uint256 fee);
    event OracleDeregistered(address indexed oracle);
    event ScoreUpdated(address indexed oracle, int256 newQualityScore, int256 newTimelinessScore);
    event ContractApproved(address indexed contractAddress);
    event ContractRemoved(address indexed contractAddress);
    
    constructor(address _verdiktaToken) Ownable(msg.sender) {
        verdiktaToken = VerdiktaToken(_verdiktaToken);
    }
    
    function getSelectionScore(address oracle, uint256 alpha) public view returns (uint256) {
        if (!oracles[oracle].isActive) return 0;
        
        // Cast to int256 for arithmetic with negative numbers
        int256 weightedScore = (int256(1000 - alpha) * oracles[oracle].qualityScore + 
                              int256(alpha) * oracles[oracle].timelinessScore) / 1000;
        
        if (weightedScore < int256(MIN_SCORE_FOR_SELECTION)) return MIN_SCORE_FOR_SELECTION;
        if (weightedScore > int256(MAX_SCORE_FOR_SELECTION)) return MAX_SCORE_FOR_SELECTION;
        return uint256(weightedScore);
    }
    
    function registerOracle(address oracle, bytes32 jobId, uint256 fee) external {
        require(!oracles[oracle].isActive, "Oracle already registered");
        require(fee > 0, "Fee must be greater than 0");
        
        verdiktaToken.transferFrom(msg.sender, address(this), STAKE_REQUIREMENT);
        
        oracles[oracle].stakeAmount = STAKE_REQUIREMENT;
        oracles[oracle].qualityScore = 0;
        oracles[oracle].timelinessScore = 0;
        oracles[oracle].isActive = true;
        oracles[oracle].jobId = jobId;
        oracles[oracle].fee = fee;
        
        registeredOracles.push(oracle);
        
        emit OracleRegistered(oracle, jobId, fee);
    }
    
    function deregisterOracle(address oracle) external {
        require(oracles[oracle].isActive, "Oracle not registered");
        require(msg.sender == oracle, "Only oracle can deregister itself");
        
        verdiktaToken.transfer(msg.sender, oracles[oracle].stakeAmount);
        
        oracles[oracle].stakeAmount = 0;
        oracles[oracle].isActive = false;
        
        emit OracleDeregistered(oracle);
    }

    function getOracleInfo(address oracle) external view returns (
        bool isActive,
        int256 qualityScore,
        int256 timelinessScore,
        bytes32 jobId,
        uint256 fee
    ) {
        OracleInfo storage info = oracles[oracle];
        return (
            info.isActive,
            info.qualityScore,
            info.timelinessScore,
            info.jobId,
            info.fee
        );
    }
    
    function updateScores(
        address oracle, 
        int8 qualityChange,
        int8 timelinessChange
    ) external {
        require(approvedContracts[msg.sender].isApproved, "Not approved to update scores");
        require(approvedContracts[msg.sender].usedOracles[oracle], "Oracle not used by this contract");
        
        oracles[oracle].qualityScore += qualityChange;
        oracles[oracle].timelinessScore += timelinessChange;
        
        emit ScoreUpdated(oracle, oracles[oracle].qualityScore, oracles[oracle].timelinessScore);
    }
    
    function selectOracles(uint256 count, uint256 alpha) external view returns (address[] memory) {
        require(approvedContracts[msg.sender].isApproved, "Not approved to select oracles");
        
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
        
        uint256 totalWeight = 0;
        uint256[] memory weights = new uint256[](activeCount);
        for (uint256 i = 0; i < activeCount; i++) {
            weights[i] = getSelectionScore(activeOracles[i], alpha);
            totalWeight += weights[i];
        }
        
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
            if (selectedOracles[i] == address(0)) {
                selectedOracles[i] = activeOracles[0];
            }
        }
        
        return selectedOracles;
    }

    function approveContract(address contractAddress) external onlyOwner {
        approvedContracts[contractAddress].isApproved = true;
        emit ContractApproved(contractAddress);
    }
    
    function removeContract(address contractAddress) external onlyOwner {
        approvedContracts[contractAddress].isApproved = false;
        emit ContractRemoved(contractAddress);
    }

    function recordUsedOracles(address[] calldata _oracleAddresses) external {
        require(approvedContracts[msg.sender].isApproved, "Not approved to record oracles");
        
        for (uint256 i = 0; i < _oracleAddresses.length; i++) {
            approvedContracts[msg.sender].usedOracles[_oracleAddresses[i]] = true;
        }
    }
}
