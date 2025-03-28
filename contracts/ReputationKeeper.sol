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
        uint64[] classes; // <-- New field: list of classes (up to 5) supported by this oracle
    }

    // A single record of (qualityScore, timelinessScore).
    struct ScoreRecord {
        int256 qualityScore;
        int256 timelinessScore;
    }

    // Information about each oracle identity.
    struct OracleInfo {
        int256 qualityScore;    // Score based on clustering accuracy
        int256 timelinessScore; // Score based on response timeliness
        uint256 stakeAmount;    // Amount of VDKA tokens staked
        bool isActive;          // Whether oracle is currently active
        bytes32 jobId;          // The job ID (redundant but stored for convenience)
        uint256 fee;            // LINK fee required for this job
        uint256 callCount;      // Number of times this oracle has been called
        ScoreRecord[] recentScores; // Rolling history of scores
        
        // New fields for slashing/locking:
        uint256 lockedUntil;    // Timestamp until which the oracle is locked (cannot be unregistered)
        bool blocked;           // If true, oracle is blocked from selection

        uint64[] classes;       // <-- New field: classes for this oracle
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
    
    // The maximum number of historical score records to keep for each oracle.
    uint256 public maxScoreHistory = 10;

    uint256 public constant STAKE_REQUIREMENT = 100 * 10**18;  // 100 VDKA tokens
    uint256 public constant MAX_SCORE_FOR_SELECTION = 400;
    uint256 public constant MIN_SCORE_FOR_SELECTION = 1;
    
    // Configuration for slashing and locking.
    uint256 public slashAmountConfig = 10 * 10**18;  // 10 VDKA tokens (configurable)
    uint256 public lockDurationConfig = 2 hours;       // Lock period (configurable)
    int256 public severeThreshold = -40;               // Severe threshold (configurable)
    int256 public mildThreshold = -20;                 // Mild threshold (configurable)
    
    event OracleRegistered(address indexed oracle, bytes32 jobId, uint256 fee);
    event OracleDeregistered(address indexed oracle, bytes32 jobId);
    event ScoreUpdated(address indexed oracle, int256 newQualityScore, int256 newTimelinessScore);
    event OracleSlashed(address indexed oracle, bytes32 jobId, uint256 slashAmount, uint256 lockedUntil, bool blocked);
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
     * @param _oracle The address of the oracle.
     * @param _jobId The job identifier.
     * @param fee The fee required for this job.
     * @param _classes A vector of up to five 64-bit numbers representing the classes the oracle supports.
     */
    function registerOracle(address _oracle, bytes32 _jobId, uint256 fee, uint64[] memory _classes) external {
        bytes32 key = _oracleKey(_oracle, _jobId);
        require(!oracles[key].isActive, "Oracle already registered");
        require(fee > 0, "Fee must be greater than 0");
        require(_classes.length > 0, "At least one class must be provided");
        require(_classes.length <= 5, "A maximum of 5 classes allowed");
        
        require(
            msg.sender == owner() || msg.sender == IOracleOwner(_oracle).owner(),
            "Not authorized to register oracle"
        );
        
        // Transfer the stake from the registering party.
        verdiktaToken.transferFrom(msg.sender, address(this), STAKE_REQUIREMENT);
        
        // Initialize the oracle info.
        OracleInfo storage info = oracles[key];
        info.qualityScore = 0;
        info.timelinessScore = 0;
        info.stakeAmount = STAKE_REQUIREMENT;
        info.isActive = true;
        info.jobId = _jobId;
        info.fee = fee;
        info.callCount = 0;
        info.lockedUntil = 0; // initially not locked
        info.blocked = false; // initially not blocked
        info.classes = _classes; // Save the oracle classes
        
        // Record the identity if not already present.
        bool exists = false;
        for (uint256 i = 0; i < registeredOracles.length; i++) {
            if (registeredOracles[i].oracle == _oracle && registeredOracles[i].jobId == _jobId) {
                exists = true;
                break;
            }
        }
        if (!exists) {
            registeredOracles.push(OracleIdentity({
                oracle: _oracle, 
                jobId: _jobId,
                classes: _classes   // Save the classes in the identity
            }));
        }
        
        emit OracleRegistered(_oracle, _jobId, fee);
    }
    
    /**
     * @notice Deregister an oracle identity.
     * Requirements:
     * - The oracle must not be locked (i.e. block.timestamp must be past lockedUntil).
     */
    function deregisterOracle(address _oracle, bytes32 _jobId) external {
        bytes32 key = _oracleKey(_oracle, _jobId);
        OracleInfo storage info = oracles[key];
        require(info.isActive, "Oracle not registered");
        require(
            msg.sender == owner() || msg.sender == IOracleOwner(_oracle).owner(),
            "Not authorized to deregister oracle"
        );
        require(block.timestamp >= info.lockedUntil, "Oracle is locked and cannot be unregistered");
        
        // Return the staked tokens.
        verdiktaToken.transfer(msg.sender, info.stakeAmount);
        
        info.stakeAmount = 0;
        info.isActive = false;
        
        emit OracleDeregistered(_oracle, _jobId);
    }
    
    /**
     * @notice Retrieve an oracle identity's info.
     */
    function getOracleInfo(address _oracle, bytes32 _jobId)
        external
        view
        returns (
            bool isActive,
            int256 qualityScore,
            int256 timelinessScore,
            uint256 callCount,
            bytes32 jobId,
            uint256 fee,
            uint256 stakeAmount,
            uint256 lockedUntil,
            bool blocked
        )
    {
        bytes32 key = _oracleKey(_oracle, _jobId);
        OracleInfo storage info = oracles[key];
        return (
            info.isActive,
            info.qualityScore,
            info.timelinessScore,
            info.callCount,
            info.jobId,
            info.fee,
            info.stakeAmount,
            info.lockedUntil,
            info.blocked
        );
    }
    
    /**
     * @notice Update reputation scores for an oracle identity.
     * After updating the scores, this function checks for conditions to trigger
     * a lock (preventing unregistration) and, in severe cases, a slash and block.
     * It also checks if the full history (maxScoreHistory records) shows a monotonic worsening.
     */
    function updateScores(
        address _oracle, 
        bytes32 _jobId,
        int8 qualityChange,
        int8 timelinessChange
    ) external {
        bytes32 key = _oracleKey(_oracle, _jobId);
        require(approvedContracts[msg.sender].usedOracles[key], "Oracle not used by this contract");
        
        OracleInfo storage info = oracles[key];
        info.callCount++;
        info.qualityScore += qualityChange;
        info.timelinessScore += timelinessChange;

        // Record score history.
        info.recentScores.push(ScoreRecord({
            qualityScore: info.qualityScore,
            timelinessScore: info.timelinessScore
        }));
        if (info.recentScores.length > maxScoreHistory) {
            for (uint256 i = 0; i < info.recentScores.length - 1; i++) {
                info.recentScores[i] = info.recentScores[i + 1];
            }
            info.recentScores.pop();
        }
        
        // Only apply a new lock/penalty if any previous lock has expired.
        if (block.timestamp >= info.lockedUntil) {
            // Severe penalty: if either score is below the severe threshold.
            if (info.qualityScore < severeThreshold || info.timelinessScore < severeThreshold) {
                if (info.stakeAmount >= slashAmountConfig) {
                    info.stakeAmount -= slashAmountConfig;
                } else {
                    info.stakeAmount = 0;
                }
                info.lockedUntil = block.timestamp + lockDurationConfig;
                info.blocked = true;
                emit OracleSlashed(_oracle, _jobId, slashAmountConfig, info.lockedUntil, true);
            }
            // Mild penalty: if either score is below the mild threshold (but not below severe).
            else if (info.qualityScore < mildThreshold || info.timelinessScore < mildThreshold) {
                info.lockedUntil = block.timestamp + lockDurationConfig;
                info.blocked = false;
                emit OracleSlashed(_oracle, _jobId, 0, info.lockedUntil, false);
            }
        }
        
        // Check for full history monotonic worsening.
        if (info.recentScores.length == maxScoreHistory) {
            bool qualityWorsening = true;
            bool timelinessWorsening = true;
            for (uint256 i = 1; i < maxScoreHistory; i++) {
                if (info.recentScores[i].qualityScore >= info.recentScores[i - 1].qualityScore) {
                    qualityWorsening = false;
                }
                if (info.recentScores[i].timelinessScore >= info.recentScores[i - 1].timelinessScore) {
                    timelinessWorsening = false;
                }
            }
            if (qualityWorsening || timelinessWorsening) {
                if (info.stakeAmount >= slashAmountConfig) {
                    info.stakeAmount -= slashAmountConfig;
                } else {
                    info.stakeAmount = 0;
                }
                info.lockedUntil = block.timestamp + lockDurationConfig;
                info.blocked = true;
                emit OracleSlashed(_oracle, _jobId, slashAmountConfig, info.lockedUntil, true);
                // Clear the history so we don't apply this penalty repeatedly on the same data.
                delete info.recentScores;
            }
        }
        
        emit ScoreUpdated(_oracle, info.qualityScore, info.timelinessScore);
    }
    
    /**
     * @notice Calculate the weighted selection score for an oracle identity, with fee weighting.
     * Oracles that are blocked (and still within the lock period) are treated as having a score of 0.
     * @param _oracle The oracle address
     * @param _jobId The job ID
     * @param alpha The weight parameter for quality vs. timeliness (0-1000)
     * @param maxFee The maximum fee the user is willing to pay
     * @param estimatedBaseCost The estimated base cost for processing the request
     * @param maxFeeBasedScalingFactor The maximum scaling factor for fee weighting
     * @return The weighted selection score
     */
    function getSelectionScore(
        address _oracle,
        bytes32 _jobId,
        uint256 alpha,
        uint256 maxFee,
        uint256 estimatedBaseCost,
        uint256 maxFeeBasedScalingFactor
    ) public view returns (uint256) {
        bytes32 key = _oracleKey(_oracle, _jobId);
        OracleInfo storage info = oracles[key];
        
        // If oracle is blocked and still within lock period, return 0
        if (info.isActive && info.blocked && block.timestamp < info.lockedUntil) return 0;
        
        // Calculate the base weighted score from quality and timeliness
        int256 weightedScore = (int256(1000 - alpha) * info.qualityScore + int256(alpha) * info.timelinessScore) / 1000;
        
        // Apply bounds to the base score
        if (weightedScore < int256(MIN_SCORE_FOR_SELECTION)) {
            weightedScore = int256(MIN_SCORE_FOR_SELECTION);
        }
        if (weightedScore > int256(MAX_SCORE_FOR_SELECTION)) {
            weightedScore = int256(MAX_SCORE_FOR_SELECTION);
        }
        
        // Get the oracle's fee
        uint256 oracleFee = info.fee;
        
        // Calculate fee-weighting factor: max(min((maxFee-estimatedBaseCost)/(oracleFee-estimatedBaseCost), maxFeeBasedScalingFactor), 1)
        uint256 feeWeightingFactor = 1e18; // default is 1.0 in fixed point (18 decimals)
        
        // Only apply fee weighting if oracleFee > estimatedBaseCost to avoid division by zero
        if (oracleFee > estimatedBaseCost && maxFee > estimatedBaseCost) {
            // Calculate (maxFee-estimatedBaseCost)/(oracleFee-estimatedBaseCost) with fixed point math
            uint256 numerator = (maxFee - estimatedBaseCost) * 1e18;
            uint256 denominator = oracleFee - estimatedBaseCost;
            uint256 ratio = numerator / denominator;
            
            // Apply min(ratio, maxFeeBasedScalingFactor * 1e18)
            uint256 maxScaling = maxFeeBasedScalingFactor * 1e18;
            if (ratio > maxScaling) {
                feeWeightingFactor = maxScaling;
            } else if (ratio > 1e18) {
                feeWeightingFactor = ratio;
            }
            // Note: if ratio <= 1e18, we keep the default value of 1e18 (representing 1.0)
        }
        
        // Apply fee weighting to the base score, using fixed point math
        uint256 finalScore = uint256(weightedScore) * feeWeightingFactor / 1e18;
        
        return finalScore;
    }
    
    /**
     * @notice Select a list of oracle identities based on their weighted scores, including fee weighting.
     * Oracles that are currently blocked (and locked) are excluded.
     * @param count Number of oracles to select
     * @param alpha Weight parameter for quality vs. timeliness (0-1000)
     * @param maxFee Maximum fee the user is willing to pay
     * @param estimatedBaseCost Estimated base cost for processing the request
     * @param maxFeeBasedScalingFactor Maximum scaling factor for fee weighting
     * @param requestedClass The class (a 64-bit number) that the caller wants the oracle to support
     * @return Array of selected oracle identities
     */
    function selectOracles(
        uint256 count,
        uint256 alpha,
        uint256 maxFee,
        uint256 estimatedBaseCost,
        uint256 maxFeeBasedScalingFactor,
        uint64 requestedClass   // <-- New parameter for filtering by class
    ) external view returns (OracleIdentity[] memory) {
        require(approvedContracts[msg.sender].isApproved, "Not approved to select oracles");
        require(estimatedBaseCost < maxFee, "Base cost must be less than max fee");
        require(maxFeeBasedScalingFactor >= 1, "Max scaling factor must be at least 1");
        
        uint256 activeCount = 0;
        for (uint256 i = 0; i < registeredOracles.length; i++) {
            OracleIdentity storage id = registeredOracles[i];
            bytes32 key = _oracleKey(id.oracle, id.jobId);
            if (
                oracles[key].isActive &&
                oracles[key].fee <= maxFee &&
                (!(oracles[key].blocked && block.timestamp < oracles[key].lockedUntil)) &&
                _hasClass(id.classes, requestedClass)
            ) {
                activeCount++;
            }
        }
        require(activeCount > 0, "No active oracles available with fee <= maxFee and requested class");
        
        OracleIdentity[] memory activeOracles = new OracleIdentity[](activeCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < registeredOracles.length; i++) {
            OracleIdentity storage id = registeredOracles[i];
            bytes32 key = _oracleKey(id.oracle, id.jobId);
            if (
                oracles[key].isActive &&
                oracles[key].fee <= maxFee &&
                (!(oracles[key].blocked && block.timestamp < oracles[key].lockedUntil)) &&
                _hasClass(id.classes, requestedClass)
            ) {
                activeOracles[idx] = id;
                idx++;
            }
        }
        
        uint256 totalWeight = 0;
        uint256[] memory weights = new uint256[](activeCount);
        for (uint256 i = 0; i < activeCount; i++) {
            weights[i] = getSelectionScore(
                activeOracles[i].oracle,
                activeOracles[i].jobId,
                alpha,
                maxFee,
                estimatedBaseCost,
                maxFeeBasedScalingFactor
            );
            totalWeight += weights[i];
        }
        
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
            if (selectedOracles[i].oracle == address(0)) {
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
    
    function recordUsedOracles(OracleIdentity[] calldata _oracleIdentities) external {
        require(approvedContracts[msg.sender].isApproved, "Not approved to record oracles");
        for (uint256 i = 0; i < _oracleIdentities.length; i++) {
            bytes32 key = _oracleKey(_oracleIdentities[i].oracle, _oracleIdentities[i].jobId);
            approvedContracts[msg.sender].usedOracles[key] = true;
        }
    }
    
    function setMaxScoreHistory(uint256 _maxScoreHistory) external onlyOwner {
        require(_maxScoreHistory > 0, "maxScoreHistory must be > 0");
        maxScoreHistory = _maxScoreHistory;
    }
    
    function getRecentScores(address _oracle, bytes32 _jobId)
        external
        view
        returns (ScoreRecord[] memory)
    {
        bytes32 key = _oracleKey(_oracle, _jobId);
        OracleInfo storage info = oracles[key];
        uint256 len = info.recentScores.length;
        ScoreRecord[] memory scores = new ScoreRecord[](len);
        for (uint256 i = 0; i < len; i++) {
            scores[i] = info.recentScores[i];
        }
        return scores;
    }
    
    // Owner setters for slashing configuration.
    function setSlashAmount(uint256 _slashAmount) external onlyOwner {
        slashAmountConfig = _slashAmount;
    }
    
    function setLockDuration(uint256 _lockDuration) external onlyOwner {
        lockDurationConfig = _lockDuration;
    }
    
    function setSevereThreshold(int256 _threshold) external onlyOwner {
        severeThreshold = _threshold;
    }
    
    function setMildThreshold(int256 _threshold) external onlyOwner {
        mildThreshold = _threshold;
    }

    /**
     * @notice Updates the reference to the VerdiktaToken contract
     * @param _newVerdiktaToken The address of the new VerdiktaToken contract
     */
    function setVerdiktaToken(address _newVerdiktaToken) external onlyOwner {
        require(_newVerdiktaToken != address(0), "Invalid token address");
        verdiktaToken = VerdiktaToken(_newVerdiktaToken);
    }

    // Return the count of registered oracles.
    function getRegisteredOraclesCount() external view returns (uint256) {
        return registeredOracles.length;
    }

    // ------------------------------------------------------------------------
    // Internal helper: Check if the given classes array contains the requested class.
    // ------------------------------------------------------------------------
    function _hasClass(uint64[] memory classes, uint64 requestedClass) internal pure returns (bool) {
        for (uint256 i = 0; i < classes.length; i++) {
            if (classes[i] == requestedClass) {
                return true;
            }
        }
        return false;
    }

    function getOracleClasses(uint256 index) public view returns (uint64[] memory) {
        require(index < registeredOracles.length, "Index out of bounds");
        return registeredOracles[index].classes;
    }

    function getOracleClassesByKey(address _oracle, bytes32 _jobId) public view returns (uint64[] memory) {
        for (uint256 i = 0; i < registeredOracles.length; i++) {
            if (registeredOracles[i].oracle == _oracle && registeredOracles[i].jobId == _jobId) {
                return registeredOracles[i].classes;
            }
        }
        revert("Oracle not found");
    }


}
 
