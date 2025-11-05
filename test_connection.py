from supabase import create_client, Client

# Your Supabase credentials
SUPABASE_URL = "https://scjlcrxzrylhrtzeiwql.supabase.co"
SUPABASE_KEY = "REDACTED_SUPABASE_KEY"  # YOU NEED TO GET THIS FROM SETTINGS > API

def test_connection():
    try:
        # Create client
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        
        # Try to access the database (even with a non-existent table)
        # This will verify the connection works
        result = supabase.table('test_table').select("*").limit(1).execute()
        print("✅ Successfully connected to Supabase!")
        
    except Exception as e:
        error_msg = str(e)
        
        # These errors actually mean we ARE connected, just the table doesn't exist
        if any(word in error_msg.lower() for word in ['relation', 'table', 'does not exist', '"test_table"']):
            print("✅ Connected to Supabase successfully!")
            print("   (Connection verified - got expected 'table not found' response)")
        
        # This means there's an auth issue
        elif 'invalid api key' in error_msg.lower() or 'jwt' in error_msg.lower():
            print("❌ Connection failed: Invalid API key")
            print("   Please get your 'anon' key from Supabase Dashboard > Settings > API")
        
        # Other connection issues
        else:
            print(f"❌ Connection issue: {error_msg}")

# Run the test
test_connection()