from datetime import datetime
from bot_app.database import supabase

class StorageService:
    BUCKET_NAME = "fleet_photos"

    @staticmethod
    def upload_file(file_bytes: bytes, filename: str, folder: str = "docs") -> str:
        """Upload a file to Supabase Storage and return the public URL."""
        return StorageService.upload_photo(file_bytes, filename, folder)

    @staticmethod
    def upload_photo(file_bytes: bytes, filename: str, folder: str = "misc") -> str:
        """Upload a photo to Supabase Storage and return the public URL."""
        try:
             # Ensure path
            path = f"{folder}/{filename}"
            
            # Upload
            res = supabase.storage.from_(StorageService.BUCKET_NAME).upload(
                file=file_bytes,
                path=path,
                file_options={"upsert": "true"}
            )
            
            # Get Public URL
            public_url = supabase.storage.from_(StorageService.BUCKET_NAME).get_public_url(path)
            return public_url
        except Exception as e:
            print(f"Upload Error: {e}")
            return None
