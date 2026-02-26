from telebot import TeleBot, types
from bot_app.services.user_service import UserService

def register_handlers(bot: TeleBot):
    
    @bot.message_handler(commands=['start'])
    @bot.message_handler(func=lambda m: m.text == "🔄 Menú Principal")
    def handle_start(message):
        show_main_menu(bot, message.chat.id)

    @bot.message_handler(commands=['vincular'])
    # ... vincular logic omitted for brevity, keeping existing structure ...
    def handle_vincular(message):
        chat_id = message.chat.id
        parts = message.text.split(' ', 1)
        if len(parts) < 2:
            bot.reply_to(message, "📝 Uso: `/vincular Tu Nombre Completo`", parse_mode="Markdown")
            return
        
        dashboard_name = parts[1].strip()
        user = UserService.link_user_by_name(chat_id, dashboard_name)
        if user:
            bot.reply_to(message, f"✅ ¡Vinculación exitosa! Usa /start para ver tus opciones.")
        else:
            bot.reply_to(message, f"❌ No encontré ningún conductor llamado '{dashboard_name}'.")

    @bot.message_handler(commands=['mi_id'])
    def handle_my_id(message):
        bot.reply_to(message, f"🆔 Tu ID: `{message.chat.id}`", parse_mode="Markdown")

    @bot.message_handler(func=lambda m: m.text == "🧾 Mis Reportes")
    def handle_my_reports(message):
        chat_id = message.chat.id
        from bot_app.database import supabase
        
        # Get User
        user_res = supabase.table("users").select("id").eq("telegram_id", chat_id).execute()
        if not user_res.data:
            bot.reply_to(message, "❌ Usuario no encontrado.")
            return
        
        driver_id = user_res.data[0]['id']
        
        # Simple Recent Activity Summary
        from bot_app.services.storage_service import StorageService # Just to check imports
        res = supabase.table("route_records")\
            .select("activity_type, odometer, recorded_at, vehicles(plate)")\
            .eq("driver_id", driver_id)\
            .order("recorded_at", desc=True)\
            .limit(5).execute()
        
        if not res.data:
            bot.reply_to(message, "📅 No tienes registros recientes.")
            return
            
        report = "📅 **Tus últimos 5 registros:**\n\n"
        for r in res.data:
            date_str = r['recorded_at'][:10]
            type_str = "🚀 Inicio" if r['activity_type'] == 'start' else "🏁 Fin"
            report += f"• {date_str} | {r['vehicles']['plate']} | {type_str} | {r['odometer']} km\n"
            
        bot.reply_to(message, report, parse_mode="Markdown")
        
        # Show main menu for easy navigation
        from bot_app.handlers.commands import show_main_menu
        show_main_menu(bot, chat_id, "¿Deseas realizar otra acción?")

    @bot.message_handler(func=lambda m: m.text == "🧾 Documentación")
    def handle_docs_trigger(message):
        from bot_app.handlers.flow_docs import start_doc_flow
        start_doc_flow(bot, message.chat.id)

def show_main_menu(bot, chat_id, welcome_text=None):
    from bot_app.database import supabase
    from bot_app.services.user_service import UserService
    
    user = UserService.get_by_telegram_id(chat_id)
    if not user:
        bot.send_message(chat_id, "❌ No estás registrado. Usa /vincular Nombre")
        return

    # Context logic: detect if there's an open 'start' without an 'end' for this driver
    # For MVP: We check the very last record of this driver.
    last_rec = supabase.table("route_records")\
        .select("activity_type, vehicle_id")\
        .eq("driver_id", user.id)\
        .order("recorded_at", desc=True)\
        .limit(1).execute()
    
    in_route = False
    if last_rec.data and last_rec.data[0]['activity_type'] == 'start':
        in_route = True

    markup = types.ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=True)
    
    if in_route:
        markup.row('c) Registrar finalización de recorrido')
    else:
        markup.row('b) Registrar inicio de recorrido')
        
    markup.row('a) Registrar tanqueada')
    markup.row('🧾 Documentación')
    markup.row('🧾 Mis Reportes')
    markup.row('🔄 Menú Principal')
    
    if not welcome_text:
        welcome_text = f"👋 Hola {user.full_name}, ¿qué vamos a registrar hoy?"
    
    bot.send_message(chat_id, welcome_text, reply_markup=markup)
