from telebot import TeleBot, types
from bot_app.database import supabase
from bot_app.services.vehicle_service import VehicleService

verification_states = {}

PREGUNTAS_VERIFICACION = [
    'Nivel de aceite del motor y ausencia de fugas visibles',
    'Funcionamiento normal del motor (sin ruidos, vibraciones o pérdida de potencia)',
    'Nivel de refrigerante y ausencia de fugas visibles',
    'Funcionamiento normal del vehículo (sin apagados, fallos o tirones)',
    'Encendido normal del vehículo',
    'Tablero sin alarmas o testigos encendidos',
    'Cambios suaves, sin ruidos ni dificultad al engranar',
    'Tracción y cardán en buen funcionamiento (si aplica 4x4)',
    'Nivel líquido de frenos',
    'Freno de servicio (pedal) y de emergencia',
    'Dirección estable, sin juego excesivo ni ruidos',
    'Vehículo estable, sin vibraciones o golpes en la marcha',
    'Neumáticos en buen estado (presión, labrado, sin daños)',
    'Estado de carrocería general (acoples, abolladuras, rayones)',
    'Luces, direccionales y señalización operativas',
    'Cinturón de seguridad y kit de carretera completos y operativos',
    'Comentarios adicionales (si no hay, escribe “No”):'
]

def register_handlers(bot: TeleBot):
    
    # This flow is triggered after "Inicio de Recorrido" usually, 
    # but for modularity, let's treat it as part of that flow or standalone.
    # In 'flow_route.py', we didn't trigger it. Let's make it a separate command or linked.
    # For MVP, let's assume it runs after selecting a vehicle for "Inicio".
    # We need to hook into flow_route or make it manual.
    # Let's add a hook in flow_route to call us? No, cyclical dependency.
    # Approach: The user starts "Verification" explicitly or we chain via state.
    pass

def start_verification_flow(bot, chat_id, vehicle_id, driver_id, company_id=None):
    """External entry point to start verification."""
    verification_states[chat_id] = {
        "vehicle_id": vehicle_id,
        "driver_id": driver_id,
        "company_id": company_id,
        "q_index": 0,
        "answers": []
    }
    _ask_next_question(bot, chat_id)

def _ask_next_question(bot, chat_id):
    state = verification_states[chat_id]
    idx = state["q_index"]
    total = len(PREGUNTAS_VERIFICACION)
    
    if idx >= total:
        _finish_verification(bot, chat_id)
        return
        
    question = PREGUNTAS_VERIFICACION[idx]
    
    # 17th question is open text
    if idx == 16:
        bot.send_message(chat_id, f"🧾 Preoperacional ({idx + 1}/{total})\n\n{question}", reply_markup=types.ReplyKeyboardRemove())
    else:
        markup = types.ReplyKeyboardMarkup(one_time_keyboard=True, resize_keyboard=True)
        markup.add("✅ BIEN", "❌ MAL")
        markup.add("↩️ Menú Principal")
        bot.send_message(chat_id, f"🧾 Preoperacional ({idx + 1}/{total})\n\n{question}", reply_markup=markup)

def _handle_answer(bot, message):
    chat_id = message.chat.id
    if chat_id not in verification_states:
        return
        
    text = message.text
    if text == "↩️ Menú Principal":
        del verification_states[chat_id]
        from bot_app.handlers.commands import show_main_menu
        show_main_menu(bot, chat_id)
        return

    state = verification_states[chat_id]
    idx = state["q_index"]

    if idx < 16: # Binary questions
        if text not in ["✅ BIEN", "❌ MAL"]:
            bot.reply_to(message, "⚠️ Por favor selecciona una opción usando los botones.")
            return
        
        state["answers"].append({
            "question": PREGUNTAS_VERIFICACION[idx],
            "answer": "BIEN" if "BIEN" in text else "MAL"
        })
    else: # Comment question
        state["comments"] = text
    
    state["q_index"] += 1
    _ask_next_question(bot, chat_id)

def _finish_verification(bot, chat_id):
    state = verification_states[chat_id]
    
    # Save to DB
    company_id = state.get("company_id")
    ver_data = {
        "driver_id": state["driver_id"],
        "vehicle_id": state["vehicle_id"],
        "passed": all(a["answer"] == "BIEN" for a in state["answers"]),
        "comments": state.get("comments", "Sin comentarios"),
        "company_id": str(company_id) if company_id else None,
    }
    res = supabase.table("verifications").insert(ver_data).execute()
    ver_id = res.data[0]['id']

    details = []
    for item in state["answers"]:
        details.append({
            "verification_id": ver_id,
            "question_text": item["question"],
            "answer": item["answer"],
            "company_id": str(company_id) if company_id else None,
        })
    supabase.table("verification_details").insert(details).execute()
    
    bot.send_message(chat_id, "✅ Preoperacional registrado. Ahora envía la foto de inicio de operación.", reply_markup=types.ReplyKeyboardRemove())
    
    # Transition to route flow (waiting for photo)
    from bot_app.handlers.flow_route import route_states, VehicleService
    vehicle = VehicleService.get_by_id(state["vehicle_id"])
    route_states[chat_id] = {"step": "waiting_photo", "type": "start", "vehicle": vehicle, "company_id": company_id}
    
    del verification_states[chat_id]

# We need to expose a message handler for the answers
def register_verification_handlers(bot: TeleBot):
    @bot.message_handler(func=lambda m: m.chat.id in verification_states)
    def handle_verif_step(message):
        _handle_answer(bot, message)
