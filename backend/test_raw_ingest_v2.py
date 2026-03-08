import requests
import json
import time

def test_raw_ingest():
    # Clean up old products first if they exist
    # Note: We don't have a direct 'delete' by name for multiple, but we can try 5 and 6
    # Or just use new names to be sure
    
    url = "http://127.0.0.1:8000/ingest/raw"
    payload = {
        "text": "Review for SuperGadget X1: This is a revolutionary device with great battery.\nReview for SuperGadget X1: The screen is a bit dim though.\nReview for AquaPure Filter: Best water filter I have ever owned. Crystal clear water!",
        "source_url": None
    }
    try:
        print("Starting fresh ingestion...")
        response = requests.post(url, json=payload, timeout=60)
        data = response.json()
        print(f"Status Code: {response.status_code}")
        print(f"Initial Response: {json.dumps(data, indent=2)}")
        
        if "product_ids" in data and data["product_ids"]:
            pids = data["product_ids"]
            for pid in pids:
                print(f"\nMonitoring Product {pid}...")
                for _ in range(10): # Poll for up to 50 seconds
                    prod_res = requests.get(f"http://127.0.0.1:8000/products/{pid}")
                    p_data = prod_res.json()
                    status = p_data.get("status")
                    step = p_data.get("processing_step")
                    print(f"  Status: {status} | Step: {step}")
                    if status in ["ready", "error"]:
                        if status == "ready":
                            print(f"  SUCCESS: Product {pid} is ready. Category: {p_data.get('category')}")
                        break
                    time.sleep(5)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_raw_ingest()
