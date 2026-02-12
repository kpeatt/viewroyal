import os

from dotenv import load_dotenv  # Import this

# Load environment variables from .env file
load_dotenv()  # Run this

# Base URLs
CIVICWEB_BASE_URL = "https://viewroyalbc.civicweb.net"
VIMEO_PROFILE_URL = "https://vimeo.com/viewroyal"

# API Credentials
VIMEO_ACCESS_TOKEN = os.environ.get("VIMEO_TOKEN")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

# AI Settings
USE_PARAKEET = os.environ.get("USE_PARAKEET", "false").lower() == "true"
# Diarization
DIARIZATION_DEVICE = os.environ.get("DIARIZATION_DEVICE", "mps")

# Ollama / Marker Configuration
MARKER_LLM_SERVICE = os.environ.get(
    "MARKER_LLM_SERVICE", "marker.services.ollama.OllamaService"
)
MARKER_LLM_BASE_URL = os.environ.get("MARKER_LLM_BASE_URL", "http://192.168.1.10:11434")
MARKER_LLM_MODEL = os.environ.get("MARKER_LLM_MODEL", "qwen3:14b")

# Local Storage
# Files will be downloaded directly into this clean structure
OUTPUT_DIR = os.path.join(os.getcwd(), "viewroyal_archive")

# Network Settings
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
REQUEST_TIMEOUT = 30
DELAY_BETWEEN_REQUESTS = 0.1

# Cookie Settings for Vimeo
# Options: 'chrome', 'firefox', 'safari', 'opera', 'edge', 'brave'
COOKIE_BROWSER = "chrome"
