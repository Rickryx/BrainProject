import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const { image, docType } = await req.json();

        if (!image) {
            return NextResponse.json({ error: 'No image provided' }, { status: 400 });
        }

        // Extraer el prefijo data:image/xxx;base64 si existe para detectar el formato
        let mimeType = 'image/jpeg';
        let base64Data = image;

        if (image.startsWith('data:')) {
            const match = image.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
                mimeType = match[1];
                base64Data = match[2];
            }
        }

        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        // Advertencia para PDFs: GPT-4o vía image_url no soporta PDFs directamente
        if (mimeType === 'application/pdf') {
            return NextResponse.json({ error: 'El formato PDF no es soportado por el análisis de imagen directo. Por favor usa una foto (JPG/PNG).' }, { status: 400 });
        }

        const prompt = `Analiza este documento de tipo ${docType} y extrae la fecha de vencimiento en formato JSON:
{
  "expiration_date": "fecha de vencimiento (formato YYYY-MM-DD)",
  "document_number": "número/serial del documento",
  "issuer": "entidad que emite el documento",
  "summary": "resumen breve del documento"
}
Responde SOLO con el JSON. Si no encuentras la fecha, usa null.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: prompt },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:${mimeType};base64,${base64Data}`,
                            },
                        },
                    ],
                },
            ],
            max_tokens: 500,
        });

        const content = response.choices[0].message.content || '';
        const jsonStr = content.replace(/```json|```/g, '').trim();
        const result = JSON.parse(jsonStr);

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('AI Analysis Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
