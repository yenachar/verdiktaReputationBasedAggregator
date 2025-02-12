// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@chainlink/contracts/src/v0.8/ChainlinkClient.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ReputationKeeper.sol";

/**
 * @title ReputationAggregator
 * @notice Aggregates responses from Chainlink oracles and updates reputation scores.
 *         Uses composite oracle identities (oracle address and job ID) from ReputationKeeper.
 */
contract ReputationAggregator is ChainlinkClient, Ownable {
    using Chainlink for Chainlink.Request;

    // ------------------------------------------------------------------------
    // Configuration
    // ------------------------------------------------------------------------
    uint256 public oraclesToPoll;       // Total oracles to poll (M)
    uint256 public requiredResponses;   // First N responses to consider (N)
    uint256 public clusterSize;         // Cluster size (P)
    uint256 public responseTimeoutSeconds = 300; // (not used for scoring)
    uint256 public alpha = 500;         // Reputation weight

    // ------------------------------------------------------------------------
    // Single “Chainlink oracle” info for front-end compatibility
    // ------------------------------------------------------------------------
    address public chainlinkOracle;
    bytes32 public chainlinkJobId;
    uint256 public chainlinkFee;

    // Reference to the ReputationKeeper contract
    ReputationKeeper public reputationKeeper;

    // ------------------------------------------------------------------------
    // Public events
    // ------------------------------------------------------------------------
    event RequestAIEvaluation(bytes32 indexed requestId, string[] cids);
    event FulfillAIEvaluation(bytes32 indexed requestId, uint256[] aggregatedLikelihoods, string combinedJustificationCIDs);
    event Debug1(address linkToken, address oracle, uint256 fee, uint256 balance, bytes32 jobId);

    // ------------------------------------------------------------------------
    // Structures
    // ------------------------------------------------------------------------
    // Modified response includes the oracle's jobId.
    struct Response {
        uint256[] likelihoods;
        string justificationCID;
        bytes32 requestId;
        bool selected;       // true if among the first N responses
        uint256 timestamp;
        address operator;
        uint256 pollIndex;   // Which poll slot (0..M-1) this response corresponds to
        bytes32 jobId;       // The job ID associated with the oracle
    }

    // Aggregated evaluation for a given aggregator-level request.
    struct AggregatedEvaluation {
        Response[] responses;
        uint256[] aggregatedLikelihoods;
        uint256 responseCount;
        uint256 expectedResponses;
        uint256 requiredResponses;
        uint256 clusterSize;
        bool isComplete;
        mapping(bytes32 => bool) requestIds;  // Track valid request IDs
        // Instead of just addresses, record full oracle identities.
        ReputationKeeper.OracleIdentity[] polledOracles;
    }

    // Mapping from aggregator-level requestId to its evaluation.
    mapping(bytes32 => AggregatedEvaluation) public aggregatedEvaluations;
    // Mapping from a Chainlink operator request id to aggregator request id.
    mapping(bytes32 => bytes32) public requestIdToAggregatorId;
    // Mapping from a Chainlink operator request id to the poll slot index.
    mapping(bytes32 => uint256) public requestIdToPollIndex;

    // ------------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------------
    constructor(address _link, address _reputationKeeper) Ownable(msg.sender) {
        _setChainlinkToken(_link);
        reputationKeeper = ReputationKeeper(_reputationKeeper);
        // Default configuration values:
        oraclesToPoll = 4;
        requiredResponses = 3;
        clusterSize = 2;
        responseTimeoutSeconds = 5 minutes;
    }

    // ------------------------------------------------------------------------
    // Setters and getters for configuration
    // ------------------------------------------------------------------------
    function setResponseTimeout(uint256 _timeoutSeconds) external onlyOwner {
        responseTimeoutSeconds = _timeoutSeconds;
    }

    function setAlpha(uint256 _alpha) external onlyOwner {
        require(_alpha <= 1000, "Alpha must be between 0 and 1000");
        alpha = _alpha;
    }

    function getAlpha() external view returns (uint256) {
        return alpha;
    }

    function setConfig(
        uint256 _oraclesToPoll,
        uint256 _requiredResponses,
        uint256 _clusterSize,
        uint256 _responseTimeout
    ) external onlyOwner {
        require(_oraclesToPoll >= _requiredResponses, "Invalid poll vs. required");
        require(_requiredResponses >= _clusterSize, "Invalid cluster size");
        require(_responseTimeout > 0, "Invalid timeout");

        oraclesToPoll = _oraclesToPoll;
        requiredResponses = _requiredResponses;
        clusterSize = _clusterSize;
        responseTimeoutSeconds = _responseTimeout;
    }

    // ------------------------------------------------------------------------
    // Expose Chainlink token setter
    // ------------------------------------------------------------------------
    function setChainlinkToken(address _link) external onlyOwner {
        _setChainlinkToken(_link);
    }

    // ------------------------------------------------------------------------
    // Set a single Chainlink oracle (for front-end compatibility)
    // ------------------------------------------------------------------------
    function setChainlinkOracle(address _oracle) external onlyOwner {
        chainlinkOracle = _oracle;
        chainlinkJobId = bytes32("DefaultJobId");
        chainlinkFee = 0.1 * 10**18; // e.g., 0.1 LINK
    }

    // ------------------------------------------------------------------------
    // Debug function
    // ------------------------------------------------------------------------
    function emitDebug1() external {
        uint256 linkBalance = LinkTokenInterface(_chainlinkTokenAddress()).balanceOf(address(this));
        emit Debug1(_chainlinkTokenAddress(), chainlinkOracle, chainlinkFee, linkBalance, chainlinkJobId);
    }

    // ------------------------------------------------------------------------
    // requestAIEvaluation: Initiates oracle requests and sets up aggregation.
    // ------------------------------------------------------------------------
    function requestAIEvaluation(string[] memory cids) public returns (bytes32) {
        require(address(reputationKeeper) != address(0), "ReputationKeeper not set");
        require(cids.length > 0, "CIDs array must not be empty");

        // Select oracles using the current alpha value.
        // This returns composite oracle identities.
        ReputationKeeper.OracleIdentity[] memory selectedOracles = reputationKeeper.selectOracles(oraclesToPoll, alpha);
        reputationKeeper.recordUsedOracles(selectedOracles);

        // Concatenate the CIDs.
        string memory cidsConcatenated = concatenateCids(cids);
        bytes32 aggregatorRequestId = keccak256(abi.encodePacked(
            block.timestamp,
            msg.sender,
            cidsConcatenated
        ));

        AggregatedEvaluation storage aggEval = aggregatedEvaluations[aggregatorRequestId];
        aggEval.expectedResponses = oraclesToPoll;
        aggEval.requiredResponses = requiredResponses;
        aggEval.clusterSize = clusterSize;
        aggEval.isComplete = false;

        // For each selected oracle identity (each poll slot), record it and send a request.
        for (uint256 i = 0; i < selectedOracles.length; i++) {
            // Record this poll slot with full identity.
            aggEval.polledOracles.push(selectedOracles[i]);

            address operator = selectedOracles[i].oracle;
            bytes32 jobIdForOracle = selectedOracles[i].jobId;
            (bool isActive, , , bytes32 jobIdReturned, uint256 fee) = reputationKeeper.getOracleInfo(operator, jobIdForOracle);
            require(isActive, "Selected oracle not active");

            bytes32 operatorRequestId = _sendSingleOracleRequest(operator, jobIdReturned, fee, cidsConcatenated);
            requestIdToAggregatorId[operatorRequestId] = aggregatorRequestId;
            // Record the poll slot index (position in polledOracles array).
            requestIdToPollIndex[operatorRequestId] = aggEval.polledOracles.length - 1;
            aggEval.requestIds[operatorRequestId] = true;
        }

        emit RequestAIEvaluation(aggregatorRequestId, cids);
        return aggregatorRequestId;
    }

    // ------------------------------------------------------------------------
    // Helper: send a single Chainlink request.
    // ------------------------------------------------------------------------
    function _sendSingleOracleRequest(
        address operator,
        bytes32 jobId,
        uint256 fee,
        string memory cidsConcatenated
    ) internal returns (bytes32) {
        Chainlink.Request memory req = _buildOperatorRequest(jobId, this.fulfill.selector);
        req._add("cid", cidsConcatenated);
        bytes32 operatorRequestId = _sendOperatorRequestTo(operator, req, fee);
        return operatorRequestId;
    }

    // ------------------------------------------------------------------------
    // fulfill: Callback from Chainlink node.
    // ------------------------------------------------------------------------
    function fulfill(
        bytes32 _operatorRequestId,
        uint256[] memory likelihoods,
        string memory justificationCID
    ) public recordChainlinkFulfillment(_operatorRequestId) {
        require(likelihoods.length > 0, "Likelihoods array must not be empty");

        bytes32 aggregatorRequestId = requestIdToAggregatorId[_operatorRequestId];
        require(aggregatorRequestId != bytes32(0), "Unknown requestId");

        AggregatedEvaluation storage aggEval = aggregatedEvaluations[aggregatorRequestId];
        require(!aggEval.isComplete, "Aggregation already completed");
        require(aggEval.requestIds[_operatorRequestId], "Invalid requestId");

        // Get the poll slot index for this response.
        uint256 pollIndex = requestIdToPollIndex[_operatorRequestId];
        // Retrieve the corresponding oracle identity.
        ReputationKeeper.OracleIdentity memory oracleIdentity = aggEval.polledOracles[pollIndex];

        // Mark this response as selected if it is among the first N responses.
        bool selected = (aggEval.responses.length < aggEval.requiredResponses);

        Response memory newResp = Response({
            likelihoods: likelihoods,
            justificationCID: justificationCID,
            requestId: _operatorRequestId,
            selected: selected,
            timestamp: block.timestamp,
            operator: msg.sender,
            pollIndex: pollIndex,
            jobId: oracleIdentity.jobId
        });
        aggEval.responses.push(newResp);
        aggEval.responseCount++;

        emit ChainlinkFulfilled(_operatorRequestId);

        // Finalize aggregation once we've received the first N responses.
        if (aggEval.responseCount >= aggEval.requiredResponses) {
            _finalizeAggregation(aggregatorRequestId);
        }
    }

    // ------------------------------------------------------------------------
    // _finalizeAggregation: Processes responses and updates oracle reputations.
    // ------------------------------------------------------------------------
    function _finalizeAggregation(bytes32 aggregatorRequestId) internal {
        AggregatedEvaluation storage aggEval = aggregatedEvaluations[aggregatorRequestId];

        // 1. Build arrays of selected responses (the ones that are among the first N).
        uint256 selectedCount = 0;
        for (uint256 i = 0; i < aggEval.responses.length; i++) {
            if (aggEval.responses[i].selected) {
                selectedCount++;
            }
        }
        Response[] memory selectedResponses = new Response[](selectedCount);
        uint256[] memory selectedPollIndices = new uint256[](selectedCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < aggEval.responses.length; i++) {
            if (aggEval.responses[i].selected) {
                selectedResponses[idx] = aggEval.responses[i];
                selectedPollIndices[idx] = aggEval.responses[i].pollIndex;
                idx++;
            }
        }
        uint256[] memory clusterResults;
        if (selectedCount >= 2) {
            clusterResults = _findBestCluster(selectedResponses);
        } else {
            clusterResults = new uint256[](selectedCount);
            for (uint256 i = 0; i < selectedCount; i++) {
                clusterResults[i] = 0;
            }
        }

        // Initialize aggregatedLikelihoods.
        if (aggEval.responses.length > 0) {
            aggEval.aggregatedLikelihoods = new uint256[](aggEval.responses[0].likelihoods.length);
        }
        uint256 clusterCount = 0;

        // 2. Process each poll slot (0 .. M-1).
        uint256 m = aggEval.polledOracles.length;
        for (uint256 slot = 0; slot < m; slot++) {
            // Determine if a response exists for this poll slot.
            bool responded = false;
            uint256 respIndex = 0;
            for (uint256 j = 0; j < aggEval.responses.length; j++) {
                if (aggEval.responses[j].pollIndex == slot) {
                    responded = true;
                    respIndex = j;
                    break;
                }
            }
            if (responded) {
                Response memory resp = aggEval.responses[respIndex];
                // For a responded poll slot:
                // If the response is selected, check its clustering result.
                if (resp.selected) {
                    // Find the index in the selected responses array corresponding to this poll slot.
                    bool found = false;
                    uint256 selIndex = 0;
                    for (uint256 k = 0; k < selectedPollIndices.length; k++) {
                        if (selectedPollIndices[k] == slot) {
                            selIndex = k;
                            found = true;
                            break;
                        }
                    }
                    if (found) {
                        if (clusterResults[selIndex] == 1) {
                            // Response clustered.
                            for (uint256 j = 0; j < resp.likelihoods.length; j++) {
                                aggEval.aggregatedLikelihoods[j] += resp.likelihoods[j];
                            }
                            clusterCount++;
                            reputationKeeper.updateScores(resp.operator, resp.jobId, int8(1), int8(1));
                        } else {
                            // Selected but not clustered.
                            reputationKeeper.updateScores(resp.operator, resp.jobId, int8(-1), int8(0));
                        }
                    }
                } else {
                    // Response exists but not selected.
                    reputationKeeper.updateScores(resp.operator, resp.jobId, int8(0), int8(-1));
                }
            } else {
                // No response for this poll slot.
                ReputationKeeper.OracleIdentity memory id = aggEval.polledOracles[slot];
                reputationKeeper.updateScores(id.oracle, id.jobId, int8(0), int8(-1));
            }
        }

        // Average the aggregated likelihoods if any responses clustered.
        if (clusterCount > 0) {
            for (uint256 i = 0; i < aggEval.aggregatedLikelihoods.length; i++) {
                aggEval.aggregatedLikelihoods[i] /= clusterCount;
            }
        }

        // 3. Combine justification CIDs from clustered responses.
        string memory combinedCIDs = "";
        bool first = true;
        for (uint256 slot = 0; slot < m; slot++) {
            bool responded = false;
            uint256 respIndex = 0;
            for (uint256 j = 0; j < aggEval.responses.length; j++) {
                if (aggEval.responses[j].pollIndex == slot) {
                    responded = true;
                    respIndex = j;
                    break;
                }
            }
            if (responded) {
                Response memory resp = aggEval.responses[respIndex];
                if (resp.selected) {
                    bool found = false;
                    uint256 selIndex = 0;
                    for (uint256 k = 0; k < selectedPollIndices.length; k++) {
                        if (selectedPollIndices[k] == slot) {
                            selIndex = k;
                            found = true;
                            break;
                        }
                    }
                    if (found && clusterResults[selIndex] == 1) {
                        if (!first) {
                            combinedCIDs = string(abi.encodePacked(combinedCIDs, ","));
                        }
                        combinedCIDs = string(abi.encodePacked(combinedCIDs, resp.justificationCID));
                        first = false;
                    }
                }
            }
        }

        aggEval.isComplete = true;
        emit FulfillAIEvaluation(aggregatorRequestId, aggEval.aggregatedLikelihoods, combinedCIDs);
    }

    // ------------------------------------------------------------------------
    // Clustering logic: returns an array indicating which responses are in the best cluster.
    // ------------------------------------------------------------------------
    function _findBestCluster(Response[] memory responses) internal pure returns (uint256[] memory) {
        require(responses.length >= 2, "Need at least 2 responses");
        uint256[] memory bestCluster = new uint256[](responses.length);
        uint256 bestDistance = type(uint256).max;
        for (uint256 i = 0; i < responses.length - 1; i++) {
            for (uint256 j = i + 1; j < responses.length; j++) {
                uint256 dist = _calculateDistance(responses[i].likelihoods, responses[j].likelihoods);
                if (dist < bestDistance) {
                    bestDistance = dist;
                    for (uint256 x = 0; x < responses.length; x++) {
                        bestCluster[x] = (x == i || x == j) ? 1 : 0;
                    }
                }
            }
        }
        return bestCluster;
    }

    function _calculateDistance(uint256[] memory a, uint256[] memory b) internal pure returns (uint256) {
        require(a.length == b.length, "Array length mismatch");
        uint256 sum = 0;
        for (uint256 i = 0; i < a.length; i++) {
            uint256 diff = (a[i] > b[i]) ? a[i] - b[i] : b[i] - a[i];
            sum += diff * diff;
        }
        return sum;
    }

    // ------------------------------------------------------------------------
    // Evaluation getters (for front-end use)
    // ------------------------------------------------------------------------
    function getEvaluation(bytes32 requestId)
        public
        view
        returns (
            uint256[] memory likelihoods,
            string memory justificationCID,
            bool exists
        )
    {
        AggregatedEvaluation storage aggEval = aggregatedEvaluations[requestId];
        string memory finalCIDs = "";
        bool first = true;
        for (uint256 i = 0; i < aggEval.responses.length; i++) {
            if (aggEval.responses[i].selected) {
                if (!first) {
                    finalCIDs = string(abi.encodePacked(finalCIDs, ","));
                }
                finalCIDs = string(abi.encodePacked(finalCIDs, aggEval.responses[i].justificationCID));
                first = false;
            }
        }
        return (aggEval.aggregatedLikelihoods, finalCIDs, aggEval.responseCount > 0);
    }

    function evaluations(bytes32 requestId) public view returns (uint256[] memory, string memory) {
        (uint256[] memory l, string memory j, ) = getEvaluation(requestId);
        return (l, j);
    }

    function getContractConfig()
        public
        view
        returns (
            address oracleAddr,
            address linkAddr,
            bytes32 jobId,
            uint256 fee
        )
    {
        return (
            chainlinkOracle,
            _chainlinkTokenAddress(),
            chainlinkJobId,
            chainlinkFee
        );
    }

    // ------------------------------------------------------------------------
    // Helper: Concatenate CIDs with commas.
    // ------------------------------------------------------------------------
    function concatenateCids(string[] memory cids) internal pure returns (string memory) {
        bytes memory out;
        for (uint256 i = 0; i < cids.length; i++) {
            out = abi.encodePacked(out, cids[i]);
            if (i < cids.length - 1) {
                out = abi.encodePacked(out, ",");
            }
        }
        return string(out);
    }

    // ------------------------------------------------------------------------
    // Utility: withdraw LINK if needed.
    // ------------------------------------------------------------------------
    function withdrawLink(address payable _to, uint256 _amount) external onlyOwner {
        LinkTokenInterface link = LinkTokenInterface(_chainlinkTokenAddress());
        require(link.transfer(_to, _amount), "LINK transfer failed");
    }
}

