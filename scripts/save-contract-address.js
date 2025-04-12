const fs = require('fs');
const path = require('path');

// Get contract artifacts
const FraudLogger = require('../build/contracts/FraudLogger.json');

// Extract address of deployed contract
const contractAddress = FraudLogger.networks[Object.keys(FraudLogger.networks)[0]].address;

// Path to save address
const addressPath = path.join(__dirname, '..', 'api', 'contract_address.txt');

// Save address to file
fs.writeFileSync(addressPath, contractAddress);

console.log(`Contract address saved to ${addressPath}`);
console.log(`Contract address: ${contractAddress}`);
