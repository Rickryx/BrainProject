from supabase import create_client, Client
from bot_app.config import SUPABASE_URL, SUPABASE_KEY

# Initialize Supabase Client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def get_db_status():
    """Simple check to verify DB connection."""
    try:
        # Try to select from public schema (assuming tables exist)
        # Even if empty, it should return a list
        response = supabase.table("vehicles").select("count", count="exact").execute()
        return True, f"Connected. Vehicle count response: {response}"
    except Exception as e:
        return False, str(e)
