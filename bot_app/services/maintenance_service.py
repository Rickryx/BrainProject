from typing import List, Optional
from bot_app.database import supabase
from bot_app.models import Vehicle

class MaintenanceService:
    @staticmethod
    def check_and_generate_alerts(vehicle_id: str, new_odometer: int):
        """
        Check all maintenance rules against the new odometer reading.
        If a threshold is crossed, create an alert.
        """
        try:
            # Get active rules
            rules_res = supabase.table("maintenance_rules").select("*").execute()
            rules = rules_res.data
            
            if not rules:
                return

            # Check each rule
            for rule in rules:
                interval = rule['interval_km']
                
                # Simple logic: check if we crossed a multiple of the interval
                # e.g. 5000, 10000, 15000...
                # Current simple approach: Modulo check or "next due" logic
                # For MVP: If new_odometer > next_due
                
                # In a real system, we'd store "last_maintenance_at" for each rule per vehicle.
                # Since we don't have that yet, let's just trigger if close to a multiple (simplification)
                # Better approach: Just log the odometer. The Dashboard will calculate "Next Due".
                
                # Let's create an alert if we are within 500km of a multiple
                remainder = new_odometer % interval
                if remainder > (interval - 500) or remainder < 100:
                    # Check if active alert already exists for this rule/vehicle
                    existing = supabase.table("maintenance_alerts")\
                        .select("*")\
                        .eq("vehicle_id", vehicle_id)\
                        .eq("rule_id", rule['id'])\
                        .eq("status", "active")\
                        .execute()
                    
                    if not existing.data:
                        # Create Alert
                        alert_data = {
                            "vehicle_id": vehicle_id,
                            "rule_id": rule['id'],
                            "status": "active",
                            "triggered_at_km": new_odometer
                        }
                        supabase.table("maintenance_alerts").insert(alert_data).execute()
                        print(f"⚠️ Alert generated for vehicle {vehicle_id}: {rule['name']}")

        except Exception as e:
            print(f"Maintenance Check Error: {e}")

    @staticmethod
    def create_default_rules():
        """Seed default rules if empty."""
        try:
            res = supabase.table("maintenance_rules").select("*").execute()
            if not res.data:
                defaults = [
                    {"name": "Cambio de Aceite", "interval_km": 5000, "description": "Cambio de aceite y filtro"},
                    {"name": "Rotación de Llantas", "interval_km": 10000, "description": "Rotación y balanceo"},
                    {"name": "Revisión Frenos", "interval_km": 15000, "description": "Pastillas y líquido"}
                ]
                supabase.table("maintenance_rules").insert(defaults).execute()
                print("✅ Default maintenance rules seeded.")
        except Exception as e:
            print(f"Error seeding rules: {e}")
