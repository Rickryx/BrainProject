from telebot import TeleBot, types
from bot_app.database import supabase
from bot_app.services.ocr_service import OCRService
from bot_app.services.storage_service import StorageService
from bot_app.services.user_service import UserService
from bot_app.services.vehicle_service import VehicleService

doc_states = {}

def register_handlers(bot: TeleBot):
    @bot.message_handler(func=lambda m: m.chat.id in doc_states and doc_states[m.chat.id].get("step") == "waiting_type")
    def handle_doc_type(message):
        _handle_type_selection(bot, message)

    @bot.message_handler(content_types=['photo', 'document'], func=lambda m: m.chat.id in doc_states and doc_states[m.chat.id].get("step") in ["waiting_photo", "waiting_back_photo"])
    def handle_doc_input(message):
        state = doc_states[message.chat.id]
        if state["step"] == "waiting_photo":
            _handle_first_input(bot, message)
        elif state["step"] == "waiting_back_photo":
            _handle_back_photo(bot, message)

    @bot.message_handler(func=lambda m: m.chat.id in doc_states and doc_states[m.chat.id].get("step") == "waiting_confirmation")
    def handle_doc_confirmation(message):
        _handle_confirmation(bot, message)

def start_doc_flow(bot, chat_id):
    doc_states[chat_id] = {"step": "waiting_type"}
    markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
    markup.add("SOAT", "Tecnomecánica", "Licencia de Conducción", "Tarjeta de Operación", "Póliza DOC", "Otros")
    markup.add("↩️ Menú Principal")
    bot.send_message(chat_id, "📄 Selecciona el tipo de documento que deseas cargar:", reply_markup=markup)

def _handle_type_selection(bot, message):
    chat_id = message.chat.id
    text = message.text
    
    if text == "↩️ Menú Principal":
        if chat_id in doc_states: del doc_states[chat_id]
        from bot_app.handlers.commands import show_main_menu
        show_main_menu(bot, chat_id)
        return

    doc_type_map = {
        "SOAT": "SOAT",
        "Tecnomecánica": "Tecno",
        "Licencia de Conducción": "Licencia",
        "Tarjeta de Operación": "Tarjeta de Operación",
        "Póliza DOC": "Póliza",
        "Otros": "Otros"
    }
    
    if text not in doc_type_map:
        bot.reply_to(message, "⚠️ Por favor selecciona una opción válida.")
        return
        
    doc_states[chat_id]["doc_type"] = doc_type_map[text]
    doc_states[chat_id]["step"] = "waiting_photo"
    
    if doc_type_map[text] == "Licencia":
        bot.send_message(chat_id, "📸 Por favor envía una foto clara del **FRENTE** de tu licencia:", reply_markup=types.ReplyKeyboardRemove(), parse_mode="Markdown")
    else:
        bot.send_message(chat_id, f"📸 Por favor envía una foto o el archivo PDF de tu {text}:", reply_markup=types.ReplyKeyboardRemove())

def _handle_first_input(bot, message):
    chat_id = message.chat.id
    state = doc_states[chat_id]
    
    bot.send_message(chat_id, "⏳ Recibido. Procesando...")
    
    try:
        # Check if it's a document (PDF) or photo
        if message.content_type == 'document':
            if not message.document.mime_type == 'application/pdf':
                bot.reply_to(message, "⚠️ Por favor envía el documento en formato PDF o como una foto.")
                return
            file_id = message.document.file_id
        else:
            file_id = message.photo[-1].file_id

        file_info = bot.get_file(file_id)
        downloaded_file = bot.download_file(file_info.file_path)
        
        if state["doc_type"] == "Licencia":
            state["photo_front"] = downloaded_file
            state["step"] = "waiting_back_photo"
            bot.send_message(chat_id, "📸 Ahora envía una foto del **REVERSO** de tu licencia:", parse_mode="Markdown")
        else:
            _process_with_ai(bot, chat_id, downloaded_file)
            
    except Exception as e:
        print(f"Error handling first input: {e}")
        bot.send_message(chat_id, "❌ Error al recibir el archivo. Inténtalo de nuevo.")

def _handle_back_photo(bot, message):
    chat_id = message.chat.id
    if not message.photo:
        bot.reply_to(message, "⚠️ Por favor envía una foto del reverso.")
        return

    bot.send_message(chat_id, "⏳ Procesando ambas caras con IA...")
    
    try:
        file_info = bot.get_file(message.photo[-1].file_id)
        downloaded_file = bot.download_file(file_info.file_path)
        
        state = doc_states[chat_id]
        state["photo_back"] = downloaded_file
        
        # Combine or just use front for OCR if that's what the service does
        # For now, let's process with the front one predominantly or enhance OCR service
        _process_with_ai(bot, chat_id, state["photo_front"], back_bytes=state["photo_back"])
        
    except Exception as e:
        print(f"Error handling back photo: {e}")
        bot.send_message(chat_id, "❌ Error al procesar las imágenes.")

def _process_with_ai(bot, chat_id, file_bytes, back_bytes=None):
        
    try:
        doc_type = doc_states[chat_id]["doc_type"]
        
        # Call OCR Service (we'll need to update it to handle back_bytes or PDFs if possible)
        # For now, if it's a license, we pass both if available. 
        # If it's a PDF, we might need to update the service later.
        info = OCRService.extract_legal_doc_info(file_bytes, doc_type)
        
        if not info or not info.get("expiration_date"):
            bot.send_message(chat_id, "❌ No pude extraer la fecha de vencimiento. Por favor inténtalo con una imagen o PDF más claro.")
            doc_states[chat_id]["step"] = "waiting_photo" # Reset
            return

        # 3. Store temporary info
        doc_states[chat_id]["extracted_info"] = info
        doc_states[chat_id]["file_bytes"] = file_bytes # Store primary file
        doc_states[chat_id]["step"] = "waiting_confirmation"
        
        msg = f"🔍 **Información Extraída:**\n\n"
        msg += f"📅 Vencimiento: `{info.get('expiration_date') or 'N/A'}`\n"
        msg += f"🔢 Nro: `{info.get('document_number') or 'N/A'}`\n"
        msg += f"🏢 Entidad: `{info.get('issuer') or 'N/A'}`\n"
        msg += f"🆔 Asociado: `{info.get('associated_id') or 'N/A'}`\n\n"
        msg += "¿Es correcta esta información?"
        
        markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
        markup.add("✅ Sí, es correcta", "❌ No, reintentar", "↩️ Menú Principal")
        bot.send_message(chat_id, msg, reply_markup=markup, parse_mode="Markdown")
    except Exception as e:
        print(f"Error processing doc: {e}")
        bot.send_message(chat_id, "❌ Error al procesar el documento. Inténtalo de nuevo.")

def _handle_confirmation(bot, message):
    chat_id = message.chat.id
    text = message.text
    
    if text == "❌ No, reintentar":
        doc_states[chat_id]["step"] = "waiting_photo"
        bot.send_message(chat_id, "📸 Envía el documento de nuevo:", reply_markup=types.ReplyKeyboardRemove())
        return

    if text == "↩️ Menú Principal":
        if chat_id in doc_states: del doc_states[chat_id]
        from bot_app.handlers.commands import show_main_menu
        show_main_menu(bot, chat_id)
        return
        
    if text == "✅ Sí, es correcta":
        bot.send_message(chat_id, "💾 Guardando documento...")
        state = doc_states[chat_id]
        info = state["extracted_info"]
        
        try:
            # 1. Upload to Storage
            # Determine extension
            ext = "pdf" if state.get("is_pdf") else "jpg"
            file_path = f"docs/{chat_id}_{state['doc_type']}_{info['expiration_date']}.{ext}"
            file_url = StorageService.upload_file(state["file_bytes"], file_path)
            
            # 2. Resolve Entity ID
            user = UserService.get_by_telegram_id(chat_id)
            entity_type = "driver"
            entity_id = str(user.id)
            
            if state["doc_type"] in ["SOAT", "Tecno", "Tarjeta de Operación", "Póliza"]:
                entity_type = "vehicle"
                vehicles = VehicleService.get_for_driver(str(user.id))
                if vehicles:
                    entity_id = str(vehicles[0].id)
                else:
                    plate = info.get("associated_id")
                    if plate:
                        v = supabase.table("vehicles").select("id").eq("plate", plate.upper()).execute()
                        if v.data: entity_id = v.data[0]['id']

            # 3. Save to DB
            doc_data = {
                "entity_type": entity_type,
                "entity_id": entity_id,
                "doc_type": state["doc_type"],
                "expiration_date": info["expiration_date"],
                "document_number": info.get("document_number"),
                "issuer": info.get("issuer"),
                "file_url": file_url,
                "metadata": info
            }
            
            supabase.table("legal_documents").insert(doc_data).execute()
            
            bot.send_message(chat_id, "✅ Documento registrado correctamente.")
            if chat_id in doc_states: del doc_states[chat_id]
            from bot_app.handlers.commands import show_main_menu
            show_main_menu(bot, chat_id)
        except Exception as e:
            print(f"Error saving doc: {e}")
            bot.send_message(chat_id, "❌ Error al guardar el documento.")
