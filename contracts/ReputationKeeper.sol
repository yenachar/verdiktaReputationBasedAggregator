// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./VerdiktaToken.sol";

/// @notice Minimal interface to query an oracle contract's owner.
/// It assumes the oracle contract implements an owner() function.
interface IOracleOwner {
    function owner() external view returns (address);
}

/**
 * @title ReputationKeeper
 * @notice Tracks oracle reputations using composite keys (oracle address and jobID).
 */
contract ReputationKeeper is Ownable {
    // A composite identity for an oracle.
    struct OracleIdentity {
        address oracle;
        bytes32 jobId;
    }

    // Information about each oracle identity.
    struct OracleInfo {
        int256 qualityScore;    // Score based on clustering accuracy
        int256 timelinessScore; // Score based on response timeliness
        uint256 stakeAmount;    // Amount of VDKA tokens staked
        bool isActive;          // Whether oracle is currently active
        bytes32 jobId;          // The job ID (redundant but stored for convenience)
        uint256 fee;            // LINK fee required for this job
    }
    
    // Per–contract usage data.
    struct ContractInfo {
        bool isApproved;      // Whether this contract is approved to use oracles
        // Mapping from composite oracle key to whether the contract used that oracle.
        mapping(bytes32 => bool) usedOracles;
    }
    
    VerdiktaToken public verdiktaToken;

    // Composite key (oracle, jobID) → OracleInfo.
    mapping(bytes32 => OracleInfo) public oracles;
    // Approved external contracts (for example, reputation aggregators).
    mapping(address => ContractInfo) public approvedContracts;
    // List of all registered oracle identities.
    OracleIdentity[] public registeredOracles;
    
    uint256 public constant STAKE_REQUIREMENT = 100 * 10**18;  // 100 VDKA tokens
    uint256 public constant MAX_SCORE_FOR_SELECTION = 100;
    uint256 public constant MIN_SCORE_FOR_SELECTION = 1;
    
    event OracleRegistered(address indexed oracle, bytes32 jobId, uint256 fee);
    event OracleDeregistered(address indexed oracle, bytes32 jobId);
    event ScoreUpdated(address indexed oracle, int256 newQualityScore, int256 newTimelinessScore);
    event ContractApproved(address indexed contractAddress);
    event ContractRemoved(address indexed contractAddress);
    
    /// @dev Generates a composite key from an oracle address and its job ID.
    function _oracleKey(address _oracle, bytes32 _jobId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_oracle, _jobId));
    }
    
    constructor(address _verdiktaToken) Ownable(msg.sender) {
        verdiktaToken = VerdiktaToken(_verdiktaToken);
    }
    
    /**
     * @notice Register an oracle under a specific job ID.
     * @param _oracle The oracle’s address.
     * @param _jobId The Chainlink job ID.
     * @param fee The LINK fee for this job.
     *
     * Requirements:
     * - The oracle must not already be registered.
     * - The fee must be greater than 0.
     * - The caller must be either the owner of this ReputationKeeper or the owner of the oracle contract.
     * - The caller must have approved this contract to transfer the required stake.
     */
    function registerOracle(address _oracle, bytes32 _jobId, uint256 fee) external {
        bytes32 key = _oracleKey(_oracle, _jobId);
        require(!oracles[key].isActive, "Oracle already registered");
        require(fee > 0, "Fee must be greater than 0");
        
        // Allow registration if the caller is either the owner of this contract or the owner of the oracle.
        require(
            msg.sender == owner() || msg.sender == IOracleOwner(_oracle).owner(),
            "Not authorized to register oracle"
        );
        
        // Transfer the stake from the registering party.
        verdiktaToken.transferFrom(msg.sender, address(this), STAKE_REQUIREMENT);
        
        // Store the oracle info under the composite key.
        oracles[key] = OracleInfo({
            qualityScore: 0,
            timelinessScore: 0,
            stakeAmount: STAKE_REQUIREMENT,
            isActive: true,
            jobId: _jobId,
            fee: fee
        });
        
        // Only push the OracleIdentity if one doesn't already exist.
        bool exists = false;
        for (uint256 i = 0; i < registeredOracles.length; i++) {
            if (registeredOracles[i].oracle == _oracle && registeredOracles[i].jobId == _jobId) {
                exists = true;
                break;
            }
        }
        if (!exists) {
            registeredOracles.push(OracleIdentity({oracle: _oracle, jobId: _jobId}));
        }
        
        emit OracleRegistered(_oracle, _jobId, fee);
    }
    
    /**
     * @notice Deregister an oracle identity.
     * @param _oracle The oracle’s address.
     * @param _jobId The Chainlink job ID.
     *
     * Requirements:
     * - The oracle must be currently registered.
     * - The caller must be either the owner of this ReputationKeeper or the owner of the oracle contract.
     */
    function deregisterOracle(address _oracle, bytes32 _jobId) external {
        bytes32 key = _oracleKey(_oracle, _jobId);
        require(oracles[key].isActive, "Oracle not registered");
        require(
            msg.sender == owner() || msg.sender == IOracleOwner(_oracle).owner(),
            "Not authorized to deregister oracle"
        );
        
        // Return the staked tokens to the caller.
        verdiktaToken.transfer(msg.sender, oracles[key].stakeAmount);
        
        oracles[key].stakeAmount = 0;
        oracles[key].isActive = false;
        
        emit OracleDeregistered(_oracle, _jobId);
    }
    
    /**
     * @notice Retrieve an oracle identity’s info.
     * @param _oracle The oracle’s address.
     * @param _jobId The Chainlink job ID.
     */
    function getOracleInfo(address _oracle, bytes32 _jobId) external view returns (
        bool isActive,
        int256 qualityScore,
        int256 timelinessScore,
        bytes32 jobId,
        uint256 fee
    ) {
        bytes32 key = _oracleKey(_oracle, _jobId);
        OracleInfo storage info = oracles[key];
        return (
            info.isActive,
            info.qualityScore,
            info.timelinessScore,
            info.jobId,
            info.fee
        );
    }
    
    /**
     * @notice Update reputation scores for an oracle identity.
     * @param _oracle The oracle’s address.
     * @param _jobId The Chainlink job ID.
     * @param qualityChange The change to the quality score.
     * @param timelinessChange The change to the timeliness score.
     */
    function updateScores(
        address _oracle, 
        bytes32 _jobId,
        int8 qualityChange,
        int8 timelinessChange
    ) external {
        bytes32 key = _oracleKey(_oracle, _jobId);
        require(approvedContracts[msg.sender].usedOracles[key], "Oracle not used by this contract");
        
        oracles[key].qualityScore += qualityChange;
        oracles[key].timelinessScore += timelinessChange;
        
        emit ScoreUpdated(_oracle, oracles[key].qualityScore, oracles[key].timelinessScore);
    }
    
    /**
     * @notice Calculate the weighted selection score for an oracle identity.
     * @param _oracle The oracle’s address.
     * @param _jobId The Chainlink job ID.
     * @param alpha Weighting factor (0–1000).
     */
    function getSelectionScore(address _oracle, bytes32 _jobId, uint256 alpha) public view returns (uint256) {
        bytes32 key = _oracleKey(_oracle, _jobId);
        if (!oracles[key].isActive) return 0;
        
        // Compute weighted score.
        int256 weightedScore = (int256(1000 - alpha) * oracles[key].qualityScore +
                                int256(alpha) * oracles[key].timelinessScore) / 1000;
        
        if (weightedScore < int256(MIN_SCORE_FOR_SELECTION)) return MIN_SCORE_FOR_SELECTION;
        if (weightedScore > int256(MAX_SCORE_FOR_SELECTION)) return MAX_SCORE_FOR_SELECTION;
        return uint256(weightedScore);
    }
    
    /**
     * @notice Select a list of oracle identities based on their weighted scores.
     * @param count The number of oracle identities to select.
     * @param alpha The weighting parameter.
     * @return An array of selected OracleIdentity structs.
     */
    function selectOracles(uint256 count, uint256 alpha) external view returns (OracleIdentity[] memory) {
        require(approvedContracts[msg.sender].isApproved, "Not approved to select oracles");
        
        // Count active oracle identities.
        uint256 activeCount = 0;
        for (uint256 i = 0; i < registeredOracles.length; i++) {
            OracleIdentity storage id = registeredOracles[i];
            bytes32 key = _oracleKey(id.oracle, id.jobId);
            if (oracles[key].isActive) {
                activeCount++;
            }
        }
        require(activeCount > 0, "No active oracles available");
        
        // Build an array of active oracle identities.
        OracleIdentity[] memory activeOracles = new OracleIdentity[](activeCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < registeredOracles.length; i++) {
            OracleIdentity storage id = registeredOracles[i];
            bytes32 key = _oracleKey(id.oracle, id.jobId);
            if (oracles[key].isActive) {
                activeOracles[idx] = id;
                idx++;
            }
        }
        
        // Compute weights.
        uint256 totalWeight = 0;
        uint256[] memory weights = new uint256[](activeCount);
        for (uint256 i = 0; i < activeCount; i++) {
            weights[i] = getSelectionScore(activeOracles[i].oracle, activeOracles[i].jobId, alpha);
            totalWeight += weights[i];
        }
        
        // Select oracle identities using weighted random selection.
        OracleIdentity[] memory selectedOracles = new OracleIdentity[](count);
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
            // Fallback: if no selection, default to the first active oracle.
            if (selectedOracles[i].oracle == address(0)) {
                selectedOracles[i] = activeOracles[0];
            }
        }
        
        return selectedOracles;
    }
    
    /**
     * @notice Approve an external contract to use oracles.
     * @param contractAddress The address of the contract to approve.
     */
    function approveContract(address contractAddress) external onlyOwner {
        approvedContracts[contractAddress].isApproved = true;
        emit ContractApproved(contractAddress);
    }
    
    /**
     * @notice Remove an external contract’s approval.
     * @param contractAddress The address of the contract to remove.
     */
    function removeContract(address contractAddress) external onlyOwner {
        approvedContracts[contractAddress].isApproved = false;
        emit ContractRemoved(contractAddress);
    }
    
    /**
     * @notice Record that an approved contract has used a set of oracle identities.
     * @param _oracleIdentities The array of oracle identities used.
     */
    function recordUsedOracles(OracleIdentity[] calldata _oracleIdentities) external {
        require(approvedContracts[msg.sender].isApproved, "Not approved to record oracles");
        
        for (uint256 i = 0; i < _oracleIdentities.length; i++) {
            bytes32 key = _oracleKey(_oracleIdentities[i].oracle, _oracleIdentities[i].jobId);
            approvedContracts[msg.sender].usedOracles[key] = true;
        }
    }
}

