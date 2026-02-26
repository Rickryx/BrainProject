from telebot import TeleBot, types
from bot_app.services.vehicle_service import VehicleService
from bot_app.services.ocr_service import OCRService
from bot_app.services.storage_service import StorageService
from bot_app.database import supabase
from datetime import datetime

# Simple in-memory state for MVP (ideal: Redis)
fuel_states = {}

def register_handlers(bot: TeleBot):
    
    @bot.message_handler(func=lambda m: m.text == 'a) Registrar tanqueada')
    def start_fuel_flow(message):
        chat_id = message.chat.id
        fuel_states[chat_id] = {"step": "waiting_photo"}
        
        bot.reply_to(message, "📸 Por favor envía la foto de la factura de la tanqueada.", 
                     reply_markup=types.ReplyKeyboardRemove())

    @bot.message_handler(content_types=['photo'], func=lambda m: fuel_states.get(m.chat.id, {}).get("step") == "waiting_photo")
    def handle_fuel_photo(message):
        chat_id = message.chat.id
        
        bot.reply_to(message, "🔄 Analizando factura con IA... (esto puede tardar unos segundos)")
        
        try:
            # Get Photo
            file_id = message.photo[-1].file_id
            file_info = bot.get_file(file_id)
            downloaded_file = bot.download_file(file_info.file_path)
            
            # 1. Get Driver Info
            user_res = supabase.table("users").select("*").eq("telegram_id", chat_id).execute()
            if not user_res.data:
                 bot.reply_to(message, "❌ Usuario no registrado. Usa /start primero.")
                 return
            
            driver_data = user_res.data[0]
            driver_id = driver_data['id']
            company_id = driver_data.get('company_id')

            # 2. Get Assigned Vehicle
            assigned_vehicles = VehicleService.get_for_driver(driver_id)
            if not assigned_vehicles:
                bot.reply_to(message, "⚠️ No tienes ningún vehículo asignado. Por favor contacta al administrador.")
                return
            
            # Use the first active vehicle assigned
            vehicle = assigned_vehicles[0]
            placa = vehicle.plate

            # 3. OCR Analysis (Now without needing plate)
            ocr_data = OCRService.extract_fuel_info(downloaded_file)
            
            # 4. Upload Photo
            filename = f"fuel_{placa}_{int(datetime.now().timestamp())}.jpg"
            photo_url = StorageService.upload_photo(downloaded_file, filename, folder="fuel_receipts")
            
            # 5. Save Record
            
            fuel_record = {
                "driver_id": str(driver_id),
                "vehicle_id": str(vehicle.id),
                "gallons": ocr_data.get('combustible_galones') or 0,
                "cost_total": ocr_data.get('costo_total') or 0,
                "price_per_gallon": ocr_data.get('valor_galon') or 0,
                "mileage": ocr_data.get('kilometraje') or 0,
                "station_name": ocr_data.get('lugar') or "Unknown",
                "photo_url": photo_url,
                "company_id": str(company_id) if company_id else None,
            }
            
            supabase.table("fuel_records").insert(fuel_record).execute()
            
            # 6. Update Vehicle Odometer
            if fuel_record['mileage'] > 0:
                supabase.table("vehicles").update({"current_odometer": fuel_record['mileage']}).eq("id", str(vehicle.id)).execute()
            
            # Response
            msg = (f"✅ **Tanqueada Registrada**\n\n"
                   f"🚗 Placa: `{placa}`\n"
                   f"⛽ Galones: {fuel_record['gallons']}\n"
                   f"💰 Costo: ${fuel_record['cost_total']}\n"
                   f"📍 Lugar: {fuel_record['station_name']}\n"
                   f"📟 Km registrado: `{fuel_record['mileage']}`\n\n"
                   f"_[Foto guardada en sistema]_")
            
            bot.reply_to(message, msg, parse_mode="Markdown")
            
            # Clear state
            if chat_id in fuel_states: del fuel_states[chat_id]
            
            # Back to menu
            from bot_app.handlers.commands import show_main_menu
            show_main_menu(bot, chat_id, "¿Qué te gustaría hacer ahora?")
            
        except Exception as e:
            print(f"Error in fuel flow: {e}")
            bot.reply_to(message, "❌ Ocurrió un error procesando la tanqueada. Intenta de nuevo.")
