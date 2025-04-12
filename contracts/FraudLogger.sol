// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

contract FraudLogger {
    struct FraudRecord {
        bytes32 transactionHash;
        uint256 timestamp;
        uint256 confidenceScore; // 0-100 representing confidence percentage
        string metadata;
    }
    
    FraudRecord[] public fraudRecords;
    
    event FraudDetected(
        bytes32 indexed transactionHash,
        uint256 timestamp,
        uint256 confidenceScore,
        string metadata
    );
    
    function logFraud(
        bytes32 _transactionHash,
        uint256 _confidenceScore,
        string calldata _metadata
    ) external returns (uint256) {
        require(_confidenceScore <= 100, "Confidence score must be between 0-100");
        
        uint256 timestamp = block.timestamp;
        
        // Create new fraud record
        FraudRecord memory newRecord = FraudRecord(
            _transactionHash,
            timestamp,
            _confidenceScore,
            _metadata
        );
        
        // Add to storage
        fraudRecords.push(newRecord);
        
        // Emit event
        emit FraudDetected(
            _transactionHash,
            timestamp,
            _confidenceScore,
            _metadata
        );
        
        return fraudRecords.length - 1;
    }
    
    function getFraudCount() external view returns (uint256) {
        return fraudRecords.length;
    }
    
    function getFraudRecord(uint256 _index) external view returns (
        bytes32 transactionHash,
        uint256 timestamp,
        uint256 confidenceScore,
        string memory metadata
    ) {
        require(_index < fraudRecords.length, "Index out of bounds");
        
        FraudRecord memory record = fraudRecords[_index];
        
        return (
            record.transactionHash,
            record.timestamp,
            record.confidenceScore,
            record.metadata
        );
    }
}
