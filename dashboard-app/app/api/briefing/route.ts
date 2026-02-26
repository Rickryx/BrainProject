import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY || 'placeholder_for_build',
        });

        const { stats, vehicles } = await req.json();

        const date = new Date().toLocaleDateString('es-CO', {
            weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Bogota'
        });

        const vehicleSummary = vehicles
            .slice(0, 10)
            .map((v: any) => `${v.plate} (${v.status}) — hoy: ${v.is_active_route ? 'En Ruta' : v.is_finished_route ? 'Finalizado' : 'Sin Actividad'}`)
            .join('\n');

        const prompt = `Eres Floti, el asistente de gestión de flota. Hoy es ${date}.

Estado actual de la flota:
- Total vehículos: ${stats.totalVehicles}
- Rutas activas: ${stats.activeRoutes}
- Rutas terminadas: ${stats.missingStarts}
- Anomalías preoperacionales hoy: ${stats.alerts}
- Documentos próximos a vencer (30 días): ${stats.docAlerts}

Vehículos:
${vehicleSummary}

Escribe un briefing ejecutivo breve (máximo 3 oraciones) para el administrador. Sé directo: menciona qué está bien, qué requiere atención inmediata y una recomendación concreta. Si todo está en orden, dilo con confianza. Usa un tono profesional y cercano, sin emojis.`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 150,
            temperature: 0.4,
        });

        const briefing = response.choices[0].message.content || '';
        return NextResponse.json({ briefing });

    } catch (error: any) {
        console.error('Briefing API error:', error);
        return NextResponse.json({ briefing: null }, { status: 500 });
    }
}
