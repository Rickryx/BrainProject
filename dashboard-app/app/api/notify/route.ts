import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { driverId, message } = await req.json();

        if (!driverId || !message) {
            return NextResponse.json({ error: 'driverId y message son requeridos' }, { status: 400 });
        }

        // 1. Get driver telegram_id from Supabase
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('telegram_id, full_name')
            .eq('id', driverId)
            .single();

        if (userError || !user) {
            return NextResponse.json({ error: 'Conductor no encontrado' }, { status: 404 });
        }

        if (!user.telegram_id) {
            return NextResponse.json({ error: `El conductor ${user.full_name} no tiene vinculada su cuenta de Telegram.` }, { status: 400 });
        }

        const botToken = process.env.BOT_TOKEN;
        console.log('BOT_TOKEN check:', botToken ? 'Present' : 'Missing');
        if (!botToken) {
            return NextResponse.json({ error: 'BOT_TOKEN no configurado en el servidor' }, { status: 500 });
        }

        // 2. Send message to Telegram
        const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const response = await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: user.telegram_id,
                text: `🔔 **Notificación de Administración**:\n\n${message}`,
                parse_mode: 'Markdown',
            }),
        });

        const telegramResult = await response.json();

        if (!telegramResult.ok) {
            return NextResponse.json({ error: `Error de Telegram: ${telegramResult.description}` }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: `Mensaje enviado a ${user.full_name}` });

    } catch (error: any) {
        console.error('Notify API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
