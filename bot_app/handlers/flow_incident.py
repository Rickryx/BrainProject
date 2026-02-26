from telebot import TeleBot, types
from bot_app.database import supabase
from datetime import date, datetime

# In-memory state per chat
incident_states: dict = {}

INCIDENT_TYPES = ['Accidente', 'Falla Técnica', 'Incidente']

COMPONENTS = [
    'Motor', 'Frenos', 'Llantas', 'Chapa / Carrocería',
    'Transmisión', 'Eléctrico', 'Suspensión', 'Otro'
]


def register_handlers(bot: TeleBot):

    # ── Trigger: /incidente command ──────────────────────────────────────────
    @bot.message_handler(commands=['incidente'])
    def start_incident_flow(message):
        chat_id = message.chat.id

        # Verify driver is registered
        user_res = supabase.table("users").select("id, full_name, company_id").eq("telegram_id", chat_id).execute()
        if not user_res.data:
            bot.reply_to(message, "❌ No estás registrado. Usa /vincular primero.")
            return

        incident_states[chat_id] = {
            "driver_id": user_res.data[0]["id"],
            "driver_name": user_res.data[0]["full_name"],
            "company_id": user_res.data[0].get("company_id"),
            "step": "waiting_type"
        }

        markup = types.ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=True)
        markup.row(*INCIDENT_TYPES)
        markup.row("❌ Cancelar")

        bot.send_message(
            chat_id,
            "🚨 *Reporte de Incidente*\n\n¿Qué tipo de evento ocurrió?",
            parse_mode="Markdown",
            reply_markup=markup
        )

    # ── Step 1: Event type selected ──────────────────────────────────────────
    @bot.message_handler(func=lambda m: incident_states.get(m.chat.id, {}).get("step") == "waiting_type")
    def handle_incident_type(message):
        chat_id = message.chat.id

        if message.text == "❌ Cancelar":
            _cancel(bot, chat_id)
            return

        if message.text not in INCIDENT_TYPES:
            bot.reply_to(message, "Por favor selecciona una opción del teclado.")
            return

        incident_states[chat_id]["event_type"] = message.text
        incident_states[chat_id]["step"] = "waiting_component"

        markup = types.ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=True)
        for i in range(0, len(COMPONENTS), 2):
            row = COMPONENTS[i:i+2]
            markup.row(*row)
        markup.row("❌ Cancelar")

        bot.send_message(
            chat_id,
            f"✅ Tipo: *{message.text}*\n\n¿Qué componente fue afectado?",
            parse_mode="Markdown",
            reply_markup=markup
        )

    # ── Step 2: Component selected ────────────────────────────────────────────
    @bot.message_handler(func=lambda m: incident_states.get(m.chat.id, {}).get("step") == "waiting_component")
    def handle_incident_component(message):
        chat_id = message.chat.id

        if message.text == "❌ Cancelar":
            _cancel(bot, chat_id)
            return

        incident_states[chat_id]["component_affected"] = message.text
        incident_states[chat_id]["step"] = "waiting_observations"

        bot.send_message(
            chat_id,
            f"📝 ¿Qué pasó exactamente? Describe brevemente el incidente.",
            reply_markup=types.ReplyKeyboardRemove()
        )

    # ── Step 3: Observations text ─────────────────────────────────────────────
    @bot.message_handler(
        content_types=['text'],
        func=lambda m: incident_states.get(m.chat.id, {}).get("step") == "waiting_observations"
    )
    def handle_incident_observations(message):
        chat_id = message.chat.id

        incident_states[chat_id]["observations"] = message.text
        incident_states[chat_id]["step"] = "waiting_photo"

        markup = types.ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=True)
        markup.row("📷 Sin foto")

        bot.send_message(
            chat_id,
            "📸 ¿Tienes una foto del incidente? Envíala ahora.\nSi no tienes, toca *Sin foto*.",
            parse_mode="Markdown",
            reply_markup=markup
        )

    # ── Step 4a: Photo received ───────────────────────────────────────────────
    @bot.message_handler(
        content_types=['photo'],
        func=lambda m: incident_states.get(m.chat.id, {}).get("step") == "waiting_photo"
    )
    def handle_incident_photo(message):
        chat_id = message.chat.id
        # Store file_id as reference (could upload to storage later)
        incident_states[chat_id]["photo_file_id"] = message.photo[-1].file_id
        _save_incident(bot, chat_id, message)

    # ── Step 4b: Skip photo ───────────────────────────────────────────────────
    @bot.message_handler(
        func=lambda m: (
            incident_states.get(m.chat.id, {}).get("step") == "waiting_photo"
            and m.text == "📷 Sin foto"
        )
    )
    def handle_incident_no_photo(message):
        chat_id = message.chat.id
        incident_states[chat_id]["photo_file_id"] = None
        _save_incident(bot, chat_id, message)


def _save_incident(bot: TeleBot, chat_id: int, message):
    state = incident_states.get(chat_id, {})
    if not state:
        return

    try:
        now = datetime.now()

        # Get driver's assigned vehicle
        vehicle_res = supabase.table("driver_assignments") \
            .select("vehicle_id, vehicles(plate)") \
            .eq("driver_id", state["driver_id"]) \
            .eq("is_active", True) \
            .eq("role", "principal") \
            .execute()

        vehicle_id = vehicle_res.data[0]["vehicle_id"] if vehicle_res.data else None
        vehicle_plate = vehicle_res.data[0]["vehicles"]["plate"] if vehicle_res.data else "Sin vehículo"

        # Insert incident
        company_id = state.get("company_id")
        record = {
            "vehicle_id": vehicle_id,
            "driver_id": state["driver_id"],
            "event_date": now.strftime("%Y-%m-%d"),
            "event_time": now.strftime("%H:%M"),
            "event_type": state.get("event_type", "Incidente"),
            "component_affected": state.get("component_affected", ""),
            "observations": state.get("observations", ""),
            "status": "open",
            "company_id": str(company_id) if company_id else None,
        }

        supabase.table("incidents").insert(record).execute()

        # Confirm to driver
        bot.send_message(
            chat_id,
            f"✅ *Incidente registrado*\n\n"
            f"🚗 Vehículo: `{vehicle_plate}`\n"
            f"⚠️ Tipo: {state.get('event_type')}\n"
            f"🔧 Componente: {state.get('component_affected')}\n"
            f"📅 Fecha: {now.strftime('%d/%m/%Y %H:%M')}\n\n"
            f"_El administrador fue notificado._",
            parse_mode="Markdown",
            reply_markup=types.ReplyKeyboardRemove()
        )

        # Notify admin(s)
        _notify_admins(bot, state, vehicle_plate, now)

    except Exception as e:
        print(f"Error saving incident: {e}")
        bot.send_message(
            chat_id,
            "❌ Hubo un error al guardar el reporte. Intenta de nuevo con /incidente.",
            reply_markup=types.ReplyKeyboardRemove()
        )
    finally:
        if chat_id in incident_states:
            del incident_states[chat_id]

        # Back to menu
        from bot_app.handlers.commands import show_main_menu
        show_main_menu(bot, chat_id, "¿Qué más necesitas registrar?")


def _notify_admins(bot: TeleBot, state: dict, vehicle_plate: str, timestamp: datetime):
    try:
        admins = supabase.table("users") \
            .select("telegram_id, full_name") \
            .eq("role", "admin") \
            .execute()

        if not admins.data:
            return

        notification = (
            f"🚨 *Nuevo incidente reportado*\n\n"
            f"👤 Conductor: {state.get('driver_name', 'Desconocido')}\n"
            f"🚗 Vehículo: `{vehicle_plate}`\n"
            f"⚠️ Tipo: *{state.get('event_type')}*\n"
            f"🔧 Componente: {state.get('component_affected')}\n"
            f"📝 Descripción: _{state.get('observations', 'Sin descripción')}_\n"
            f"📅 {timestamp.strftime('%d/%m/%Y %H:%M')}\n\n"
            f"Revisa el dashboard → Alertas para gestionar este reporte."
        )

        for admin in admins.data:
            if admin.get("telegram_id"):
                try:
                    bot.send_message(admin["telegram_id"], notification, parse_mode="Markdown")
                except Exception as e:
                    print(f"Could not notify admin {admin['telegram_id']}: {e}")

    except Exception as e:
        print(f"Error notifying admins: {e}")


def _cancel(bot: TeleBot, chat_id: int):
    if chat_id in incident_states:
        del incident_states[chat_id]
    bot.send_message(
        chat_id,
        "Reporte cancelado.",
        reply_markup=types.ReplyKeyboardRemove()
    )
    from bot_app.handlers.commands import show_main_menu
    show_main_menu(bot, chat_id)
