// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@chainlink/contracts/src/v0.8/ChainlinkClient.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ReputationKeeper.sol";

/**
 * @title ReputationAggregator
 * @notice A new aggregator that has the same external ABI as your old aggregator,
 *         but uses a ReputationKeeper under the hood for multi-oracle logic.
 *         The constructor is unchanged from the new aggregator code you gave.
 */
contract ReputationAggregator is ChainlinkClient, Ownable {
    using Chainlink for Chainlink.Request;

    // ------------------------------------------------------------------------
    // New aggregator logic configuration
    // (These are settable via setConfig and used in multi-oracle logic.)
    // ------------------------------------------------------------------------
    uint256 public oraclesToPoll;       // e.g. number of oracles to poll
    uint256 public requiredResponses;   // how many responses needed to finalize
    uint256 public clusterSize;         // used for cluster-based or outlier logic
    uint256 public responseTimeout;     // optional future usage

    // ------------------------------------------------------------------------
    // Storing a single “Chainlink oracle” address & job info
    // because the old front-end calls setChainlinkOracle(...) & getContractConfig().
    // You can still rely on multiple oracles via ReputationKeeper, but we keep
    // these fields for front-end compatibility.
    // ------------------------------------------------------------------------
    address public chainlinkOracle;
    bytes32 public chainlinkJobId;
    uint256 public chainlinkFee;

    // Reference to the ReputationKeeper contract
    ReputationKeeper public reputationKeeper;

    // ------------------------------------------------------------------------
    // OLD aggregator’s “public interface” variables & events
    // (All needed so that App.js can call them or parse logs.)
    // ------------------------------------------------------------------------

    // 1) The front end expects these events:
    event RequestAIEvaluation(bytes32 indexed requestId, string[] cids);
    event FulfillAIEvaluation(bytes32 indexed requestId, uint256[] likelihoods, string justificationCID);
    // event ChainlinkRequested(bytes32 indexed id);
    // event ChainlinkFulfilled(bytes32 indexed id);
    event Debug1(address linkToken, address oracle, uint256 fee, uint256 balance, bytes32 jobId);

    // 2) The front end calls these public functions:
    //   - requestAIEvaluation(string[])
    //   - getEvaluation(bytes32)
    //   - evaluations(bytes32)
    //   - setChainlinkToken(address)
    //   - setChainlinkOracle(address)
    //   - getContractConfig()

    // ------------------------------------------------------------------------
    // Response & Aggregation Structures
    // ------------------------------------------------------------------------
    struct Response {
        uint256[] likelihoods;
        string justificationCID;
        bytes32 requestId;   // operator-level ID
        bool included;
        uint256 timestamp;
        address operator;
    }

    struct AggregatedEvaluation {
        Response[] responses;
        uint256[] aggregatedLikelihoods;
        uint256 responseCount;
        uint256 expectedResponses;
        uint256 requiredResponses;
        uint256 clusterSize;
        bool isComplete;
        mapping(bytes32 => bool) requestIds;  // track operator-level request IDs
    }

    // aggregator-level (requestId) -> AggregatedEvaluation
    mapping(bytes32 => AggregatedEvaluation) public aggregatedEvaluations;

    // operator-level requestId -> aggregator-level requestId
    mapping(bytes32 => bytes32) public requestIdToAggregatorId;

    // ------------------------------------------------------------------------
    // NEW aggregator constructor (unchanged from your new aggregator code)
    // ------------------------------------------------------------------------
    constructor(address _link, address _reputationKeeper) Ownable(msg.sender) {
        _setChainlinkToken(_link);
        reputationKeeper = ReputationKeeper(_reputationKeeper);
        // Default config if desired
        oraclesToPoll = 4;
        requiredResponses = 3;
        clusterSize = 2;
        responseTimeout = 5 minutes;
    }

    // ------------------------------------------------------------------------
    // For “post-deployment” changes, or to override defaults:
    // e.g. aggregator.setConfig(4, 3, 2, 300)
    // ------------------------------------------------------------------------
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
        responseTimeout = _responseTimeout;
    }

    // ------------------------------------------------------------------------
    // OLD aggregator function: setChainlinkToken(address)
    // We simply expose `_setChainlinkToken` from ChainlinkClient so your UI won't break.
    // ------------------------------------------------------------------------
    function setChainlinkToken(address _link) external onlyOwner {
        _setChainlinkToken(_link);
    }

    // ------------------------------------------------------------------------
    // OLD aggregator function: setChainlinkOracle(address)
    // We store a single oracle & job to keep the front end happy,
    // even though multi-oracle logic uses ReputationKeeper under the hood.
    // ------------------------------------------------------------------------
    function setChainlinkOracle(address _oracle) external onlyOwner {
        chainlinkOracle = _oracle;
        chainlinkJobId = bytes32("DefaultJobId");
        chainlinkFee = 0.1 * 10**18; // e.g. 0.1 LINK
    }

    // ------------------------------------------------------------------------
    // (Optional) A debug function that fires the “Debug1” event
    // so the old front end can call it if it wants.
    // ------------------------------------------------------------------------
    function emitDebug1() external {
        uint256 linkBalance = LinkTokenInterface(_chainlinkTokenAddress()).balanceOf(address(this));
        emit Debug1(_chainlinkTokenAddress(), chainlinkOracle, chainlinkFee, linkBalance, chainlinkJobId);
    }

    // ------------------------------------------------------------------------
    // OLD aggregator main function:
    //   requestAIEvaluation(string[] memory cids)
    // This also uses the new aggregator logic with multi-oracle selection.
    // ------------------------------------------------------------------------
    function requestAIEvaluation(string[] memory cids) public returns (bytes32) {
        require(address(reputationKeeper) != address(0), "ReputationKeeper not set");
        require(cids.length > 0, "CIDs array must not be empty");

        // Let ReputationKeeper pick oracles
        address[] memory selectedOracles = reputationKeeper.selectOracles(oraclesToPoll);

        // Record oracles for scoring
        reputationKeeper.recordUsedOracles(selectedOracles);

        // aggregator-level request ID
        string memory cidsConcatenated = concatenateCids(cids);
        bytes32 aggregatorRequestId = keccak256(abi.encodePacked(
            block.timestamp,
            msg.sender,
            cidsConcatenated
        ));

        // Initialize the AggregatedEvaluation
        AggregatedEvaluation storage aggEval = aggregatedEvaluations[aggregatorRequestId];
        aggEval.expectedResponses = oraclesToPoll;
        aggEval.requiredResponses = requiredResponses;
        aggEval.clusterSize = clusterSize;
        aggEval.isComplete = false;

        // Send requests to each oracle
        for (uint256 i = 0; i < selectedOracles.length; i++) {
            address operator = selectedOracles[i];
            (bool isActive, , , bytes32 jobId, uint256 fee) = reputationKeeper.getOracleInfo(operator);
            require(isActive, "Selected oracle not active");

            // Build a unique operator-level request
            bytes32 operatorRequestId = _sendSingleOracleRequest(operator, jobId, fee, cidsConcatenated);

            requestIdToAggregatorId[operatorRequestId] = aggregatorRequestId;
            aggEval.requestIds[operatorRequestId] = true;
        }

        // Emit the old aggregator event
        emit RequestAIEvaluation(aggregatorRequestId, cids);
        return aggregatorRequestId;
    }

    // ------------------------------------------------------------------------
    // HELPER: send a single Chainlink request, also emit “ChainlinkRequested”
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

        // old aggregator’s event
        emit ChainlinkRequested(operatorRequestId);
        return operatorRequestId;
    }

    // ------------------------------------------------------------------------
    // CALLBACK from Chainlink node:
    //   old aggregator had “fulfill(...)” with the same signature
    // We also emit “ChainlinkFulfilled” to match old aggregator’s events.
    // ------------------------------------------------------------------------
    function fulfill(
        bytes32 _operatorRequestId,
        uint256[] memory likelihoods,
        string memory justificationCID
    ) public recordChainlinkFulfillment(_operatorRequestId) {
        require(likelihoods.length > 0, "Likelihoods array must not be empty");

        // aggregator-level request ID
        bytes32 aggregatorRequestId = requestIdToAggregatorId[_operatorRequestId];
        require(aggregatorRequestId != bytes32(0), "Unknown requestId");

        AggregatedEvaluation storage aggEval = aggregatedEvaluations[aggregatorRequestId];
        require(!aggEval.isComplete, "Aggregation already completed");
        require(aggEval.requestIds[_operatorRequestId], "Invalid requestId");

        // Store response
        Response memory newResp = Response({
            likelihoods: likelihoods,
            justificationCID: justificationCID,
            requestId: _operatorRequestId,
            included: true,
            timestamp: block.timestamp,
            operator: msg.sender
        });
        aggEval.responses.push(newResp);
        aggEval.responseCount++;

        // old aggregator’s “ChainlinkFulfilled” event
        emit ChainlinkFulfilled(_operatorRequestId);

        // finalize if we have enough
        if (aggEval.responseCount >= aggEval.requiredResponses) {
            _finalizeAggregation(aggregatorRequestId);
        }
    }

    // ------------------------------------------------------------------------
    // finalizeAggregation: pick best cluster, average, and emit final event
    // ------------------------------------------------------------------------
    function _finalizeAggregation(bytes32 aggregatorRequestId) internal {
        AggregatedEvaluation storage aggEval = aggregatedEvaluations[aggregatorRequestId];

        // cluster logic
        uint256[] memory clusterIndices = _findBestCluster(aggEval.responses);

        // aggregate
        aggEval.aggregatedLikelihoods = new uint256[](aggEval.responses[0].likelihoods.length);
        uint256 clusterCount = 0;

        for (uint256 i = 0; i < aggEval.responses.length; i++) {
            if (clusterIndices[i] == 1) {
                // included
                for (uint256 j = 0; j < aggEval.responses[i].likelihoods.length; j++) {
                    aggEval.aggregatedLikelihoods[j] += aggEval.responses[i].likelihoods[j];
                }
                clusterCount++;
                // Score oracle positively
                reputationKeeper.updateScore(aggEval.responses[i].operator, 1);
            } else {
                // excluded
                aggEval.responses[i].included = false;
                // Score oracle negatively
                reputationKeeper.updateScore(aggEval.responses[i].operator, -1);
            }
        }

        // average
        for (uint256 k = 0; k < aggEval.aggregatedLikelihoods.length; k++) {
            aggEval.aggregatedLikelihoods[k] /= clusterCount;
        }

        aggEval.isComplete = true;

        // Combine included justification CIDs for final event
        string memory combinedCIDs = "";
        bool first = true;
        for (uint256 m = 0; m < aggEval.responses.length; m++) {
            if (aggEval.responses[m].included) {
                if (!first) {
                    combinedCIDs = string(abi.encodePacked(combinedCIDs, ","));
                }
                combinedCIDs = string(abi.encodePacked(combinedCIDs, aggEval.responses[m].justificationCID));
                first = false;
            }
        }

        // old aggregator’s “FulfillAIEvaluation” event
        emit FulfillAIEvaluation(aggregatorRequestId, aggEval.aggregatedLikelihoods, combinedCIDs);
    }

    // ------------------------------------------------------------------------
    // Example cluster logic: pick the pair with smallest distance
    // (If you want something that uses "clusterSize" more flexibly, you can expand it.)
    // ------------------------------------------------------------------------
    function _findBestCluster(Response[] memory responses) internal pure returns (uint256[] memory) {
        require(responses.length >= 2, "Need at least 2 responses");
        
        uint256[] memory bestCluster = new uint256[](responses.length);
        uint256 bestDistance = type(uint256).max;

        // compare each pair’s distance
        for (uint256 i = 0; i < responses.length - 1; i++) {
            for (uint256 j = i + 1; j < responses.length; j++) {
                uint256 dist = _calculateDistance(responses[i].likelihoods, responses[j].likelihoods);
                if (dist < bestDistance) {
                    bestDistance = dist;
                    // mark these two as included
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
    // OLD aggregator function: getEvaluation(bytes32)
    //   => returns (uint256[] likelihoods, string justificationCID, bool exists)
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

        // combine included CIDs
        string memory finalCIDs = "";
        bool first = true;
        for (uint256 i = 0; i < aggEval.responses.length; i++) {
            if (aggEval.responses[i].included) {
                if (!first) {
                    finalCIDs = string(abi.encodePacked(finalCIDs, ","));
                }
                finalCIDs = string(abi.encodePacked(finalCIDs, aggEval.responses[i].justificationCID));
                first = false;
            }
        }
        return (aggEval.aggregatedLikelihoods, finalCIDs, aggEval.responseCount > 0);
    }

    // ------------------------------------------------------------------------
    // OLD aggregator function: evaluations(bytes32)
    //   => returns (uint256[] likelihoods, string justificationCID)
    // We just forward to getEvaluation(...) and discard the bool.
    // ------------------------------------------------------------------------
    function evaluations(bytes32 requestId) public view returns (uint256[] memory, string memory) {
        (uint256[] memory l, string memory j, ) = getEvaluation(requestId);
        return (l, j);
    }

    // ------------------------------------------------------------------------
    // OLD aggregator function: getContractConfig()
    //   => returns (address oracleAddr, address linkAddr, bytes32 jobId, uint256 fee)
    // We supply a single “chainlinkOracle”, plus the link token, job, fee.
    // ------------------------------------------------------------------------
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
    // HELPER: Concatenate CIDs with commas
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
    // UTILITY: withdraw LINK if needed
    // ------------------------------------------------------------------------
    function withdrawLink(address payable _to, uint256 _amount) external onlyOwner {
        LinkTokenInterface link = LinkTokenInterface(_chainlinkTokenAddress());
        require(link.transfer(_to, _amount), "LINK transfer failed");
    }
}

