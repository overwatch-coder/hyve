import json
import os
import warnings
import logging
from pydantic import BaseModel, Field

# Suppress HuggingFace Hub unauthenticated request warnings
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

# Silence transformer/HF warnings (position_ids UNEXPECTED, etc.)
logging.getLogger("sentence_transformers").setLevel(logging.ERROR)
warnings.filterwarnings("ignore", message=".*position_ids.*")
warnings.filterwarnings("ignore", message=".*unauthenticated.*")

# Using groq/openai as an example.
class ExtractionResult(BaseModel):
    claims: list[dict] = Field(description="A list of distinct claims extracted from the review. Each object should have 'claim_text', 'evidence_text', 'context_text', 'sentiment_polarity' (positive/negative/neutral), and 'severity' (0.0 to 1.0).")

def extract_claims_from_llm(review_text: str, provider: str = "openai") -> dict:
    """
    Extracts structured claims from raw review text using an LLM. 
    Supports multiple providers via environment configuration.
    """
    prompt = f"""
    Analyze the following product review and extract key arguments/claims.
    For each distinct claim, extract:
    - The core claim (e.g., "Battery life is poor")
    - Supporting evidence from the text (e.g., "Drains within 5 hours")
    - Context (e.g., "Heavy social media use")
    - Sentiment polarity (positive, negative, or neutral)
    - Severity (a float basically mapping how critical this issue is on a scale from 0.0 to 1.0)
    
    Review text: "{review_text}"
    """
    
    # Example integration layout structure
    if provider == "openai":
        import openai
        client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        
        # In production this would use instructor or openai function calling 
        # to enforce the ExtractionResult schema. 
        # Using a simulated mock response for the structural layout.
        
        print("DEBUG: Sending request to OpenAI...")
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a senior data analyst extracting precise structured arguments from consumer reviews. Output JSON."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            timeout=30.0
        )
        print(f"DEBUG: LLM Response Content: {response.choices[0].message.content}")
        return json.loads(response.choices[0].message.content)
        
    elif provider == "gemini":
        import google.generativeai as genai
        genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
        model = genai.GenerativeModel('gemini-1.5-pro')
        response = model.generate_content(prompt + "\nOutput raw JSON.")
        return json.loads(response.text.strip('```json').strip('```'))
        
    else:
        raise ValueError(f"Unsupported LLM provider: {provider}")


def cluster_claims(claims_texts: list[str]) -> list[int]:
    """
    Groups claims into thematic clusters using SentenceTransformers and K-Means/HDBSCAN.
    Returns a list of cluster IDs corresponding to the input claims.
    """
    from sentence_transformers import SentenceTransformer
    from sklearn.cluster import KMeans
    
    if not claims_texts:
        return []
        
    # Load embedding model (all-MiniLM-L6-v2 is fast and efficient)
    # Suppress LOAD REPORT output from the model loader
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        model = SentenceTransformer('all-MiniLM-L6-v2')
    
    # Determine number of clusters (Roadmap requires 4-6 themes)
    n_clusters = max(4, min(len(claims_texts) // 4, 6))
    if len(claims_texts) < 4:
        n_clusters = 1  # Too few to cluster meaningfully into 4 themes
        n_clusters = 1  # Too few to cluster meaningfully

    embeddings = model.encode(claims_texts)
    
    if n_clusters == 1:
        return [0] * len(claims_texts)
        
    # Cluster using KMeans
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init="auto")
    kmeans.fit(embeddings)
    
    return kmeans.labels_.tolist()
