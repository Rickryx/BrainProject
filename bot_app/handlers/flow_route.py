from telebot import TeleBot, types
from bot_app.services.vehicle_service import VehicleService
from bot_app.services.ocr_service import OCRService
from bot_app.services.storage_service import StorageService
from bot_app.services.maintenance_service import MaintenanceService
from bot_app.database import supabase
from datetime import datetime

route_states = {}

def register_handlers(bot: TeleBot):
    
    @bot.message_handler(func=lambda m: m.text in ['b) Registrar inicio de recorrido', 'c) Registrar finalización de recorrido'])
    def start_route_flow(message):
        chat_id = message.chat.id
        tipo = 'start' if 'inicio' in message.text else 'end'
        
        # 1. Get Driver User
        user_res = supabase.table("users").select("id, full_name, company_id").eq("telegram_id", chat_id).execute()
        if not user_res.data:
            bot.reply_to(message, "❌ Usuario no registrado. Usa /start para vincular tu cuenta.")
            return
        
        driver_id = user_res.data[0]['id']
        full_name = user_res.data[0]['full_name']
        company_id = user_res.data[0].get('company_id')

        # 2. Get Assigned Vehicles
        assigned_vehicles = VehicleService.get_for_driver(driver_id)
        
        if not assigned_vehicles:
            bot.reply_to(message, f"❌ No se encontró una placa asignada para '{full_name}'.\n\nContacta al administrador para que te asigne una placa en el panel.")
            return

        # 3. Handle selection
        if len(assigned_vehicles) == 1:
            vehicle = assigned_vehicles[0]
            if tipo == 'start':
                from bot_app.handlers.flow_verification import start_verification_flow
                bot.send_message(chat_id, f"📋 Iniciando encuesta preoperacional para la placa {vehicle.plate}...")
                start_verification_flow(bot, chat_id, str(vehicle.id), str(driver_id), company_id)
            else:
                route_states[chat_id] = {"step": "waiting_photo", "type": tipo, "vehicle": vehicle, "company_id": company_id}
                bot.reply_to(message, f"🚗 Vehículo detectado: {vehicle.plate}\n📸 Envía foto del odómetro para el {tipo} de recorrido.", reply_markup=types.ReplyKeyboardRemove())
        else:
            # Multiple: Show list
            markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
            for v in assigned_vehicles:
                markup.add(f"{v.plate} - {v.brand}")
            markup.add("↩️ Menú Principal")
                
            route_states[chat_id] = {"step": "select_vehicle", "type": tipo}
            bot.reply_to(message, "🚗 Selecciona el vehículo:", reply_markup=markup)

    @bot.message_handler(func=lambda m: route_states.get(m.chat.id, {}).get("step") == "select_vehicle")
    def handle_vehicle_selection(message):
        chat_id = message.chat.id
        plate = message.text.split(" - ")[0].strip()
        vehicle = VehicleService.get_by_plate(plate)
        
        if not vehicle:
            bot.reply_to(message, "❌ Vehículo no válido.")
            return
            
        state = route_states[chat_id]
        state["vehicle"] = vehicle
        
        if state["type"] == 'start':
            # Trigger Verification flow first
            from bot_app.handlers.flow_verification import start_verification_flow
            # Fetch driver_id
            user_res = supabase.table("users").select("id").eq("telegram_id", chat_id).execute()
            driver_id = user_res.data[0]['id']
            
            bot.send_message(chat_id, f"📋 Iniciando encuesta preoperacional para la placa {vehicle.plate}...")
            start_verification_flow(bot, chat_id, str(vehicle.id), str(driver_id))
            del route_states[chat_id] # Clean up
        else:
            state["step"] = "waiting_photo"
            bot.reply_to(message, f"📸 Envía foto del odómetro para el FIN de recorrido ({plate})", reply_markup=types.ReplyKeyboardRemove())

    @bot.message_handler(content_types=['photo'], func=lambda m: route_states.get(m.chat.id, {}).get("step") == "waiting_photo")
    def handle_route_photo(message):
        chat_id = message.chat.id
        state = route_states[chat_id]
        vehicle = state["vehicle"]
        activity_type = state["type"]
        
        bot.reply_to(message, "🔄 Leyendo odómetro...")
        
        try:
            # File process
            file_id = message.photo[-1].file_id
            file_info = bot.get_file(file_id)
            downloaded_file = bot.download_file(file_info.file_path)
            
            # OCR
            ocr_data = OCRService.extract_odometer(downloaded_file)
            mileage = ocr_data.get('kilometraje')
            
            if not mileage:
                bot.reply_to(message, "⚠️ No pude leer el kilometraje. Escríbelo manualmente:")
                state["step"] = "waiting_manual_km"
                state["photo_bytes"] = downloaded_file # Save for later
                return

            _finalize_route_record(bot, message, chat_id, mileage, downloaded_file)

        except Exception as e:
            print(f"Error route: {e}")
            bot.reply_to(message, "❌ Error procesando foto.")

    @bot.message_handler(func=lambda m: route_states.get(m.chat.id, {}).get("step") == "waiting_manual_km")
    def handle_manual_km(message):
        chat_id = message.chat.id
        try:
            mileage = int(message.text.strip())
            photo_bytes = route_states[chat_id].get("photo_bytes")
            _finalize_route_record(bot, message, chat_id, mileage, photo_bytes)
        except ValueError:
            bot.reply_to(message, "❌ Por favor envía solo el número (ej: 125000)")

def _finalize_route_record(bot, message, chat_id, mileage, photo_bytes):
    state = route_states[chat_id]
    vehicle = state["vehicle"]
    activity_type = state["type"]
    
    # Upload
    filename = f"route_{activity_type}_{vehicle.plate}_{int(datetime.now().timestamp())}.jpg"
    photo_url = StorageService.upload_photo(photo_bytes, filename, folder="route_photos")
    
    # Get User
    user_res = supabase.table("users").select("id, company_id").eq("telegram_id", chat_id).execute()
    driver_id = user_res.data[0]['id']
    company_id = state.get("company_id") or user_res.data[0].get('company_id')

    # Save DB
    data = {
        "driver_id": str(driver_id),
        "vehicle_id": str(vehicle.id),
        "activity_type": activity_type,
        "odometer": mileage,
        "photo_url": photo_url,
        "company_id": str(company_id) if company_id else None,
    }
    supabase.table("route_records").insert(data).execute()
    
    # Update Vehicle Odometer
    supabase.table("vehicles").update({"current_odometer": mileage}).eq("id", str(vehicle.id)).execute()
    
    # Check Verification for Alerts
    if activity_type == 'end':
        MaintenanceService.check_and_generate_alerts(str(vehicle.id), mileage)
    
    bot.reply_to(message, f"✅ Recorrido {activity_type.upper()} registrado.\nKm: {mileage}")
    
    # Show Persistent Context-Aware Menu
    from bot_app.handlers.commands import show_main_menu
    show_main_menu(bot, chat_id, f"✅ Registro completado.\n\n¿Qué te gustaría hacer ahora?")
    
    del route_states[chat_id]
