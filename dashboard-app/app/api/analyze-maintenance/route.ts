import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';

export const dynamic = 'force-dynamic';

// Keywords that map to maintenance system names
const MAINTENANCE_KEYWORDS: Record<string, string[]> = {
    'Cambio de Aceite':       ['aceite', 'lubricante', 'filtro de aceite', 'oil'],
    'Alineación y Balanceo':  ['alineaci', 'balanceo', 'balanceado'],
    'Frenos':                 ['freno', 'pastilla', 'disco de freno', 'liquido de frenos'],
    'Suspensión':             ['suspensi', 'amortiguador', 'resorte', 'rotula', 'buje'],
    'Llantas':                ['llanta', 'neumatico', 'neumático', 'caucho'],
    'Sincronización':         ['sincroni', 'correa', 'distribucion', 'bujia'],
    'Transmisión':            ['transmisi', 'caja', 'embrague'],
    'Refrigeración':          ['refriger', 'radiador', 'anticongelante', 'termostato'],
};

function detectSystems(text: string): string[] {
    const lower = text.toLowerCase();
    return Object.entries(MAINTENANCE_KEYWORDS)
        .filter(([, keywords]) => keywords.some(k => lower.includes(k)))
        .map(([system]) => system);
}

export async function POST(req: NextRequest) {
    try {
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY || 'placeholder_for_build',
        });

        const formData = await req.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 });
        }

        const mimeType = file.type;
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        let extractedText = '';

        // ── PDF: extract text ────────────────────────────────────────────────
        if (mimeType === 'application/pdf') {
            const pdfModule = await import('pdf-parse');
            const pdfParse = (pdfModule as any).default ?? pdfModule;
            const parsed = await pdfParse(fileBuffer);
            extractedText = parsed.text;
        }
        // ── Image: transcribe with GPT-4o vision ─────────────────────────────
        else {
            const base64 = fileBuffer.toString('base64');
            const visionRes = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Transcribe todo el texto de esta imagen de un reporte de taller automotriz. Incluye servicios, valores y observaciones.' },
                        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }
                    ]
                }],
                max_tokens: 1000,
            });
            extractedText = visionRes.choices[0].message.content || '';
        }

        if (!extractedText.trim()) {
            return NextResponse.json({ error: 'No se pudo extraer texto del documento' }, { status: 422 });
        }

        // ── Structured extraction ─────────────────────────────────────────────
        const analysisRes = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
                role: 'user',
                content: `Analiza este reporte de taller automotriz. Extrae los datos en JSON. Si no encuentras un campo, usa null.

Reporte:
"""
${extractedText.slice(0, 3000)}
"""

Responde SOLO con este JSON:
{
  "workshop_name": "nombre del taller",
  "mileage_at_event": número entero o null,
  "primary_activity": "el servicio principal realizado (ej: Cambio de Aceite)",
  "activities": ["lista de todos los servicios realizados"],
  "observations": "resumen de hallazgos relevantes o null",
  "date": "fecha del servicio YYYY-MM-DD o null"
}`
            }],
            max_tokens: 500,
        });

        const raw = analysisRes.choices[0].message.content || '';
        const jsonStr = raw.replace(/```json|```/g, '').trim();
        const result = JSON.parse(jsonStr);

        // Detect which maintenance systems were serviced
        const allText = `${extractedText} ${(result.activities || []).join(' ')} ${result.primary_activity || ''}`;
        result.detected_systems = detectSystems(allText);

        return NextResponse.json(result);

    } catch (error: any) {
        console.error('Maintenance analysis error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
