import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Telegram Bot Config
BOT_TOKEN = os.getenv("BOT_TOKEN")

# OpenAI Config
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Supabase Config
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not all([BOT_TOKEN, OPENAI_API_KEY, SUPABASE_URL, SUPABASE_KEY]):
    raise ValueError("Missing required environment variables. Check .env file.")
