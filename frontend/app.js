// Global variables
let web3;
let fraudLoggerContract;
let fraudEvents = [];
let contractAddress;
let accounts = [];
let isConnected = false;
let merchantsList = [];
let categoriesList = [];
let jobsList = [];

// Contract ABI - this will be loaded from the build artifacts
let contractABI;

// Constants
const API_URL = 'http://localhost:8000';

// DOM elements
const connectWalletBtn = document.getElementById('connect-wallet');
const viewContractBtn = document.getElementById('view-contract');
const connectionStatus = document.getElementById('connection-status');
const fraudAlertsContainer = document.getElementById('fraud-alerts-container');
const totalFraudCount = document.getElementById('total-fraud-count');
const highRiskCount = document.getElementById('high-risk-count');
const lastDetectionTime = document.getElementById('last-detection-time');
const refreshDataBtn = document.getElementById('refresh-data');
const simulateTransactionBtn = document.getElementById('simulate-transaction');
const sendSimulationBtn = document.getElementById('send-simulation');

// Initialize Bootstrap tooltips and popovers
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the application
    init();
    
    // Load simulation data
    loadSimulationData();
    
    // Setup event handlers
    connectWalletBtn.addEventListener('click', connectWallet);
    viewContractBtn.addEventListener('click', viewContract);
    refreshDataBtn.addEventListener('click', loadFraudEvents);
    simulateTransactionBtn.addEventListener('click', showSimulationModal);
    sendSimulationBtn.addEventListener('click', simulateTransaction);
    
    // Setup filter event handlers
    document.querySelectorAll('[data-filter]').forEach(element => {
        element.addEventListener('click', (event) => {
            const filter = event.target.getAttribute('data-filter');
            filterFraudEvents(filter);
        });
    });
    
    // Add the hour_of_day field during initial load in case user opens modal right away
    setTimeout(addHourOfDayField, 500); // Slight delay to ensure DOM is fully loaded
});

// Initialize the application
async function init() {
    try {
        console.log('Starting initialization...');
        
        // Load contract ABI
        console.log('Loading contract ABI...');
        const response = await fetch('build/contracts/FraudLogger.json');
        const data = await response.json();
        contractABI = data.abi;
        console.log('Contract ABI loaded successfully');
        
        // Get contract address directly from the local file instead of API
        try {
            console.log('Attempting to load contract address from file...');
            const addressResponse = await fetch('build/contracts/contract-address.txt');
            if (!addressResponse.ok) {
                throw new Error(`Failed to fetch contract address: ${addressResponse.status} ${addressResponse.statusText}`);
            }
            contractAddress = await addressResponse.text();
            console.log('Contract address loaded:', contractAddress);
        } catch (error) {
            console.error('Failed to load contract address:', error);
            updateConnectionStatus('Failed to load contract address', 'danger');
            return;
        }
        
        // Initialize web3
        console.log('Initializing Web3...');
        const web3Result = await initWeb3();
        if (!web3Result) {
            console.error('Web3 initialization failed');
            return;
        }
        
        // Initialize event listeners only after ensuring web3 is initialized
        console.log('Setting up event listeners...');
        if (await setupEventListener()) {
            // Load fraud events only if event listener setup was successful
            console.log('Loading fraud events...');
            await loadFraudEvents();
        }
        
        console.log('Initialization completed successfully');
    } catch (error) {
        console.error('Initialization error:', error);
        updateConnectionStatus('Initialization failed', 'danger');
    }
}

// Initialize Web3
async function initWeb3() {
    // Check if MetaMask is available
    if (window.ethereum) {
        web3 = new Web3(window.ethereum);
        try {
            // Get current network ID - and handle BigInt conversion
            const networkId = await web3.eth.net.getId();
            console.log('Current network ID:', networkId);
            
            // Convert network ID to a regular number if it's a BigInt
            const normalizedNetworkId = typeof networkId === 'bigint' ? Number(networkId) : networkId;
            
            // Check if the network ID is from the contract networks object
            const contractNetworks = contractABI.networks || {};
            const contractNetworkIds = Object.keys(contractNetworks);
            console.log('Available contract networks:', contractNetworkIds);
            
            // Use detected network ID from where the contract is deployed
            let correctNetworkId;
            
            if (contractNetworkIds.includes(normalizedNetworkId.toString())) {
                // If the current network has the contract deployed
                correctNetworkId = normalizedNetworkId;
                console.log('Contract found on current network');
            } else if (contractNetworkIds.length > 0) {
                // Use the first available network where the contract is deployed
                correctNetworkId = parseInt(contractNetworkIds[0]);
                console.log('Contract found on network:', correctNetworkId);
            } else {
                // Fallback to Ganache default
                correctNetworkId = 1337;
                console.log('No contract networks found. Defaulting to Ganache (1337)');
            }
            
            // Don't check network if we're in a refresh loop
            const refreshAttempts = parseInt(sessionStorage.getItem('refreshAttempts') || '0');
            
            // Also skip network check if we're on a network where contract is deployed
            if (refreshAttempts > 3 || normalizedNetworkId === correctNetworkId || contractNetworkIds.includes(normalizedNetworkId.toString())) {
                if (refreshAttempts > 3) {
                    console.warn('Detected potential refresh loop. Skipping network check.');
                    sessionStorage.removeItem('refreshAttempts'); // Reset after skipping
                }
                
                if (normalizedNetworkId === correctNetworkId || contractNetworkIds.includes(normalizedNetworkId.toString())) {
                    console.log('Connected to compatible network with contract');
                }
                
                // Continue with the current network
                return await initializeContractAndUI();
            }
            
            // Show a user-friendly prompt for network switching
            updateConnectionStatus(`
                <div class="alert alert-warning">
                    <strong>Network Issue:</strong> Please connect to the correct network.
                    <div class="mt-2">
                        <button id="switch-network-btn" class="btn btn-primary">Switch Network</button>
                        <button id="continue-anyway-btn" class="btn btn-outline-secondary ms-2">Continue Anyway</button>
                    </div>
                </div>
            `, 'warning', true);
            
            // Add event listeners for both buttons
            setTimeout(() => {
                const switchBtn = document.getElementById('switch-network-btn');
                if (switchBtn) {
                    switchBtn.addEventListener('click', async () => {
                        try {
                            await window.ethereum.request({
                                method: 'wallet_switchEthereumChain',
                                params: [{ chainId: '0x' + correctNetworkId.toString(16) }],
                            });
                            // Clear the refresh counter
                            sessionStorage.removeItem('refreshAttempts');
                            // Reload the page to ensure everything is fresh
                            window.location.reload();
                        } catch (switchError) {
                            if (switchError.code === 4902) {
                                // This error code indicates chain hasn't been added to MetaMask
                                try {
                                    await window.ethereum.request({
                                        method: 'wallet_addEthereumChain',
                                        params: [{
                                            chainId: '0x' + correctNetworkId.toString(16),
                                            chainName: 'Ganache Local',
                                            nativeCurrency: {
                                                name: 'ETH',
                                                symbol: 'ETH',
                                                decimals: 18
                                            },
                                            rpcUrls: ['http://127.0.0.1:8545'],
                                        }],
                                    });
                                    alert('Ganache network added! Please click "Switch Network" again.');
                                } catch (addError) {
                                    console.error('Error adding network to MetaMask:', addError);
                                    alert('Failed to add network. Please add the Ganache network manually in MetaMask.');
                                }
                            } else {
                                console.error('Error switching network:', switchError);
                                alert('Failed to switch network: ' + switchError.message);
                            }
                        }
                    });
                }
                
                // Add continue anyway option
                const continueBtn = document.getElementById('continue-anyway-btn');
                if (continueBtn) {
                    continueBtn.addEventListener('click', () => {
                        sessionStorage.removeItem('refreshAttempts');
                        updateConnectionStatus('Connected to non-compatible network. Some features may not work correctly.', 'warning');
                        // Continue with initialization
                        initializeContractAndUI();
                    });
                }
            }, 100);
            
            // Don't continue with automatic initialization
            return false;
        } catch (error) {
            console.error('User denied account access or other error:', error);
            updateConnectionStatus('Wallet connection issue: ' + error.message, 'warning');
            return false;
        }
    } 
    // Fallback to local provider
    else {
        try {
            // Try WebSocket provider first (needed for events)
            try {
                web3 = new Web3(new Web3.providers.WebsocketProvider('ws://127.0.0.1:8545'));
                console.log('Using WebSocket provider for better event support');
            } catch (wsError) {
                console.warn('WebSocket connection failed, falling back to HTTP:', wsError);
                // Fall back to HTTP provider if WebSocket fails
                web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
                console.log('Using HTTP provider (events may not work properly)');
            }
            
            accounts = await web3.eth.getAccounts();
            isConnected = true;
            
            // Initialize contract
            fraudLoggerContract = new web3.eth.Contract(contractABI, contractAddress);
            
            // Update UI
            updateConnectionStatus('Connected to local blockchain', 'info');
            return true;
        } catch (error) {
            console.error('Failed to connect to local blockchain', error);
            updateConnectionStatus('Failed to connect to blockchain', 'danger');
            return false;
        }
    }
}

// New helper function to initialize contract and UI
async function initializeContractAndUI() {
    try {
        // Request account access
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        accounts = await web3.eth.getAccounts();
        isConnected = true;
        
        // Make sure contract address is valid
        if (!contractAddress || !web3.utils.isAddress(contractAddress)) {
            console.error('Invalid contract address:', contractAddress);
            updateConnectionStatus('Invalid contract address', 'danger');
            return false;
        }
        
        // Get current network ID
        const networkId = await web3.eth.net.getId();
        const normalizedNetworkId = typeof networkId === 'bigint' ? Number(networkId) : networkId;
        console.log(`Initializing contract on network ${normalizedNetworkId} with address: ${contractAddress}`);
        
        // Initialize contract
        fraudLoggerContract = new web3.eth.Contract(contractABI, contractAddress);
        
        // Verify contract is properly initialized by calling a view function
        try {
            const fraudCount = await fraudLoggerContract.methods.getFraudCount().call();
            console.log(`Contract verification successful: Fraud count = ${fraudCount}`);
            
            // Clear any previous warnings since contract is working
            if (document.getElementById('contract-warning')) {
                document.getElementById('contract-warning').remove();
            }
            
            // Update UI with success message including network info
            updateConnectionStatus(`
                <div id="connection-info" class="alert alert-success">
                    <strong>Connected!</strong> Network ID: ${normalizedNetworkId}<br>
                    Contract Address: ${contractAddress.substring(0, 8)}...${contractAddress.substring(36)}<br>
                    Fraud Records: ${fraudCount}
                </div>
            `, 'success', true);
            
            connectWalletBtn.textContent = 'Wallet Connected';
            connectWalletBtn.classList.remove('btn-primary');
            connectWalletBtn.classList.add('btn-success');
            connectWalletBtn.disabled = true;
            
            return true;
        } catch (verifyError) {
            console.error('Contract verification failed:', verifyError);
            
            // Display specific warning about contract verification
            updateConnectionStatus(`
                <div id="contract-warning" class="alert alert-warning">
                    <strong>Contract Warning:</strong> Connected to network ID ${normalizedNetworkId}, but contract verification failed.<br>
                    This usually means the contract is deployed on a different network.<br>
                    Error: ${verifyError.message}<br><br>
                    <button class="btn btn-sm btn-primary" onclick="window.location.reload()">Retry</button>
                </div>
            `, 'warning', true);
            
            return false;
        }
    } catch (error) {
        console.error('Contract initialization error:', error);
        updateConnectionStatus(`
            <div id="contract-warning" class="alert alert-danger">
                <strong>Initialization Error:</strong> ${error.message}<br><br>
                <button class="btn btn-sm btn-primary" onclick="window.location.reload()">Retry</button>
            </div>
        `, 'danger', true);
        return false;
    }
}

// Connect wallet
async function connectWallet() {
    if (window.ethereum) {
        try {
            // Request account access if needed
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            accounts = await web3.eth.getAccounts();
            isConnected = true;
            
            // Update UI
            updateConnectionStatus('Connected to blockchain', 'success');
            connectWalletBtn.textContent = 'Wallet Connected';
            connectWalletBtn.classList.remove('btn-primary');
            connectWalletBtn.classList.add('btn-success');
            connectWalletBtn.disabled = true;
            
            // Load fraud events
            await loadFraudEvents();
        } catch (error) {
            console.error('User denied account access', error);
            updateConnectionStatus('Wallet connection denied', 'warning');
        }
    } else {
        alert('MetaMask is not installed. Please consider installing it: https://metamask.io/download.html');
    }
}

// View contract on blockchain explorer
function viewContract() {
    // Check if we're on a known network
    web3.eth.net.getId().then((networkId) => {
        let explorerUrl;
        switch (networkId) {
            case 1: // Mainnet
                explorerUrl = `https://etherscan.io/address/${contractAddress}`;
                break;
            case 3: // Ropsten
                explorerUrl = `https://ropsten.etherscan.io/address/${contractAddress}`;
                break;
            case 4: // Rinkeby
                explorerUrl = `https://rinkeby.etherscan.io/address/${contractAddress}`;
                break;
            case 5: // Goerli
                explorerUrl = `https://goerli.etherscan.io/address/${contractAddress}`;
                break;
            case 42: // Kovan
                explorerUrl = `https://kovan.etherscan.io/address/${contractAddress}`;
                break;
            default: // Localhost or unknown
                alert(`Contract Address: ${contractAddress}`);
                return;
        }
        window.open(explorerUrl, '_blank');
    });
}

// Update connection status UI
function updateConnectionStatus(message, status, isHTML = true) {
    connectionStatus.innerHTML = isHTML ? message : `<span class="badge bg-${status}">${message}</span>`;
}

// Setup event listener for new fraud events
async function setupEventListener() {
    console.log('Setting up event listener with contract:', fraudLoggerContract);
    
    if (!fraudLoggerContract) {
        console.error('Contract is not initialized');
        updateConnectionStatus('Contract not initialized', 'warning');
        return false;
    }
    
    // Check if the contract has events property
    if (!fraudLoggerContract.events) {
        console.error('Contract does not have events property', fraudLoggerContract);
        updateConnectionStatus('Contract events not available', 'warning');
        return false;
    }
    
    // Check if FraudDetected event exists
    if (!fraudLoggerContract.events.FraudDetected) {
        console.error('FraudDetected event not found in contract', fraudLoggerContract.events);
        updateConnectionStatus('FraudDetected event not available', 'warning');
        return false;
    }
    
    try {
        // Listen for FraudDetected events
        console.log('Subscribing to FraudDetected events...');
        
        // Use getPastEvents for HTTP providers since subscription won't work
        if (web3.currentProvider.constructor.name === 'HttpProvider') {
            console.log('HTTP provider detected. Event subscriptions not supported. Will poll for events instead.');
            updateConnectionStatus('Using HTTP provider. Live event notifications not available.', 'info');
            
            // Set up polling for new events instead of subscription
            setInterval(async () => {
                try {
                    const latestEvents = await fraudLoggerContract.getPastEvents('FraudDetected', {
                        fromBlock: 'latest' 
                    });
                    
                    if (latestEvents && latestEvents.length > 0) {
                        console.log('New events found via polling:', latestEvents);
                        latestEvents.forEach(event => processFraudEvent(event));
                    }
                } catch (pollError) {
                    console.error('Error polling for events:', pollError);
                }
            }, 10000); // Poll every 10 seconds
            
            return true;
        }
        
        // For WebSocket providers, use subscription
        const subscription = fraudLoggerContract.events.FraudDetected({});
        
        // Verify the subscription object
        if (!subscription || typeof subscription.on !== 'function') {
            console.error('Invalid subscription object:', subscription);
            updateConnectionStatus('Event subscription failed - check provider', 'warning');
            return false;
        }
        
        subscription
            .on('data', (event) => {
                console.log('New fraud detected:', event);
                // Add to our list and update UI
                processFraudEvent(event);
            })
            .on('error', (error) => {
                console.error('Error in event listener:', error);
            });
        
        console.log('Event listener setup successfully');
        return true;
    } catch (error) {
        console.error('Error setting up event listener:', error);
        updateConnectionStatus('Failed to set up event listener: ' + error.message, 'warning');
        return false;
    }
}

// Load all past fraud events
async function loadFraudEvents() {
    if (!fraudLoggerContract || !isConnected) {
        console.error('Contract not initialized or not connected');
        updateConnectionStatus('Contract not connected. Connect wallet first.', 'warning');
        return;
    }
    
    try {
        // Show loading state
        fraudAlertsContainer.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary mb-3" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p>Loading fraud events from blockchain...</p>
            </div>
        `;
        
        console.log('Getting fraud count from contract...');
        // Get the count of fraud records
        const fraudCount = await fraudLoggerContract.methods.getFraudCount().call();
        console.log(`Fraud count from contract: ${fraudCount}`);
        totalFraudCount.textContent = fraudCount;
        
        // Clear our events array
        fraudEvents = [];
        
        // If no events, show empty state
        if (fraudCount == 0) {
            console.log('No fraud events found in contract');
            fraudAlertsContainer.innerHTML = `
                <div class="text-center py-5">
                    <div class="alert alert-info" role="alert">
                        No fraud events detected yet.
                    </div>
                </div>
            `;
            updateStatistics(); // Still update statistics even with zero events
            return;
        }
        
        console.log('Fetching past events from blockchain...');
        
        try {
            // Get all past events 
            const pastEvents = await fraudLoggerContract.getPastEvents('FraudDetected', {
                fromBlock: 0,
                toBlock: 'latest'
            });
            
            console.log(`Found ${pastEvents.length} past events`);
            
            // If we have no past events but fraud count > 0, try direct record access
            if (pastEvents.length === 0 && fraudCount > 0) {
                console.log('No past events found despite positive fraud count. Trying direct record access...');
                
                // Process each record directly, without relying on events
                for (let i = 0; i < fraudCount; i++) {
                    try {
                        // Show incremental progress
                        if (i % 5 === 0) {
                            fraudAlertsContainer.innerHTML = `
                                <div class="text-center py-5">
                                    <div class="spinner-border text-primary mb-3" role="status">
                                        <span class="visually-hidden">Loading...</span>
                                    </div>
                                    <p>Loading fraud records: ${i}/${fraudCount}...</p>
                                </div>
                            `;
                        }
                        
                        // Get the fraud record from contract
                        const record = await fraudLoggerContract.methods.getFraudRecord(i).call();
                        console.log(`Record ${i}:`, record);
                        
                        // Create a synthetic event since we don't have the actual event
                        const syntheticEvent = {
                            returnValues: {
                                transactionHash: record.transactionHash,
                                timestamp: record.timestamp,
                                confidenceScore: record.confidenceScore,
                                metadata: record.metadata
                            },
                            blockNumber: 0, // we don't have this info
                            transactionHash: record.transactionHash // use the record's transaction hash
                        };
                        
                        processFraudEvent(syntheticEvent, false);
                    } catch (recordError) {
                        console.error(`Error loading record ${i}:`, recordError);
                        // Continue to next record despite error
                    }
                }
            } else {
                // Process each event normally
                for (let i = 0; i < fraudCount; i++) {
                    try {
                        // Get the fraud record from contract
                        const record = await fraudLoggerContract.methods.getFraudRecord(i).call();
                        
                        // Find matching event
                        const matchingEvent = pastEvents.find(
                            event => event.returnValues.transactionHash === record.transactionHash
                        );
                        
                        if (matchingEvent) {
                            processFraudEvent(matchingEvent, false);
                        } else {
                            console.warn(`No matching event found for record ${i}`);
                            
                            // Create a synthetic event if no matching event found
                            const syntheticEvent = {
                                returnValues: {
                                    transactionHash: record.transactionHash,
                                    timestamp: record.timestamp,
                                    confidenceScore: record.confidenceScore,
                                    metadata: record.metadata
                                },
                                blockNumber: 0,
                                transactionHash: record.transactionHash
                            };
                            
                            processFraudEvent(syntheticEvent, false);
                        }
                    } catch (recordError) {
                        console.error(`Error processing record ${i}:`, recordError);
                        // Continue to next record despite error
                    }
                }
            }
            
            // Update UI with all events at once
            updateFraudEventsList();
            
            // Update statistics
            updateStatistics();
            
            console.log(`Successfully loaded ${fraudEvents.length} fraud events`);
        } catch (eventsError) {
            console.error('Error fetching past events:', eventsError);
            
            // Fallback to direct record access if event fetching fails
            console.log('Falling back to direct record access...');
            
            // Process each record directly without events
            for (let i = 0; i < fraudCount; i++) {
                try {
                    // Show incremental progress
                    if (i % 5 === 0) {
                        fraudAlertsContainer.innerHTML = `
                            <div class="text-center py-5">
                                <div class="spinner-border text-primary mb-3" role="status">
                                    <span class="visually-hidden">Loading...</span>
                                </div>
                                <p>Loading fraud records: ${i}/${fraudCount}...</p>
                            </div>
                        `;
                    }
                    
                    // Get the fraud record from contract
                    const record = await fraudLoggerContract.methods.getFraudRecord(i).call();
                    
                    // Create a synthetic event
                    const syntheticEvent = {
                        returnValues: {
                            transactionHash: record.transactionHash,
                            timestamp: record.timestamp,
                            confidenceScore: record.confidenceScore,
                            metadata: record.metadata
                        },
                        blockNumber: 0,
                        transactionHash: record.transactionHash
                    };
                    
                    processFraudEvent(syntheticEvent, false);
                } catch (recordError) {
                    console.error(`Error loading record ${i}:`, recordError);
                    // Continue to next record
                }
            }
            
            // Update UI with all events at once
            updateFraudEventsList();
            
            // Update statistics
            updateStatistics();
        }
    } catch (error) {
        console.error('Error in loadFraudEvents:', error);
        fraudAlertsContainer.innerHTML = `
            <div class="alert alert-danger" role="alert">
                Failed to load fraud events: ${error.message}
                <button class="btn btn-sm btn-outline-danger mt-2" onclick="loadFraudEvents()">Try Again</button>
            </div>
        `;
        // Still try to update statistics
        updateStatistics();
    }
}

// Process a fraud event
function processFraudEvent(event, updateUI = true) {
    try {
        console.log('Processing fraud event:', event);
        
        // Check if this event is already in our list (prevent duplicates)
        const isDuplicate = fraudEvents.some(existingEvent => 
            existingEvent.transactionHash === event.returnValues.transactionHash
        );
        
        if (isDuplicate) {
            console.log('Duplicate event detected, skipping');
            return;
        }
        
        // Try to parse metadata, handle potential JSON parsing errors
        let parsedMetadata;
        try {
            parsedMetadata = JSON.parse(event.returnValues.metadata || '{}');
        } catch (parseError) {
            console.error('Error parsing event metadata:', parseError);
            parsedMetadata = {}; // Use empty object as fallback
        }
        
        const fraudData = {
            id: fraudEvents.length,
            transactionHash: event.returnValues.transactionHash,
            timestamp: parseInt(event.returnValues.timestamp) * 1000, // Convert to milliseconds
            confidenceScore: parseInt(event.returnValues.confidenceScore),
            metadata: parsedMetadata,
            blockNumber: event.blockNumber,
            eventHash: event.transactionHash
        };
        
        console.log('Processed fraud data:', fraudData);
        
        // Add to our list
        fraudEvents.push(fraudData);
        
        // Sort by timestamp (newest first)
        fraudEvents.sort((a, b) => b.timestamp - a.timestamp);
        
        // Update UI if needed
        if (updateUI) {
            updateFraudEventsList();
            updateStatistics();
            
            // Show notification for new fraud
            showNotification('New Fraud Detected', `Transaction with confidence score ${fraudData.confidenceScore}% was detected as fraud.`);
        }
    } catch (error) {
        console.error('Error processing fraud event:', error);
    }
}

// Update the fraud events list in the UI
function updateFraudEventsList(eventsToDisplay = null) {
    // Use provided events or default to all fraud events
    const displayEvents = eventsToDisplay || fraudEvents;
    
    // Clear container
    fraudAlertsContainer.innerHTML = '';
    
    // If no events, show empty state
    if (displayEvents.length === 0) {
        fraudAlertsContainer.innerHTML = `
            <div class="text-center py-5">
                <div class="alert alert-info" role="alert">
                    No fraud events detected yet.
                </div>
            </div>
        `;
        return;
    }
    
    // Add each fraud event to the list
    displayEvents.forEach(fraud => {
        // Determine severity class based on confidence score
        let severityClass = '';
        let severityLabel = '';
        
        if (fraud.confidenceScore >= 90) {
            severityClass = 'critical';
            severityLabel = 'Critical';
        } else if (fraud.confidenceScore >= 70) {
            severityClass = 'high';
            severityLabel = 'High Risk';
        } else {
            severityClass = 'medium';
            severityLabel = 'Medium Risk';
        }
        
        // Format date
        const date = new Date(fraud.timestamp);
        const formattedDate = date.toLocaleString();
        
        // Fix merchant display - use merchant instead of merchant_id
        const merchantDisplay = fraud.metadata.merchant 
            ? fraud.metadata.merchant.replace('fraud_', '') 
            : (fraud.metadata.merchant_id || 'Unknown');
        
        // Create card for this fraud event
        const fraudCard = document.createElement('div');
        fraudCard.classList.add('card', 'fraud-card', severityClass);
        fraudCard.setAttribute('data-confidence', fraud.confidenceScore);
        fraudCard.setAttribute('data-id', fraud.id);
        
        fraudCard.innerHTML = `
            <div class="card-body">
                <span class="status-badge badge bg-danger">${severityLabel}</span>
                <h5 class="card-title">Fraud Alert #${fraud.id + 1}</h5>
                <h6 class="card-subtitle mb-2 text-muted">Confidence: ${fraud.confidenceScore}%</h6>
                <div class="card-text">
                    <div class="row mb-2">
                        <div class="col-md-3"><strong>Amount:</strong></div>
                        <div class="col-md-9">$${fraud.metadata.amount?.toFixed(2) || 'N/A'}</div>
                    </div>
                    <div class="row mb-2">
                        <div class="col-md-3"><strong>Merchant:</strong></div>
                        <div class="col-md-9">${merchantDisplay}</div>
                    </div>
                    <div class="row mb-2">
                        <div class="col-md-3"><strong>Time:</strong></div>
                        <div class="col-md-9">${formattedDate}</div>
                    </div>
                </div>
                <button class="btn btn-sm btn-outline-primary view-details" data-id="${fraud.id}">
                    View Details
                </button>
            </div>
        `;
        
        // Add the card to the container
        fraudAlertsContainer.appendChild(fraudCard);
        
        // Add event listener to the view details button
        const viewDetailsBtn = fraudCard.querySelector('.view-details');
        viewDetailsBtn.addEventListener('click', () => showFraudDetails(fraud.id));
    });
}

// Show fraud details in modal
function showFraudDetails(fraudId) {
    const fraud = fraudEvents.find(f => f.id === parseInt(fraudId));
    if (!fraud) return;
    
    // Format date
    const date = new Date(fraud.timestamp);
    const formattedDate = date.toLocaleString();
    
    // Create content for the modal
    const modalContent = document.getElementById('fraud-details-content');
    
    // Generate transaction hash display
    const txHash = fraud.eventHash || 'Unknown';
    const shortTxHash = txHash.length > 10 
        ? `${txHash.substring(0, 6)}...${txHash.substring(txHash.length - 4)}`
        : txHash;
    
    // Fix merchant display in details modal
    const merchantDisplay = fraud.metadata.merchant 
        ? fraud.metadata.merchant.replace('fraud_', '') 
        : (fraud.metadata.merchant_id || 'Unknown');
    
    modalContent.innerHTML = `
        <div class="row mb-4">
            <div class="col">
                <div class="alert alert-${fraud.confidenceScore >= 90 ? 'danger' : 'warning'}">
                    This transaction was detected as fraud with ${fraud.confidenceScore}% confidence.
                </div>
            </div>
        </div>
        
        <div class="row mb-3">
            <div class="col-md-4"><strong>Transaction ID:</strong></div>
            <div class="col-md-8">${fraud.metadata.transaction_id || 'Unknown'}</div>
        </div>
        
        <div class="row mb-3">
            <div class="col-md-4"><strong>Card Number:</strong></div>
            <div class="col-md-8">${fraud.metadata.debit_card_number || fraud.metadata.card_id || 'Unknown'}</div>
        </div>
        
        <div class="row mb-3">
            <div class="col-md-4"><strong>Amount:</strong></div>
            <div class="col-md-8">$${fraud.metadata.amount?.toFixed(2) || 'N/A'}</div>
        </div>
        
        <div class="row mb-3">
            <div class="col-md-4"><strong>Merchant:</strong></div>
            <div class="col-md-8">${merchantDisplay}</div>
        </div>
        
        <div class="row mb-3">
            <div class="col-md-4"><strong>Category:</strong></div>
            <div class="col-md-8">${fraud.metadata.category || 'Unknown'}</div>
        </div>
        
        <div class="row mb-3">
            <div class="col-md-4"><strong>Time:</strong></div>
            <div class="col-md-8">${formattedDate}</div>
        </div>
        
        <div class="row mb-3">
            <div class="col-md-4"><strong>Blockchain Transaction:</strong></div>
            <div class="col-md-8">
                <a href="#" onclick="viewTransaction('${txHash}'); return false;" title="View on blockchain explorer">
                    ${shortTxHash}
                </a>
            </div>
        </div>
        
        <div class="row mb-3">
            <div class="col-md-4"><strong>Block Number:</strong></div>
            <div class="col-md-8">${fraud.blockNumber || 'Unknown'}</div>
        </div>
        
        <h5 class="mt-4 mb-3">Additional Data</h5>
        <pre class="bg-light p-3 rounded"><code>${JSON.stringify(fraud.metadata, null, 2)}</code></pre>
    `;
    
    const fraudDetailsModal = new bootstrap.Modal(document.getElementById('fraudDetailsModal'));
    fraudDetailsModal.show();
}

// View transaction on blockchain explorer
function viewTransaction(txHash) {
    // Check if we're on a known network
    web3.eth.net.getId().then((networkId) => {
        let explorerUrl;
        switch (networkId) {
            case 1: // Mainnet
                explorerUrl = `https://etherscan.io/tx/${txHash}`;
                break;
            case 3: // Ropsten
                explorerUrl = `https://ropsten.etherscan.io/tx/${txHash}`;
                break;
            case 4: // Rinkeby
                explorerUrl = `https://rinkeby.etherscan.io/tx/${txHash}`;
                break;
            case 5: // Goerli
                explorerUrl = `https://goerli.etherscan.io/tx/${txHash}`;
                break;
            case 42: // Kovan
                explorerUrl = `https://kovan.etherscan.io/tx/${txHash}`;
                break;
            default: // Localhost or unknown
                alert(`Transaction Hash: ${txHash}`);
                return;
        }
        window.open(explorerUrl, '_blank');
    });
}

// Filter fraud events based on criteria
function filterFraudEvents(filter) {
    // Make a copy for filtering
    let filteredEvents;
    
    // Apply filter
    switch (filter) {
        case 'high':
            // Filter to only high risk (>80%)
            filteredEvents = fraudEvents.filter(event => event.confidenceScore > 80);
            // Then sort by confidence
            filteredEvents.sort((a, b) => b.confidenceScore - a.confidenceScore);
            break;
        case 'all':
        default:
            // Just sort by timestamp (newest first)
            filteredEvents = [...fraudEvents].sort((a, b) => b.timestamp - a.timestamp);
            break;
    }
    
    // Update the fraud events display with filtered results
    updateFraudEventsList(filteredEvents);
}

// Update statistics
function updateStatistics() {
    // Total count
    totalFraudCount.textContent = fraudEvents.length;
    
    // High risk count (>80%)
    const highRisk = fraudEvents.filter(event => event.confidenceScore > 80).length;
    highRiskCount.textContent = highRisk;
    
    // Last detection time
    if (fraudEvents.length > 0) {
        const lastEvent = fraudEvents.reduce((latest, current) => 
            current.timestamp > latest.timestamp ? current : latest, 
            fraudEvents[0]);
        
        const date = new Date(lastEvent.timestamp);
        lastDetectionTime.textContent = date.toLocaleString();
    } else {
        lastDetectionTime.textContent = '-';
    }
}

// Show notification
function showNotification(title, message) {
    // Check if browser supports notifications
    if (!("Notification" in window)) {
        console.log("This browser does not support desktop notification");
        return;
    }
    
    // Check if permission is already granted
    if (Notification.permission === "granted") {
        const notification = new Notification(title, {
            body: message,
            icon: '/favicon.ico'
        });
    }
    // Otherwise, ask for permission
    else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                const notification = new Notification(title, {
                    body: message,
                    icon: '/favicon.ico'
                });
            }
        });
    }
}

// Show simulation modal
function showSimulationModal() {
    // Generate a random transaction ID when modal opens - HEXADECIMAL ONLY
    const transactionId = [...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    
    // Add hour_of_day field if it doesn't exist
    addHourOfDayField();
    
    // Add transaction ID field
    addTransactionIdField(transactionId);
    
    const simulateModal = new bootstrap.Modal(document.getElementById('simulateTransactionModal'));
    simulateModal.show();
}

// Function to add hour_of_day field to the transaction form
function addHourOfDayField() {
    // Check if form already has the field
    if (document.getElementById('hour_of_day')) {
        return; // Field already exists, no need to add it again
    }
    
    // Get the form or a container within the form where we want to add the field
    const form = document.getElementById('simulate-transaction-form');
    
    // Find an appropriate place to insert the field
    // Look for another form group to insert after (such as zip code)
    const zipFormGroup = document.querySelector('.form-group:has(#zip)') || 
                        document.querySelector('.mb-3:has(#zip)');
    
    if (form && zipFormGroup) {
        // Create the new form group
        const hourFormGroup = document.createElement('div');
        hourFormGroup.className = zipFormGroup.className; // Match existing styling
        
        // Create label and input
        hourFormGroup.innerHTML = `
            <label for="hour_of_day" class="form-label">Hour of Day (0-23)</label>
            <input type="number" class="form-control" id="hour_of_day" min="0" max="23" placeholder="Current hour will be used if empty">
            <small class="form-text text-muted">Enter hour in 24-hour format (0-23)</small>
        `;
        
        // Insert after the zip code field
        zipFormGroup.parentNode.insertBefore(hourFormGroup, zipFormGroup.nextSibling);
        
        console.log('Hour of day field added to simulation form');
    } else {
        console.warn('Could not find appropriate place to add hour_of_day field');
    }
}

// Function to add transaction ID field to the form
function addTransactionIdField(transactionId) {
    // Ensure we have a transaction ID
    if (!transactionId) {
        // Generate hex-only transaction ID
        transactionId = [...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    }
    
    // Check if the transaction ID field already exists
    let txIdField = document.getElementById('transaction_id');
    
    // If it exists, just update its value
    if (txIdField) {
        txIdField.value = transactionId;
        return;
    }
    
    // Get the form
    const form = document.getElementById('simulate-transaction-form');
    
    // Find where to insert this field (at the top of the form)
    const firstFormGroup = form.querySelector('.form-group') || form.querySelector('.mb-3');
    
    if (form && firstFormGroup) {
        // Create the new form group
        const txIdFormGroup = document.createElement('div');
        txIdFormGroup.className = firstFormGroup.className; // Match existing styling
        
        // Create label and input
        txIdFormGroup.innerHTML = `
            <label for="transaction_id" class="form-label">Transaction ID</label>
            <input type="text" class="form-control" id="transaction_id" readonly value="${transactionId}">
            <small class="form-text text-muted">This randomly generated ID will identify your transaction</small>
        `;
        
        // Insert as the first field in the form
        form.insertBefore(txIdFormGroup, form.firstChild);
        
        console.log('Transaction ID field added to simulation form');
    }
}

// Load data for the simulation form
async function loadSimulationData() {
    try {
        // Fetch merchants
        const merchantsResponse = await fetch(`${API_URL}/merchants/`);
        if (!merchantsResponse.ok) throw new Error('Failed to load merchants');
        const merchantsData = await merchantsResponse.json();
        merchantsList = merchantsData.merchants;
        
        // Fetch categories
        const categoriesResponse = await fetch(`${API_URL}/categories/`);
        if (!categoriesResponse.ok) throw new Error('Failed to load categories');
        const categoriesData = await categoriesResponse.json();
        categoriesList = categoriesData.categories;
        
        // Fetch jobs
        const jobsResponse = await fetch(`${API_URL}/jobs/`);
        if (!jobsResponse.ok) throw new Error('Failed to load jobs');
        const jobsData = await jobsResponse.json();
        jobsList = jobsData.jobs;
        
        // Populate the dropdowns
        populateDropdowns();
    } catch (error) {
        console.error('Error loading simulation data:', error);
    }
}

// Populate the simulation form dropdowns
function populateDropdowns() {
    // Merchant dropdown
    const merchantDropdown = document.getElementById('merchant');
    merchantDropdown.innerHTML = '';
    merchantsList.forEach(merchant => {
        const option = document.createElement('option');
        option.value = merchant;
        option.textContent = merchant.replace('fraud_', '');
        merchantDropdown.appendChild(option);
    });
    
    // Job dropdown
    const jobDropdown = document.getElementById('job');
    jobDropdown.innerHTML = '';
    jobsList.forEach(job => {
        const option = document.createElement('option');
        option.value = job;
        option.textContent = job;
        jobDropdown.appendChild(option);
    });
    
    // Category dropdown - Add this missing functionality
    const categoryDropdown = document.getElementById('category');
    if (categoryDropdown) {
        categoryDropdown.innerHTML = '';
        categoriesList.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            // Convert snake_case to Title Case
            option.textContent = category
                .split('_')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
            categoryDropdown.appendChild(option);
        });
    }
}

// Simulate a transaction
async function simulateTransaction() {
    // Get form values
    const amount = parseFloat(document.getElementById('amount').value);
    const distance = parseFloat(document.getElementById('distance').value);
    const foreign = document.getElementById('foreign').checked;
    const weekend = document.getElementById('weekend').checked;
    const category = document.getElementById('category').value;
    const job = document.getElementById('job').value;
    const merchant = document.getElementById('merchant').value;
    const state = document.getElementById('state').value;
    const city = document.getElementById('city').value;
    const zipCode = document.getElementById('zip').value;
    
    // Get transaction ID from the form if it exists, otherwise generate a new one
    let transactionId;
    const txIdField = document.getElementById('transaction_id');
    if (txIdField && txIdField.value) {
        transactionId = txIdField.value;
    } else {
        // Generate a random transaction ID (32 HEXADECIMAL chars only)
        transactionId = [...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    }
    
    // Check if user provided an hour_of_day value
    let hourOfDay;
    const hourInput = document.getElementById('hour_of_day');
    if (hourInput && hourInput.value !== '') {
        // Convert to integer and ensure it's within 0-23 range
        const parsedHour = parseInt(hourInput.value);
        if (!isNaN(parsedHour) && parsedHour >= 0 && parsedHour <= 23) {
            hourOfDay = parsedHour;
        } else {
            hourOfDay = new Date().getHours(); // Fallback to current hour if invalid
        }
    } else {
        // Use current hour if not specified
        hourOfDay = new Date().getHours();
    }
    
    // Generate a random card number
    const cardNumber = [...Array(16)].map(() => Math.floor(Math.random() * 10)).join('');
    
    // Build the transaction data
    const transactionData = {
        transaction_id: transactionId,
        debit_card_number: cardNumber,
        merchant: merchant,
        category: category,
        amount: amount,
        job: job,
        city: city,
        state: state,
        zip: zipCode,
        hour_of_day: hourOfDay, // Use the hour we determined
        metadata: {
            foreign_transaction: foreign,
            weekend_tx: weekend,
            distance_from_home: distance,
            ip_address: '192.168.' + Math.floor(Math.random() * 255) + '.' + Math.floor(Math.random() * 255),
            device_id: 'DEV-' + Math.random().toString(36).substring(2, 10),
            browser: 'Chrome/115.0.0.0'
        }
    };
    
    try {
        // Show loading state
        document.getElementById('send-simulation').innerHTML = `
            <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            Simulating...
        `;
        document.getElementById('send-simulation').disabled = true;
        
        // Send to API
        const response = await fetch(`${API_URL}/detect-fraud/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(transactionData)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API Error: ${errorData.detail || response.statusText}`);
        }
        
        const result = await response.json();
        
        // Hide modal
        const simulateModal = bootstrap.Modal.getInstance(document.getElementById('simulateTransactionModal'));
        simulateModal.hide();
        
        // Reset form
        document.getElementById('simulate-transaction-form').reset();
        document.getElementById('send-simulation').innerHTML = 'Simulate';
        document.getElementById('send-simulation').disabled = false;
        
        // Show result
        if (result.is_fraud) {
            alert(`Transaction detected as FRAUD with ${(result.confidence_score * 100).toFixed(2)}% confidence!`);
            
            // Refresh the fraud events list after a longer delay
            // to allow time for the blockchain transaction to be mined
            updateConnectionStatus('Waiting for blockchain transaction to be mined...', 'info');
            setTimeout(() => {
                console.log('Refreshing fraud events after simulation');
                loadFraudEvents();
                
                // Update connection status after loading events to show mining is complete
                setTimeout(() => {
                    if (isConnected) {
                        updateConnectionStatus('Transaction mined successfully!', 'success');
                        
                        // Revert to normal connection status after showing success message
                        setTimeout(() => {
                            if (document.getElementById('connection-info')) {
                                // If we have a connection info div, preserve it
                                return;
                            } else {
                                updateConnectionStatus('Connected to blockchain', 'success');
                            }
                        }, 500);
                    }
                }, 1000);
            }, 1000); // Increased to 5 seconds to give more time for mining
        } else {
            alert(`Transaction is LEGITIMATE with ${((1 - result.confidence_score) * 100).toFixed(2)}% confidence.`);
            // Notice there's no refresh or blockchain logging for legitimate transactions
        }
        
    } catch (error) {
        console.error('Error simulating transaction:', error);
        alert('Error simulating transaction: ' + error.message);
        
        // Reset button
        document.getElementById('send-simulation').innerHTML = 'Simulate';
        document.getElementById('send-simulation').disabled = false;
    }
}
