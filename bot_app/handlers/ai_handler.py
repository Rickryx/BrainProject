from telebot import TeleBot
from bot_app.services.ai_service import AIService
from bot_app.services.user_service import UserService

def register_handlers(bot: TeleBot):
    ai_service = AIService(bot)

    @bot.message_handler(func=lambda message: True)
    def handle_ai_query(message):
        # Only process text messages that are not commands (commands are handled elsewhere)
        if message.text.startswith('/'):
            return

        chat_id = message.chat.id
        
        # Checking if user is authorized (Admin or registered driver)
        user = UserService.get_by_telegram_id(chat_id)
        if not user:
            bot.reply_to(message, "❌ No estás registrado en el sistema. Usa /start para comenzar.")
            return

        # Show typing status
        bot.send_chat_action(chat_id, 'typing')
        
        try:
            response = ai_service.process_query(chat_id, message.text)
            bot.reply_to(message, response, parse_mode="Markdown")
        except Exception as e:
            print(f"Error processing AI query: {e}")
            bot.reply_to(message, "😔 Lo siento, tuve un problema procesando tu consulta. Inténtalo de nuevo más tarde.")
