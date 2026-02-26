from typing import Optional
from bot_app.database import supabase
from bot_app.models import Vehicle

class VehicleService:
    @staticmethod
    def get_by_plate(plate: str) -> Optional[Vehicle]:
        """Fetch a vehicle by its license plate."""
        try:
            # Normalize plate
            clean_plate = plate.upper().replace("-", "").strip()
            
            response = supabase.table("vehicles").select("*").eq("plate", clean_plate).execute()
            
            if response.data and len(response.data) > 0:
                return Vehicle(**response.data[0])
            return None
        except Exception as e:
            print(f"Error fetching vehicle {plate}: {e}")
            return None

    @staticmethod
    def get_all_active():
        """Get all active vehicles."""
        try:
            response = supabase.table("vehicles").select("*").eq("status", "Activo").execute()
            return [Vehicle(**v) for v in response.data]
        except Exception as e:
            print(f"Error fetching vehicles: {e}")
            return []

    @staticmethod
    def get_for_driver(driver_id: str):
        """Get vehicles assigned to a specific driver."""
        try:
            response = supabase.table("driver_assignments")\
                .select("*, vehicles(*)")\
                .eq("driver_id", driver_id)\
                .eq("is_active", True)\
                .execute()
            
            vehicles = []
            for item in response.data:
                if item.get("vehicles"):
                    vehicles.append(Vehicle(**item["vehicles"]))
            return vehicles
        except Exception as e:
            print(f"Error fetching driver vehicles: {e}")
            return []
    @staticmethod
    def get_by_id(vehicle_id: str) -> Optional[Vehicle]:
        """Fetch a vehicle by its UUID."""
        try:
            response = supabase.table("vehicles").select("*").eq("id", vehicle_id).execute()
            if response.data and len(response.data) > 0:
                return Vehicle(**response.data[0])
            return None
        except Exception as e:
            print(f"Error fetching vehicle by id {vehicle_id}: {e}")
            return None
