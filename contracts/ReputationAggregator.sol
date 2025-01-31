// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@chainlink/contracts/src/v0.8/ChainlinkClient.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ReputationKeeper.sol";

contract ReputationAggregator is ChainlinkClient, Ownable {
    using Chainlink for Chainlink.Request;
    
    struct Response {
        uint256[] likelihoods;
        string justificationCID;
        bytes32 requestId;
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
        mapping(bytes32 => bool) requestIds;
        mapping(address => bool) respondedOracles;
    }
    
    ReputationKeeper public reputationKeeper;
    mapping(bytes32 => AggregatedEvaluation) public aggregatedEvaluations;
    mapping(bytes32 => bytes32) public requestIdToAggregatorId;
    
    uint256 public oraclesToPoll = 4;      // Default 4
    uint256 public requiredResponses = 3;   // Default 3
    uint256 public clusterSize = 2;        // Default 2
    uint256 public responseTimeout = 5 minutes;
    
    event ConfigUpdated(uint256 oraclesToPoll, uint256 requiredResponses, uint256 clusterSize);
    event RequestAIEvaluation(bytes32 indexed aggregatorRequestId, string[] cids);
    event OracleRequestSent(bytes32 indexed aggregatorRequestId, bytes32 indexed oracleRequestId, address operator);
    event OracleResponseReceived(bytes32 indexed aggregatorRequestId, bytes32 indexed oracleRequestId);
    event AggregationCompleted(bytes32 indexed aggregatorRequestId, uint256[] aggregatedLikelihoods);
    event OracleScored(address indexed operator, int8 score);
    
    constructor(
        address _link,
        address _reputationKeeper
    ) Ownable(msg.sender) {
        _setChainlinkToken(_link);
        reputationKeeper = ReputationKeeper(_reputationKeeper);
    }
    
    function setConfig(
        uint256 _oraclesToPoll,
        uint256 _requiredResponses,
        uint256 _clusterSize,
        uint256 _responseTimeout
    ) external onlyOwner {
        require(_oraclesToPoll >= _requiredResponses, "Invalid oracle counts");
        require(_requiredResponses >= _clusterSize, "Invalid cluster size");
        require(_responseTimeout > 0, "Invalid timeout");
        
        oraclesToPoll = _oraclesToPoll;
        requiredResponses = _requiredResponses;
        clusterSize = _clusterSize;
        responseTimeout = _responseTimeout;
        
        emit ConfigUpdated(_oraclesToPoll, _requiredResponses, _clusterSize);
    }
    



 
    function requestAIEvaluation(string[] memory cids) external returns (bytes32) {
        require(cids.length > 0, "CIDs array must not be empty");
        
        // Get random oracles from reputation keeper
        address[] memory selectedOracles = reputationKeeper.selectOracles(oraclesToPoll);

        // Record the selected oracles
        reputationKeeper.recordUsedOracles(selectedOracles);
        
        // Generate aggregator request ID
        string memory cidsConcatenated = concatenateCids(cids);
        bytes32 aggregatorRequestId = keccak256(abi.encodePacked(
            block.timestamp,
            msg.sender,
            cidsConcatenated
        ));
        
        // Initialize aggregation
        aggregatedEvaluations[aggregatorRequestId].expectedResponses = oraclesToPoll;
        aggregatedEvaluations[aggregatorRequestId].requiredResponses = requiredResponses;
        aggregatedEvaluations[aggregatorRequestId].clusterSize = clusterSize;
        aggregatedEvaluations[aggregatorRequestId].isComplete = false;
        
        // Send requests to selected oracles
        for (uint256 i = 0; i < selectedOracles.length; i++) {
            address operator = selectedOracles[i];
            
            // Get oracle config from keeper
            (bool isActive, , , bytes32 jobId, uint256 fee) = reputationKeeper.getOracleInfo(operator);
            require(isActive, "Selected oracle not active");
            
            bytes32 oracleRequestId = sendOracleRequest(
                operator,
                jobId,
                fee,
                cidsConcatenated,
                aggregatorRequestId
            );
            
            requestIdToAggregatorId[oracleRequestId] = aggregatorRequestId;
            aggregatedEvaluations[aggregatorRequestId].requestIds[oracleRequestId] = true;
            
            emit OracleRequestSent(aggregatorRequestId, oracleRequestId, operator);
        }
        
        emit RequestAIEvaluation(aggregatorRequestId, cids);
        return aggregatorRequestId;
    }
    
    // Rest of the functions remain the same...
    function fulfill(bytes32 _requestId, uint256[] memory likelihoods, string memory justificationCID) public recordChainlinkFulfillment(_requestId) {
        // Existing fulfill implementation...
        require(likelihoods.length > 0, "Likelihoods array must not be empty");
        
        bytes32 aggregatorRequestId = requestIdToAggregatorId[_requestId];
        require(aggregatorRequestId != bytes32(0), "Unknown request ID");
        
        AggregatedEvaluation storage aggEval = aggregatedEvaluations[aggregatorRequestId];
        require(!aggEval.isComplete, "Aggregation already completed");
        require(aggEval.requestIds[_requestId], "Invalid request ID");
        require(!aggEval.respondedOracles[msg.sender], "Oracle already responded");
        
        Response memory newResponse = Response({
            likelihoods: likelihoods,
            justificationCID: justificationCID,
            requestId: _requestId,
            included: true,
            timestamp: block.timestamp,
            operator: msg.sender
        });
        
        aggEval.responses.push(newResponse);
        aggEval.responseCount++;
        aggEval.respondedOracles[msg.sender] = true;
        
        emit OracleResponseReceived(aggregatorRequestId, _requestId);
        
        if (aggEval.responseCount >= aggEval.requiredResponses) {
            finalizeAggregation(aggregatorRequestId);
        }
    }
















    function calculateDistance(uint256[] memory a, uint256[] memory b) internal pure returns (uint256) {
        require(a.length == b.length, "Arrays must be same length");
        uint256 sumSquares = 0;
        for (uint256 i = 0; i < a.length; i++) {
            if (a[i] > b[i]) {
                sumSquares += (a[i] - b[i]) * (a[i] - b[i]);
            } else {
                sumSquares += (b[i] - a[i]) * (b[i] - a[i]);
            }
        }
        return sumSquares;
    }
















    function findBestCluster(Response[] memory responses) internal pure returns (uint256[] memory) {
        require(responses.length >= 2, "Need at least 2 responses");
        
        uint256[] memory bestCluster = new uint256[](responses.length);
        uint256 bestClusterDistance = type(uint256).max;
        
        // Try each possible combination of responses
        for (uint256 i = 0; i < responses.length - 1; i++) {
            for (uint256 j = i + 1; j < responses.length; j++) {
                uint256 distance = calculateDistance(
                    responses[i].likelihoods,
                    responses[j].likelihoods
                );
                
                if (distance < bestClusterDistance) {
                    bestClusterDistance = distance;
                    // Mark these two as part of best cluster
                    for (uint256 k = 0; k < responses.length; k++) {
                        bestCluster[k] = (k == i || k == j) ? 1 : 0;
                    }
                }
            }
        }
        
        return bestCluster;
    }
    
    function finalizeAggregation(bytes32 aggregatorRequestId) internal {
        AggregatedEvaluation storage aggEval = aggregatedEvaluations[aggregatorRequestId];
        
        // Find best cluster
        uint256[] memory clusterIndices = findBestCluster(aggEval.responses);
        
        // Initialize aggregated likelihoods array
        aggEval.aggregatedLikelihoods = new uint256[](aggEval.responses[0].likelihoods.length);
        uint256 clusterCount = 0;
        
        // Calculate average of clustered responses and update oracle scores
        for (uint256 i = 0; i < aggEval.responses.length; i++) {
            if (clusterIndices[i] == 1) {
                // Add to cluster average
                for (uint256 j = 0; j < aggEval.responses[i].likelihoods.length; j++) {
                    aggEval.aggregatedLikelihoods[j] += aggEval.responses[i].likelihoods[j];
                }
                clusterCount++;
                
                // Score oracle positively
                reputationKeeper.updateScore(aggEval.responses[i].operator, 1);
                emit OracleScored(aggEval.responses[i].operator, 1);
            } else {
                // Score oracle negatively if they responded but weren't in cluster
                if (aggEval.responses[i].timestamp > 0) {
                    reputationKeeper.updateScore(aggEval.responses[i].operator, -1);
                    emit OracleScored(aggEval.responses[i].operator, -1);
                }
                aggEval.responses[i].included = false;
            }
        }
        
        // Calculate final averages
        for (uint256 i = 0; i < aggEval.aggregatedLikelihoods.length; i++) {
            aggEval.aggregatedLikelihoods[i] = aggEval.aggregatedLikelihoods[i] / clusterCount;
        }
        
        aggEval.isComplete = true;
        emit AggregationCompleted(aggregatorRequestId, aggEval.aggregatedLikelihoods);
    }

function bytes32ToString(bytes32 _bytes32) internal pure returns (string memory) {
    // Nibble-to-hex lookup table
    bytes memory hexChars = "0123456789abcdef";

    // Each of the 32 bytes => 2 hex characters => 64-length array
    bytes memory result = new bytes(64);

    for (uint256 i = 0; i < 32; i++) {
        // Extract the i-th byte from _bytes32
        uint8 b = uint8(_bytes32[i]);

        // High nibble (top 4 bits of b)
        result[2 * i]     = hexChars[b >> 4];

        // Low nibble (lower 4 bits of b)
        result[2 * i + 1] = hexChars[b & 0x0f];
    }

    return string(result);
}
   
 
function sendOracleRequest(
    address operator,
    bytes32 jobId,
    uint256 fee,
    string memory cidsConcatenated,
    bytes32 aggregatorRequestId
) internal returns (bytes32) {
    Chainlink.Request memory request = _buildOperatorRequest(jobId, this.fulfill.selector);
    request._add("cid", cidsConcatenated);
    request._add("aggregatorRequestId", toHexString(uint256(aggregatorRequestId)));
    return _sendOperatorRequestTo(operator, request, fee);
}

function toHexString(uint256 value) internal pure returns (string memory) {
    if (value == 0) {
        return "0x00";
    }
    
    bytes memory buffer = new bytes(64);
    uint256 length = 0;
    
    for (uint256 i = 0; i < 32; i++) {
        uint8 byte_val = uint8((value >> (8 * (31 - i))) & 0xFF);
        uint8 hi = byte_val >> 4;
        uint8 lo = byte_val & 0x0F;
        
        // Convert hi to ASCII
        buffer[length++] = bytes1(hi + (hi < 10 ? 48 : 87));
        // Convert lo to ASCII
        buffer[length++] = bytes1(lo + (lo < 10 ? 48 : 87));
    }
    
    // Create result with "0x" prefix
    bytes memory result = new bytes(length + 2);
    result[0] = bytes1("0");
    result[1] = bytes1("x");
    
    // Copy hex digits
    for (uint256 i = 0; i < length; i++) {
        result[i + 2] = buffer[i];
    }
    
    return string(result);
}
    
    function concatenateCids(string[] memory cids) internal pure returns (string memory) {
        bytes memory concatenatedCids;
        for (uint256 i = 0; i < cids.length; i++) {
            concatenatedCids = abi.encodePacked(concatenatedCids, cids[i]);
            if (i < cids.length - 1) {
                concatenatedCids = abi.encodePacked(concatenatedCids, ",");
            }
        }
        return string(concatenatedCids);
    }
    
    function getEvaluation(bytes32 aggregatorRequestId) external view returns (
        uint256[] memory likelihoods,
        string memory justificationCID,
        bool exists
    ) {
        AggregatedEvaluation storage aggEval = aggregatedEvaluations[aggregatorRequestId];
        
        string memory concatenatedCIDs = "";
        bool isFirst = true;
        
        for (uint256 i = 0; i < aggEval.responses.length; i++) {
            if (aggEval.responses[i].included) {
                if (!isFirst) {
                    concatenatedCIDs = string(
                        abi.encodePacked(concatenatedCIDs, ",")
                    );
                }
                concatenatedCIDs = string(
                    abi.encodePacked(concatenatedCIDs, aggEval.responses[i].justificationCID)
                );
                isFirst = false;
            }
        }
        
        return (
            aggEval.aggregatedLikelihoods,
            concatenatedCIDs,
            aggEval.responseCount > 0
        );
    }





    function getContractConfig() public view returns (
        address oracleAddr,
        address linkAddr,
        bytes32 jobid,
        uint256 fee
    ) {
        // Get first active oracle from reputation keeper
        address[] memory oracles = reputationKeeper.selectOracles(1);
        require(oracles.length > 0, "No active oracle found");
        
        (bool isActive, , , bytes32 jobId, uint256 fee_) = reputationKeeper.getOracleInfo(oracles[0]);
        require(isActive, "Selected oracle not active");
        
        return (
            oracles[0],
            _chainlinkTokenAddress(),
            jobId,
            fee_
        );
    }




    function withdrawLink(address payable _to, uint256 _amount) external onlyOwner {
        require(_to != address(0), "Invalid recipient address");
        LinkTokenInterface link = LinkTokenInterface(_chainlinkTokenAddress());
        require(link.transfer(_to, _amount), "Unable to transfer");
    }
}
