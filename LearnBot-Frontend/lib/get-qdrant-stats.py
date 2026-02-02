"""
Get Qdrant collection statistics (chunk count) directly from Qdrant
Used by the stats API endpoint to get accurate counts
"""
import sys
import os
import json
from qdrant_client import QdrantClient

# Qdrant configuration
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", None)

def get_collection_stats(collection_name: str) -> dict:
    """Get statistics for a Qdrant collection"""
    try:
        # Initialize Qdrant client
        if QDRANT_URL and QDRANT_URL.strip():
            qdrant_client = QdrantClient(
                url=QDRANT_URL,
                api_key=QDRANT_API_KEY,
                timeout=60
            )
        else:
            # Local mode
            QDRANT_PERSIST_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "vector-stores", "qdrant")
            if not os.path.exists(QDRANT_PERSIST_DIR):
                return {"chunkCount": 0, "error": "Qdrant directory not found"}
            qdrant_client = QdrantClient(path=QDRANT_PERSIST_DIR)
        
        # Get collection info
        try:
            collection_info = qdrant_client.get_collection(collection_name)
            chunk_count = collection_info.points_count
            return {"chunkCount": chunk_count, "success": True}
        except Exception as e:
            # Collection doesn't exist
            return {"chunkCount": 0, "success": True, "error": f"Collection not found: {str(e)}"}
            
    except Exception as e:
        return {"chunkCount": 0, "success": False, "error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Collection name required"}))
        sys.exit(1)
    
    collection_name = sys.argv[1]
    result = get_collection_stats(collection_name)
    print(json.dumps(result))

