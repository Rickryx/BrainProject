from typing import Optional
from bot_app.database import supabase
from bot_app.models import User

class UserService:
    @staticmethod
    def get_by_telegram_id(telegram_id: int) -> Optional[User]:
        """Fetch a user by Telegram ID."""
        try:
            response = supabase.table("users").select("*").eq("telegram_id", telegram_id).execute()
            if response.data:
                return User(**response.data[0])
            return None
        except Exception as e:
            print(f"Error fetching user {telegram_id}: {e}")
            return None

    @staticmethod
    def delete_user(user_id: str) -> bool:
        """Delete a user by ID."""
        try:
            supabase.table("users").delete().eq("id", user_id).execute()
            return True
        except:
            return False

    @staticmethod
    def link_user_by_name(telegram_id: int, dashboard_name: str) -> Optional[User]:
        """Manually link a Telegram ID to an existing user by their dashboard name."""
        try:
            # 1. Search for a pending user with that name
            pending_response = supabase.table("users").select("*")\
                .ilike("full_name", dashboard_name.strip())\
                .execute()
            
            if not pending_response.data:
                # Try partial match if no exact match
                pending_response = supabase.table("users").select("*")\
                    .ilike("full_name", f"%{dashboard_name.strip()}%")\
                    .execute()
                
            if not pending_response.data:
                return None
            
            user_data = pending_response.data[0]
            new_master_id = user_data['id']
            
            # 2. Before updating, check if this telegram_id already has a "ghost" user
            ghost_res = supabase.table("users").select("id").eq("telegram_id", telegram_id).neq("id", new_master_id).execute()
            if ghost_res.data:
                for ghost in ghost_res.data:
                    ghost_id = ghost['id']
                    # Transfer all history to the master profile
                    supabase.table("driver_assignments").update({"driver_id": new_master_id}).eq("driver_id", ghost_id).execute()
                    supabase.table("route_records").update({"driver_id": new_master_id}).eq("driver_id", ghost_id).execute()
                    supabase.table("fuel_records").update({"driver_id": new_master_id}).eq("driver_id", ghost_id).execute()
                    supabase.table("verifications").update({"driver_id": new_master_id}).eq("driver_id", ghost_id).execute()
                    
                    # Delete the empty ghost
                    supabase.table("users").delete().eq("id", ghost_id).execute()

            # 3. Update the master record with the Telegram ID
            update_res = supabase.table("users").update({"telegram_id": telegram_id})\
                .eq("id", new_master_id)\
                .execute()
            
            if update_res.data:
                return User(**update_res.data[0])
            return None
        except Exception as e:
            print(f"Error linking user by name: {e}")
            return None

    @staticmethod
    def create_or_update_driver(telegram_id: int, full_name: str) -> Optional[User]:
        """Create a new driver or link to an existing pending driver."""
        try:
            # Normalize name to Title Case
            full_name = full_name.title().strip()
            
            # 1. Check if already registered by telegram_id
            existing = UserService.get_by_telegram_id(telegram_id)
            if existing:
                return existing
            
            # 2. Check if there's a pending user with the same name (case insensitive)
            # This allows linking pre-registered drivers from the dashboard
            pending_response = supabase.table("users").select("*")\
                .ilike("full_name", full_name)\
                .is_("telegram_id", "null")\
                .execute()
            
            if pending_response.data:
                user_id = pending_response.data[0]['id']
                # Update identifying telegram_id
                update_res = supabase.table("users").update({"telegram_id": telegram_id})\
                    .eq("id", user_id)\
                    .execute()
                if update_res.data:
                    return User(**update_res.data[0])
            
            # 3. Create new user if no pending match found
            data = {
                "telegram_id": telegram_id,
                "full_name": full_name,
                "role": "driver"
            }
            response = supabase.table("users").insert(data).execute()
            if response.data:
                return User(**response.data[0])
            return None
        except Exception as e:
            print(f"Error creating/linking user {telegram_id}: {e}")
            return None

    @staticmethod
    def is_admin(telegram_id: int) -> bool:
        """Check if a user is an admin."""
        user = UserService.get_by_telegram_id(telegram_id)
        return user is not None and user.role == "admin"
