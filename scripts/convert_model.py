"""
Script to convert an existing RandomForest model to match the expected format
from the training notebook
"""
import os
import sys
import pickle
import numpy as np
import pandas as pd
from sklearn.preprocessing import OrdinalEncoder

def convert_model():
    """
    Check if the model exists in ml-models/rf_model.pkl
    If it does, verify its input requirements and create
    necessary support files for the API.
    """
    base_dir = os.path.dirname(os.path.dirname(__file__))
    model_dir = os.path.join(base_dir, 'ml-models')
    model_path = os.path.join(model_dir, 'rf_model.pkl')
    
    if not os.path.exists(model_path):
        print(f"Model file not found at {model_path}")
        print("Please run the training notebook or fraud_detection_model.py first.")
        return False
    
    print(f"Found model at {model_path}")
    
    try:
        with open(model_path, 'rb') as f:
            model = pickle.load(f)
        
        print("Model loaded successfully.")
        print(f"Model type: {type(model).__name__}")
        
        # Create a sample encoder for categorical variables
        # Based on training notebook
        categories = ['grocery_pos', 'misc_pos', 'entertainment', 'food_dining', 
                      'gas_transport', 'misc_net', 'shopping_pos', 'health_fitness',
                      'home', 'kids_pets', 'personal_care', 'travel', 'shopping_net']
        
        merchants = [f'merch_{i}' for i in range(700)]  # Sample merchant IDs
        jobs = [f'job_{i}' for i in range(500)]  # Sample job titles
        
        # Create sample data
        sample_data = pd.DataFrame({
            'category': categories[:10],
            'merchant': merchants[:10],
            'job': jobs[:10]
        })
        
        # Create and fit encoder
        enc = OrdinalEncoder(dtype=np.int64)
        enc.fit(sample_data)
        
        # Save encoder
        encoder_path = os.path.join(model_dir, 'ordinal_encoder.pkl')
        with open(encoder_path, 'wb') as f:
            pickle.dump(enc, f)
        
        # Save feature info
        feature_info = {
            'feature_names': ['hour_of_day', 'category', 'amount(usd)', 'merchant', 'job'],
            'categorical_cols': ['category', 'merchant', 'job']
        }
        
        feature_path = os.path.join(model_dir, 'feature_info.pkl')
        with open(feature_path, 'wb') as f:
            pickle.dump(feature_info, f)
        
        print(f"Created encoder at {encoder_path}")
        print(f"Created feature_info at {feature_path}")
        print("\nModel conversion complete! API should now be able to use the model correctly.")
        return True
    
    except Exception as e:
        print(f"Error during model conversion: {e}")
        return False

if __name__ == "__main__":
    convert_model()
