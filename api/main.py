from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
import pickle
import numpy as np
import pandas as pd
import os
import logging
from datetime import datetime
import json
import hashlib
from web3 import Web3
from typing import Optional, Dict, Any
import uvicorn
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware  # Add this import for CORS
from dotenv import load_dotenv
load_dotenv()

# Import merchant, category and job lists
from MERCHANTS import MERCHANTS
from CATEGORIES import CATEGORIES
from JOBS import JOBS

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("fraud_api.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("fraud-detection-api")

# Initialize FastAPI
app = FastAPI(title="Debit Card Fraud Detection API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development; in production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)

# Web3 Configuration - Updated for Web3.py v6+
w3 = Web3(Web3.HTTPProvider('http://127.0.0.1:8545'))

# Load contract ABI and address
CONTRACT_ADDRESS = os.environ.get("CONTRACT_ADDRESS")
CONTRACT_ABI_PATH = os.path.join(os.path.dirname(__file__), "..", "build", "contracts", "FraudLogger.json")
contract = None

def load_contract():
    global contract, CONTRACT_ADDRESS
    
    # If contract address isn't set in environment, try to load from file
    if not CONTRACT_ADDRESS:
        try:
            with open(os.path.join(os.path.dirname(__file__), "contract_address.txt")) as f:
                CONTRACT_ADDRESS = f.read().strip()
        except FileNotFoundError:
            logger.warning("Contract address not found. Please deploy the contract first.")
            return False
    
    # Load contract ABI
    try:
        with open(CONTRACT_ABI_PATH) as f:
            contract_data = json.load(f)
            contract_abi = contract_data["abi"]
            
        contract = w3.eth.contract(address=CONTRACT_ADDRESS, abi=contract_abi)
        logger.info(f"Contract loaded successfully at {CONTRACT_ADDRESS}")
        return True
    except Exception as e:
        logger.error(f"Failed to load contract: {e}")
        return False

# Request and response models
class Transaction(BaseModel):
    transaction_id: str = Field(..., description="Unique transaction identifier (32 alphanumeric chars)")
    debit_card_number: str = Field(..., description="Debit card number")
    merchant: str = Field(..., description="Merchant name, must be from the predefined list")
    category: str = Field(..., description="Transaction category, must be from the predefined list")
    amount: float = Field(..., description="Transaction amount in USD")
    job: str = Field(..., description="Job title of card holder, must be from the predefined list")
    city: str = Field(..., description="City where transaction occurred")
    state: str = Field(..., description="State where transaction occurred")
    zip: str = Field(..., description="ZIP code where transaction occurred")
    hour_of_day: int = Field(..., ge=0, le=23, description="Hour of day when transaction occurred (0-23)")
    metadata: Optional[Dict[str, Any]] = Field(default={}, description="Additional transaction data")

class FraudResponse(BaseModel):
    transaction_id: str
    is_fraud: bool
    confidence_score: float
    blockchain_log_id: Optional[int] = None
    blockchain_tx_hash: Optional[str] = None
    timestamp: str

# Load ML model
def load_model():
    """Load the fraud detection model and related files"""
    base_dir = os.path.dirname(os.path.dirname(__file__))
    model_dir = os.path.join(base_dir, 'ml-models')
    
    model_path = os.path.join(model_dir, 'rf_model.pkl')
    encoder_path = os.path.join(model_dir, 'encoder.pkl')
    
    # Check if model exists
    if not os.path.exists(model_path):
        logger.error(f"Model file not found at {model_path}")
        raise FileNotFoundError(f"Model file not found at {model_path}")
    
    # Load model
    with open(model_path, 'rb') as f:
        model = pickle.load(f)
    
    # Load encoder
    with open(encoder_path, 'rb') as f:
        encoder = pickle.load(f)
    
    logger.info(f"Model and encoder loaded successfully")
    return model, encoder

# Load model on startup
model, encoder = load_model()
load_contract()

# Validate input data
def validate_transaction(transaction: Transaction) -> bool:
    """Validate that transaction fields are from predefined lists"""
    if transaction.merchant not in MERCHANTS:
        logger.warning(f"Invalid merchant: {transaction.merchant}")
        return False
    
    if transaction.category not in CATEGORIES:
        logger.warning(f"Invalid category: {transaction.category}")
        return False
    
    if transaction.job not in JOBS:
        logger.warning(f"Invalid job: {transaction.job}")
        return False
    
    if not (0 <= transaction.hour_of_day <= 23):
        logger.warning(f"Invalid hour_of_day: {transaction.hour_of_day}")
        return False
    
    return True

def log_to_blockchain(background_tasks: BackgroundTasks, transaction_id: str, confidence: int, metadata: str):
    """Log fraud transaction to blockchain"""
    if contract is None:
        if not load_contract():
            logger.error("Failed to load contract, cannot log to blockchain")
            return None, None
    
    try:
        # Clean the transaction ID and ensure consistent formatting
        transaction_id = transaction_id.strip().lower()
        
        # Use the text method to hash the transaction ID
        tx_hash = Web3.keccak(text=transaction_id)
        
        # Get the first account from Ganache
        account = w3.eth.accounts[0]
        
        # Use the private key that corresponds to the first Ganache account
        private_key = os.getenv("PRIVATE_KEY")
        
        # Build transaction - updated for Web3.py v6+
        transaction = contract.functions.logFraud(
            tx_hash,
            confidence,
            metadata
        ).build_transaction({
            'from': account,
            'gas': 2000000,
            'maxFeePerGas': w3.to_wei('50', 'gwei'),
            'maxPriorityFeePerGas': w3.to_wei('1', 'gwei'),
            'nonce': w3.eth.get_transaction_count(account)
        })
        
        # Sign and send transaction with the correct private key
        signed_tx = w3.eth.account.sign_transaction(transaction, private_key=private_key)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
        
        # Get the log ID from events
        log_id = None
        if receipt.status == 1:  # Transaction successful
            logs = contract.events.FraudDetected().process_receipt(receipt)
            if logs:
                log_id = contract.functions.getFraudCount().call() - 1
        
        logger.info(f"Fraud logged to blockchain with tx hash: {receipt.transactionHash.hex()}, log ID: {log_id}")
        return log_id, receipt.transactionHash.hex()
    
    except Exception as e:
        logger.exception(f"Failed to log fraud to blockchain: {e}")
        logger.error(f"Transaction ID type: {type(transaction_id)}, value: {transaction_id}")
        return None, None

@app.on_event("startup")
async def startup_event():
    """Run when the API starts"""
    logger.info("Starting Fraud Detection API")
    
    # Make sure contract is loaded
    load_contract()
    
    # Make sure model is loaded
    if model is None:
        logger.warning("Model not loaded. Attempting to load...")
        load_model()

@app.post("/detect-fraud/", response_model=FraudResponse)
async def detect_fraud(transaction: Transaction, background_tasks: BackgroundTasks):
    """
    Detect fraud in a transaction and log to blockchain if fraud is detected
    """
    try:
        logger.info(f"Processing transaction: {transaction.transaction_id}")
        
        # Validate transaction data
        if not validate_transaction(transaction):
            raise HTTPException(status_code=400, detail="Invalid transaction data")
        
        # Create a DataFrame with the model's expected structure
        df = pd.DataFrame({
            'hour_of_day': [transaction.hour_of_day],
            'category': [transaction.category],
            'amount(usd)': [transaction.amount],
            'merchant': [transaction.merchant],
            'job': [transaction.job]
        })
        
        logger.debug(f"Transaction data before encoding: {df.values}")
        
        # Transform categorical features using OrdinalEncoder
        try:
            df.loc[:, ['category', 'merchant', 'job']] = encoder.transform(df[['category', 'merchant', 'job']])
            logger.debug(f"Transaction data after encoding: {df.values}")
        except Exception as e:
            logger.error(f"Error encoding categorical features: {e}")
            raise HTTPException(status_code=500, detail="Error encoding categorical features")
        
        # Make prediction
        fraud_probability = model.predict_proba(df)[0, 1]
        print(fraud_probability)
        is_fraud = fraud_probability >= 0.6  # Threshold for fraud
        confidence_score = int(fraud_probability * 100)
        
        # Log the prediction
        logger.info(f"Transaction {transaction.transaction_id}: is_fraud={is_fraud}, confidence={confidence_score}%")
        
        # Prepare response
        response = FraudResponse(
            transaction_id=transaction.transaction_id,
            is_fraud=is_fraud,
            confidence_score=fraud_probability,
            blockchain_log_id=None,
            blockchain_tx_hash=None,
            timestamp=datetime.now().isoformat()
        )
        
        # If fraud detected, log to blockchain
        if is_fraud:
            # Prepare metadata
            metadata = json.dumps({
                "debit_card_number": transaction.debit_card_number,
                "merchant": transaction.merchant,
                "category": transaction.category,
                "amount": transaction.amount,
                "job": transaction.job,
                "city": transaction.city,
                "state": transaction.state,
                "zip": transaction.zip,
                "hour_of_day": transaction.hour_of_day,
                "timestamp": datetime.now().isoformat(),
                **transaction.metadata
            })
            
            # Log to blockchain
            log_id, tx_hash = log_to_blockchain(
                background_tasks,
                transaction.transaction_id,
                confidence_score,
                metadata
            )
            
            if log_id is not None:
                response.blockchain_log_id = log_id
                response.blockchain_tx_hash = tx_hash
        
        return response
    
    except Exception as e:
        logger.error(f"Error processing transaction: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health/")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "model_loaded": model is not None,
        "contract_loaded": contract is not None,
        "contract_address": CONTRACT_ADDRESS
    }

@app.get("/merchants/")
async def get_merchants():
    """
    Return a list of merchants for the frontend simulator
    """
    # Return a limited set (first 20) to avoid overwhelming the frontend
    return {"merchants": MERCHANTS}

@app.get("/categories/")
async def get_categories():
    """
    Return list of categories for the frontend simulator
    """
    return {"categories": CATEGORIES}

@app.get("/jobs/")
async def get_jobs():
    """
    Return list of jobs for the frontend simulator
    """
    # Return a limited set to avoid overwhelming the frontend
    return {"jobs": JOBS}

@app.get("/contract_address", response_model=str)
async def get_contract_address():
    """Return the contract address"""
    global CONTRACT_ADDRESS
    
    if not CONTRACT_ADDRESS:
        try:
            with open(os.path.join(os.path.dirname(__file__), "contract_address.txt")) as f:
                CONTRACT_ADDRESS = f.read().strip()
                return CONTRACT_ADDRESS
        except FileNotFoundError:
            logger.warning("Contract address file not found")
            raise HTTPException(status_code=404, detail="Contract address not found")
    
    return CONTRACT_ADDRESS

# Mount the directory containing contract_address.txt as static files
app.mount("/api", StaticFiles(directory=os.path.dirname(__file__)), name="api")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
