"""
Create placeholder encoder and model files for testing
"""
import os
import pickle
import numpy as np
import pandas as pd
from sklearn.preprocessing import OrdinalEncoder
from sklearn.ensemble import RandomForestClassifier

def create_placeholder_files():
    """Create placeholder encoder.pkl and rf_model.pkl files for testing"""
    # Check if files already exist
    if os.path.exists('encoder.pkl') and os.path.exists('rf_model.pkl'):
        print("Files already exist. Skipping...")
        return
    
    print("Creating placeholder encoder and model files...")
    
    # Sample categories, merchants, and jobs
    categories = ["grocery_pos", "misc_pos", "entertainment", "food_dining", 
                  "gas_transport", "misc_net", "shopping_pos", "shopping_net"]
    merchants = [f"fraud_Merchant{i}" for i in range(1, 20)]
    jobs = ["Accountant", "Software Developer", "Teacher", "Doctor", "Lawyer", 
            "Engineer", "Manager", "Psychologist"]
    
    # Create sample data for encoder training
    sample_data = pd.DataFrame({
        'category': categories * 2,
        'merchant': merchants[:16],
        'job': jobs * 2
    })
    
    # Create and fit encoder
    enc = OrdinalEncoder(dtype=np.int64)
    enc.fit(sample_data)
    
    # Create and fit dummy model
    X = pd.DataFrame({
        'hour_of_day': np.random.randint(0, 24, 100),
        'category': enc.transform(sample_data[['category']].iloc[:100]),
        'amount(usd)': np.random.uniform(10, 500, 100),
        'merchant': enc.transform(sample_data[['merchant']].iloc[:100]),
        'job': enc.transform(sample_data[['job']].iloc[:100])
    })
    y = np.random.randint(0, 2, 100)  # Binary classification
    
    model = RandomForestClassifier(n_estimators=100, max_features='sqrt', random_state=42)
    model.fit(X, y)
    
    # Save encoder
    with open('encoder.pkl', 'wb') as f:
        pickle.dump(enc, f)
    print("Encoder saved to encoder.pkl")
    
    # Save model
    with open('rf_model.pkl', 'wb') as f:
        pickle.dump(model, f)
    print("Model saved to rf_model.pkl")

if __name__ == "__main__":
    create_placeholder_files()
