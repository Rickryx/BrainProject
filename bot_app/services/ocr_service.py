import json
import re
import base64
from openai import OpenAI
from bot_app.config import OPENAI_API_KEY

client = OpenAI(api_key=OPENAI_API_KEY)

class OCRService:
    @staticmethod
    def extract_fuel_info(image_bytes: bytes) -> dict:
        """Extract fuel receipt info using OpenAI GPT-4o."""
        try:
            image_base64 = base64.b64encode(image_bytes).decode('utf-8')
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": """Analiza esta imagen de una factura de tanqueada de combustible y extrae la siguiente información en formato JSON:
{
  "valor_galon": "precio por galón (numérico)",
  "combustible_galones": "cantidad de galones (numérico)",
  "kilometraje": "kilometraje del vehículo (numérico)",
  "costo_total": "costo total de la tanqueada (numérico)",
  "lugar": "nombre del lugar/estación de servicio"
}
Responde SOLO con el JSON."""
                            },
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}
                            }
                        ]
                    }
                ],
                max_tokens=300
            )
            content = response.choices[0].message.content
            return OCRService._parse_json(content)
        except Exception as e:
            print(f"OCR Error: {e}")
            return {}

    @staticmethod
    def extract_odometer(image_bytes: bytes) -> dict:
        """Extract odometer reading using OpenAI GPT-4o."""
        try:
            image_base64 = base64.b64encode(image_bytes).decode('utf-8')
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": """Analiza esta imagen del odómetro y extrae el kilometraje:
{
  "kilometraje": "kilometraje mostrado (solo el número entero)"
}
Responde SOLO con el JSON."""
                            },
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}
                            }
                        ]
                    }
                ],
                max_tokens=100
            )
            content = response.choices[0].message.content
            return OCRService._parse_json(content)
        except Exception as e:
            print(f"OCR Odometer Error: {e}")
            return {}

    @staticmethod
    def extract_legal_doc_info(image_bytes: bytes, doc_type: str, back_image_bytes: bytes = None) -> dict:
        """Extract legal document info (SOAT, Tecno, Licencia) using OpenAI GPT-4o."""
        try:
            image_base64 = base64.b64encode(image_bytes).decode('utf-8')
            
            content_list = [
                {
                    "type": "text",
                    "text": f"""Analiza este documento de tipo {doc_type} y extrae la siguiente información en formato JSON:
{{
  "expiration_date": "fecha de vencimiento (formato YYYY-MM-DD)",
  "document_number": "número/serial del documento",
  "issuer": "entidad que emite el documento",
  "associated_id": "placa del vehículo (para SOAT/Tecno) o ID de la persona (para Licencia)",
  "summary": "resumen breve del documento"
}}
Si es una licencia y hay dos imágenes, analiza ambas para obtener la fecha de vencimiento correcta. Si es un PDF, analiza el contenido visible. Si no encuentras un dato, usa null. Responde SOLO con el JSON."""
                },
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}
                }
            ]

            if back_image_bytes:
                back_base64 = base64.b64encode(back_image_bytes).decode('utf-8')
                content_list.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{back_base64}"}
                })

            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "user",
                        "content": content_list
                    }
                ],
                max_tokens=500
            )
            content = response.choices[0].message.content
            return OCRService._parse_json(content)
        except Exception as e:
            print(f"OCR Legal Doc Error: {e}")
            return {}

    @staticmethod
    def _parse_json(text: str) -> dict:
        try:
            # Try to find JSON block
            match = re.search(r'\{.*\}', text, re.DOTALL)
            if match:
                return json.loads(match.group(0))
            return json.loads(text)
        except:
            return {}
