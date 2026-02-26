import json
from openai import OpenAI
from bot_app.config import OPENAI_API_KEY
from bot_app.database import supabase
from bot_app.services.user_service import UserService

class AIService:
    def __init__(self, bot=None):
        self.client = OpenAI(api_key=OPENAI_API_KEY)
        self.bot = bot # Needed to send notifications via tools

    def get_fleet_summary(self):
        """Returns a snapshot of the current fleet status."""
        try:
            v_res = supabase.table("vehicles").select("status, plate").execute()
            if not v_res.data:
                return "No hay vehículos registrados."
            
            total = len(v_res.data)
            active = len([v for v in v_res.data if v['status'] == 'Activo'])
            maintenance = len([v for v in v_res.data if v['status'] == 'Mantenimiento'])
            
            summary = (f"Resumen de Flota:\n"
                      f"- Total: {total} vehículos\n"
                      f"- Activos: {active}\n"
                      f"- En Mantenimiento: {maintenance}\n")
            return summary
        except Exception as e:
            return f"Error al obtener resumen: {str(e)}"

    def get_vehicle_details(self, plate: str):
        """Returns detailed information about a vehicle by its plate, including last update time."""
        try:
            plate = plate.upper().strip()
            res = supabase.table("vehicles").select("*").eq("plate", plate).maybe_single().execute()
            if not res.data:
                return f"No encontré el vehículo con placa {plate}."
            
            v = res.data
            
            # GET CURRENT DRIVER FROM ASSIGNMENTS
            asg_res = supabase.table("driver_assignments")\
                .select("users(full_name)")\
                .eq("vehicle_id", v['id'])\
                .eq("role", "principal")\
                .eq("is_active", True)\
                .maybe_single()\
                .execute()
            
            current_driver = asg_res.data['users']['full_name'] if asg_res.data and asg_res.data.get('users') else v['main_driver']
            
            # GET LAST RECORD TIMESTAMP
            last_rec = supabase.table("route_records")\
                .select("recorded_at")\
                .eq("vehicle_id", v['id'])\
                .order("recorded_at", descending=True)\
                .limit(1)\
                .execute()
            
            last_update_str = "Sin registros recientes"
            if last_rec.data:
                from datetime import datetime
                dt = datetime.fromisoformat(last_rec.data[0]['recorded_at'].replace('Z', '+00:00'))
                last_update_str = dt.strftime("%Y-%m-%d %H:%M")

            details = (f"Detalles de {v['plate']}:\n"
                       f"- Modelo: {v['brand']} {v['line']} ({v['model']})\n"
                       f"- Estado: {v['status']}\n"
                       f"- Conductor: {current_driver}\n"
                       f"- Ubicación: {v['location']}\n"
                       f"- Odómetro: {v['current_odometer']} km\n"
                       f"- Última Actividad: {last_update_str}")
            return details
        except Exception as e:
            return f"Error al buscar vehículo: {str(e)}"

    def get_driver_info(self, name: str):
        """Finds a driver by name and returns their details and assignments."""
        try:
            res = supabase.table("users").select("*").ilike("full_name", f"%{name}%").execute()
            if not res.data:
                return f"No encontré conductores con el nombre '{name}'."
            
            output = "Resultados encontrados:\n"
            for u in res.data:
                assignments = supabase.table("driver_assignments")\
                    .select("role, vehicles(plate, line)")\
                    .eq("driver_id", u['id'])\
                    .eq("is_active", True)\
                    .execute()
                
                asg_text = ", ".join([f"{a['vehicles']['plate']} ({a['role']})" for a in assignments.data if a.get('vehicles')]) or "Sin asignación"
                output += (f"- {u['full_name']} (ID: {u['telegram_id'] or 'No vinculado'})\n"
                          f"  Rol: {u['role']}\n"
                          f"  Vehículos: {asg_text}\n")
            return output
        except Exception as e:
            return f"Error al buscar conductor: {str(e)}"

    def send_notification_to_driver(self, name: str, message: str):
        """Sends a Telegram message to a driver via the bot."""
        if not self.bot:
            return "El bot no está inicializado en AIService."
        
        try:
            res = supabase.table("users").select("telegram_id, full_name").ilike("full_name", f"%{name}%").execute()
            if not res.data:
                return f"No encontré al conductor '{name}' para enviarle el mensaje."
            
            driver = res.data[0]
            if not driver['telegram_id']:
                return f"El conductor {driver['full_name']} no ha vinculado su cuenta de Telegram aún."
            
            self.bot.send_message(driver['telegram_id'], f"🔔 **Notificación de Administración**:\n\n{message}", parse_mode="Markdown")
            return f"✅ Mensaje enviado a {driver['full_name']}."
        except Exception as e:
            return f"Error al enviar notificación: {str(e)}"

    def get_daily_activity(self, name: str, date_str: str = None):
        """Returns detailed logs of activity for a driver on a specific date."""
        try:
            from datetime import datetime
            if not date_str:
                date_str = datetime.now().strftime("%Y-%m-%d")
            
            u_res = supabase.table("users").select("id, full_name").ilike("full_name", f"%{name}%").maybe_single().execute()
            if not u_res.data:
                return f"No encontré al conductor '{name}'."
            
            u_id = u_res.data['id']
            # Fetch records for that day
            r_res = supabase.table("route_records")\
                .select("activity_type, recorded_at, odometer")\
                .eq("driver_id", u_id)\
                .gte("recorded_at", f"{date_str}T00:00:00")\
                .lte("recorded_at", f"{date_str}T23:59:59")\
                .order("recorded_at", desc=False)\
                .execute()
            
            if not r_res.data:
                return f"No hay registros de actividad para {u_res.data['full_name']} el día {date_str}."
            
            logs = []
            for r in r_res.data:
                # Localize or just format time
                dt = datetime.fromisoformat(r['recorded_at'].replace('Z', '+00:00'))
                time_str = dt.strftime("%H:%M")
                type_name = "Inicio" if r['activity_type'] == 'start' else "Fin" if r['activity_type'] == 'end' else r['activity_type']
                logs.append(f"• {time_str} | {type_name} | {r['odometer']} km")
            
            output = f"Actividad de {u_res.data['full_name']} el {date_str}:\n" + "\n".join(logs)
            return output
        except Exception as e:
            return f"Error al consultar actividad: {str(e)}"

    def get_recent_activity(self, limit: int = 10):
        """Returns a list of the most recent activity records in the fleet."""
        try:
            res = supabase.table("route_records")\
                .select("activity_type, recorded_at, vehicles(plate), users(full_name)")\
                .order("recorded_at", desc=True)\
                .limit(limit)\
                .execute()
            
            if not res.data:
                return "No hay registros de actividad recientes."
            
            logs = []
            from datetime import datetime
            for r in res.data:
                dt = datetime.fromisoformat(r['recorded_at'].replace('Z', '+00:00'))
                time_str = dt.strftime("%Y-%m-%d %H:%M")
                driver = r['users']['full_name'] if r.get('users') else "Desconocido"
                plate = r['vehicles']['plate'] if r.get('vehicles') else "N/A"
                act = "Inició" if r['activity_type'] == 'start' else "Finalizó" if r['activity_type'] == 'end' else r['activity_type']
                logs.append(f"• {time_str} | {driver} ({plate}) | {act}")
            
            return "Últimos registros de actividad:\n" + "\n".join(logs)
        except Exception as e:
            return f"Error al obtener actividad reciente: {str(e)}"

    def process_query(self, user_id: int, query: str):
        """Processes a natural language query using OpenAI Function Calling."""
        from datetime import datetime
        now = datetime.now()
        date_context = now.strftime("%Y-%m-%d %H:%M:%S")
        
        system_prompt = (
            f"Eres el Asistente de IA de Datactar Decision-OS. Tu objetivo es ayudar a los administradores "
            f"a gestionar la flota de vehículos y conductores.\n\n"
            f"Fecha y Hora Actual: {date_context} (Colombia)\n\n"
            f"REGLAS CRÍTICAS:\n"
            f"1. NO des respuestas genéricas si puedes obtener datos reales.\n"
            f"2. Si el usuario pregunta qué ha pasado, quién ha trabajado o quién registró recorridos, "
            f"USA 'get_recent_activity' para ver los últimos movimientos.\n"
            f"3. Si conoces un vehículo o conductor mencionado, usa las herramientas específicas para dar detalles.\n"
            f"4. Tu respuesta debe ser siempre basada en los DATOS devueltos por las herramientas."
        )

        tools = [
            {
                "type": "function",
                "function": {
                    "name": "get_fleet_summary",
                    "description": "Obtiene un resumen general de la flota (total, activos, etc.)",
                    "parameters": {"type": "object", "properties": {}}
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "get_vehicle_details",
                    "description": "Obtiene información detallada de un vehículo específico por su placa",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "plate": {"type": "string", "description": "Placa del vehículo, ej: ABC123"}
                        },
                        "required": ["plate"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "get_driver_info",
                    "description": "Busca información de conductores por su nombre",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string", "description": "Nombre o parte del nombre del conductor"}
                        },
                        "required": ["name"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "get_daily_activity",
                    "description": "Consulta si un conductor tuvo registros de actividad en una fecha específica",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string", "description": "Nombre del conductor"},
                            "date_str": {"type": "string", "description": "Fecha en formato YYYY-MM-DD (opcional, por defecto hoy)"}
                        },
                        "required": ["name"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "get_recent_activity",
                    "description": "Obtiene una lista de los registros de actividad más recientes de toda la flota (quién, cuándo, vehículo)",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "limit": {"type": "integer", "description": "Número de registros a obtener (default 10)"}
                        }
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "send_notification_to_driver",
                    "description": "Envía un mensaje directo a un conductor vía Telegram",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string", "description": "Nombre exacto o aproximado del conductor"},
                            "message": {"type": "string", "description": "Contenido del mensaje a enviar"}
                        },
                        "required": ["name", "message"]
                    }
                }
            }
        ]

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query}
        ]

        response = self.client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=tools,
            tool_choice="auto"
        )

        response_message = response.choices[0].message
        tool_calls = response_message.tool_calls

        thinking_content = response_message.content or ""

        if tool_calls:
            # If there's thinking content, we should send it or store it
            # For simplicity, we'll prefix it to the final response
            messages.append(response_message)
            for tool_call in tool_calls:
                function_name = tool_call.function.name
                function_args = json.loads(tool_call.function.arguments)
                
                if function_name == "get_fleet_summary":
                    result = self.get_fleet_summary()
                elif function_name == "get_vehicle_details":
                    result = self.get_vehicle_details(function_args.get("plate"))
                elif function_name == "get_driver_info":
                    result = self.get_driver_info(function_args.get("name"))
                elif function_name == "get_daily_activity":
                    result = self.get_daily_activity(function_args.get("name"), function_args.get("date_str"))
                elif function_name == "get_recent_activity":
                    result = self.get_recent_activity(function_args.get("limit", 10))
                elif function_name == "send_notification_to_driver":
                    result = self.send_notification_to_driver(function_args.get("name"), function_args.get("message"))
                else:
                    result = "Herramienta no encontrada."

                messages.append({
                    "tool_call_id": tool_call.id,
                    "role": "tool",
                    "name": function_name,
                    "content": result
                })
            
            final_response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=messages
            )
            
            final_content = final_response.choices[0].message.content
            if thinking_content:
                return f"{thinking_content}\n\n{final_content}"
            return final_content
        
        return response_message.content
