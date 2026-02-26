# Guía de Despliegue del Bot - Datactar

Para que tu amigo pueda poner a funcionar el bot, debe seguir estos pasos:

### 1. Archivos Necesarios
Envía estos archivos y carpetas:
- carpeta `bot_app/`: Contiene toda la lógica del bot.
- archivo `requirements.txt`: Contiene las librerías necesarias.
- archivo `.env`: (O puedes enviarle `env.example` para que él ponga sus propias llaves).
- archivo `schema.sql`: Para que sepa cómo está la base de datos (si no la ha creado aún).

### 2. Preparación del Servidor
Tu amigo debe tener **Python 3.9+** instalado y ejecutar:

```bash
# Instalar dependencias
pip install -r requirements.txt
```

### 3. Configuración
Debe asegurarse de que el archivo `.env` tenga las credenciales correctas de:
- Telegram (Bot Token)
- OpenAI (Para el análisis de documentos)
- Supabase (URL y Key)

### 4. Ejecución
Para iniciar el bot:
```bash
python3 -m bot_app.main
```

---
*Nota: Si lo va a dejar corriendo en un servidor (VPS), se recomienda usar `nohup` o `pm2` para que no se cierre al desconectarse.*
