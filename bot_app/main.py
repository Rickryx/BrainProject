import telebot
from bot_app.config import BOT_TOKEN
from bot_app.handlers import commands

def main():
    print("🚀 Starting Bot with New Architecture...")
    bot = telebot.TeleBot(BOT_TOKEN)
    
    # Register Handlers
    commands.register_handlers(bot)
    
    from bot_app.handlers import flow_fuel, flow_route, flow_verification, flow_docs, ai_handler
    flow_fuel.register_handlers(bot)
    flow_route.register_handlers(bot)
    flow_verification.register_verification_handlers(bot)
    flow_docs.register_handlers(bot)
    ai_handler.register_handlers(bot)
    # Note: Verification flow is currently triggered manually or needs hooking. 
    # For MVP, let's keep it simple. flow_route CAN call flow_verification functions if imported.
    
    
    print("✅ Bot is polling...")
    bot.infinity_polling()

if __name__ == "__main__":
    main()
