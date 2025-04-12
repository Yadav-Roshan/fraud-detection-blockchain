# Debit Card Fraud Detection System

A blockchain-based system for detecting and logging debit card fraud using smart contracts and machine learning.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Detailed Setup](#detailed-setup)
  - [Setting up MetaMask](#setting-up-metamask)
  - [Running the Local Blockchain](#running-the-local-blockchain)
  - [Deploying Smart Contracts](#deploying-smart-contracts)
  - [Running the API](#running-the-api)
  - [Running the Frontend](#running-the-frontend)
- [Using the Application](#using-the-application)
  - [Dashboard Overview](#dashboard-overview)
  - [Connecting Your Wallet](#connecting-your-wallet)
  - [Simulating Transactions](#simulating-transactions)
  - [Viewing Fraud Details](#viewing-fraud-details)
- [Troubleshooting](#troubleshooting)
- [Security Considerations](#security-considerations)

## 📦 Prerequisites

- Node.js (v14+) and npm
- Python 3.8+ with pip
- MetaMask browser extension
- Git

## 🛠️ Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/debit-fraud-project.git
   cd debit-fraud-project
   ```

2. Install Node.js dependencies:
   ```
   npm install
   ```

3. Install Python dependencies:
   ```
   cd api
   pip install -r requirements.txt
   cd ..
   ```

## 🚀 Quick Start

For those who want to get up and running quickly:

```bash
# Terminal 1: Start local blockchain
npm run ganache

# Terminal 2: Deploy contracts and start API
npm run deploy-contracts
npm run start:api

# Terminal 3: Start frontend
cd frontend
npx http-server -c-1
```

Then open `http://localhost:8080` in your browser with MetaMask installed.

## 📑 Detailed Setup

### Setting up MetaMask

1. Install MetaMask from [metamask.io](https://metamask.io/) or your browser's extension store.

2. Create a new wallet or import an existing one.

3. Connect to your local Ganache blockchain:
   - Click on the MetaMask icon
   - Select the network dropdown (usually shows "Ethereum Mainnet")
   - Click "Add Network" or "Custom RPC"
   - Enter the following details:
     - Network Name: `Ganache Local`
     - New RPC URL: `http://127.0.0.1:8545`
     - Chain ID: `1337`
     - Currency Symbol: `ETH`
     - Block Explorer URL: _(leave blank)_

4. Import a Ganache account:
   - Copy the private key of an account from Ganache
   - In MetaMask, click on your account icon
   - Select "Import Account"
   - Paste the private key and click "Import"

### Running the Local Blockchain

Start Ganache with deterministic addresses:

```bash
npm run ganache
```

This will start a local Ethereum blockchain with predefined accounts for development.

### Deploying Smart Contracts

Deploy the FraudLogger contract to your local blockchain:

```bash
npm run deploy-contracts
```

This will:
1. Compile the contracts
2. Deploy them to the local blockchain
3. Save the contract address to both frontend and API directories

### Running the API

The API provides fraud detection services and interfaces with the blockchain:

```bash
npm run start:api
```

This will start the API server at http://localhost:8000.

### Running the Frontend

Navigate to the frontend directory and start the web server:

```bash
cd frontend
npx http-server -c-1
```

Then open http://localhost:8080 in your browser.

## 💻 Using the Application

### Dashboard Overview

The main dashboard provides real-time monitoring of fraud events detected by the system:

![Dashboard Overview](./docs/images/dashboard.png)

The dashboard shows:
- Connection status with the blockchain
- Fraud statistics (total detected, high-risk events)
- List of fraud events with severity indicators
- Filter options to focus on high-risk transactions

### Connecting Your Wallet

1. **Connect MetaMask**: When the application loads, click "Connect Wallet" to connect your MetaMask wallet.

![Wallet Connection](./docs/images/wallet-connection.png)

2. **View Fraud Records**: The dashboard will show any existing fraud records stored on the blockchain.

### Simulating Transactions

Use the transaction simulator to test the fraud detection system:

![Transaction Simulation](./docs/images/transaction-simulator.png)

1. Click the "Simulate Transaction" button on the dashboard
2. Fill in the transaction details:
   - Amount
   - Merchant
   - Category
   - Distance from home
   - Other risk factors (foreign transaction, weekend)
3. Click "Simulate" to process the transaction
4. The system will analyze the transaction and determine if it's fraudulent

### Viewing Fraud Details

When a transaction is flagged as fraudulent:

![Fraud Details](./docs/images/fraud-details.png)

- It appears in the fraud alerts list
- Click "View Details" for complete information
- Blockchain transaction details are linked for verification
- The dashboard updates automatically once the blockchain transaction is mined

## ❓ Troubleshooting

- **"No contract address found"**: Make sure you've run `npm run deploy-contracts` successfully.

- **"Web3 initialization failed"**: Check that Ganache is running and that you've selected the correct network in MetaMask.

- **"Hour of day field not found"**: The application will automatically add this field when needed.

- **Contract verification issues**: Ensure you're connected to the same network where the contract is deployed. The application will prompt you to switch networks if necessary.

- **Transaction simulation fails**: Ensure the API server is running and accessible at http://localhost:8000.

## 🔒 Security Considerations

This is a demonstration project. In a production environment, consider:

- Implementing proper access control
- Securing API endpoints
- Using secure key management
- Adding data encryption
- Implementing rate limiting

## 📄 License

MIT
