import requests
import json

def test_raw_ingest():
    url = "http://127.0.0.1:8000/ingest/raw"
    payload = {
        "text": "Review for Product Alpha: This is a great product.\nReview for Product Beta: This is a bad product.",
        "source_url": None
    }
    try:
        response = requests.post(url, json=payload, timeout=60)
        data = response.json()
        print(f"Status Code: {response.status_code}")
        print(f"Response Body: {json.dumps(data, indent=2)}")
        
        if "product_ids" in data and data["product_ids"]:
            pid = data["product_ids"][0]
            prod_url = f"http://127.0.0.1:8000/products/{pid}"
            prod_res = requests.get(prod_url)
            print(f"\nProduct {pid} Details:")
            print(json.dumps(prod_res.json(), indent=2))
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_raw_ingest()
