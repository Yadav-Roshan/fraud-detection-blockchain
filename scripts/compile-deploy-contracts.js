const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Directories
const buildDir = path.join(__dirname, '..', 'build', 'contracts');
const frontendDir = path.join(__dirname, '..', 'frontend', 'build', 'contracts');

console.log('🔄 Compiling and deploying contracts...');

try {
  // Compile contracts
  console.log('Compiling contracts...');
  execSync('npx truffle compile', { stdio: 'inherit' });
  
  // Deploy contracts
  console.log('Deploying contracts...');
  execSync('npx truffle migrate --reset', { stdio: 'inherit' });
  
  // Create directory for frontend if it doesn't exist
  if (!fs.existsSync(frontendDir)) {
    fs.mkdirSync(frontendDir, { recursive: true });
    console.log(`Created directory: ${frontendDir}`);
  }
  
  // Copy contract artifacts to frontend
  console.log('Copying contract artifacts to frontend...');
  fs.readdirSync(buildDir).forEach(file => {
    const sourcePath = path.join(buildDir, file);
    const targetPath = path.join(frontendDir, file);
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`Copied ${file} to frontend directory`);
  });
  
  // Save contract address to frontend directory
  const FraudLogger = require('../build/contracts/FraudLogger.json');
  const networkId = Object.keys(FraudLogger.networks)[0];
  const contractAddress = FraudLogger.networks[networkId]?.address;
  
  // Save contract address to both frontend and API directories
  if (contractAddress) {
    // For frontend
    fs.writeFileSync(
      path.join(frontendDir, 'contract-address.txt'),
      contractAddress
    );
    
    // For API
    fs.writeFileSync(
      path.join(__dirname, '..', 'api', 'contract_address.txt'),
      contractAddress
    );
    
    console.log(`Contract address saved: ${contractAddress}`);
  } else {
    throw new Error('Contract address not found in artifact');
  }
  
  console.log('✅ Contracts compiled, deployed and artifacts copied to frontend!');
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
