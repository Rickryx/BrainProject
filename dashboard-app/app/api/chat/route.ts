import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// El cliente de OpenAI se inicializa dentro del handler para evitar errores en tiempo de build

async function getFleetSummary(supabase: any) {
    const { data } = await supabase.from('vehicles').select('status, plate');
    if (!data) return "No hay vehículos registrados.";

    const total = data.length;
    const active = data.filter((v: any) => v.status === 'Activo').length;
    const maintenance = data.filter((v: any) => v.status === 'Mantenimiento').length;

    return `Resumen de Flota:\n- Total: ${total} vehículos\n- Activos: ${active}\n- En Mantenimiento: ${maintenance}`;
}

async function getVehicleDetails(supabase: any, plate: string) {
    const { data: v } = await supabase.from('vehicles').select('*').eq('plate', plate.toUpperCase()).maybeSingle();
    if (!v) return `No encontré el vehículo con placa ${plate}.`;

    const { data: asg } = await supabase
        .from('driver_assignments')
        .select('users(full_name)')
        .eq('vehicle_id', v.id)
        .eq('role', 'principal')
        .eq('is_active', true)
        .maybeSingle();

    const currentDriver = (asg as any)?.users?.full_name || v.main_driver;

    const { data: lastRec } = await supabase
        .from('route_records')
        .select('recorded_at')
        .eq('vehicle_id', v.id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    const lastUpdateStr = lastRec ? new Date(lastRec.recorded_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : "Sin registros";

    return `Detalles de ${v.plate}:\n- Modelo: ${v.brand} ${v.line} (${v.model})\n- Estado: ${v.status}\n- Conductor: ${currentDriver}\n- Ubicación: ${v.location}\n- Odómetro: ${v.current_odometer} km\n- Última Actividad: ${lastUpdateStr}`;
}

async function getDriverInfo(supabase: any, name: string) {
    const { data: users } = await supabase.from('users').select('*').ilike('full_name', `%${name}%`);
    if (!users || users.length === 0) return `No encontré conductores con el nombre '${name}'.`;

    let output = "Resultados encontrados:\n";
    for (const u of users) {
        const { data: assignments } = await supabase
            .from('driver_assignments')
            .select('role, vehicles(plate, line)')
            .eq('driver_id', u.id)
            .eq('is_active', true);

        const asgText = assignments?.map((a: any) => `${a.vehicles.plate} (${a.role})`).join(', ') || 'Sin asignación';
        output += `- ${u.full_name} (ID: ${u.telegram_id || 'No vinculado'})\n  Rol: ${u.role}\n  Vehículos: ${asgText}\n`;
    }
    return output;
}

async function getDailyActivity(supabase: any, name: string, dateStr?: string) {
    try {
        if (!dateStr) {
            dateStr = new Date().toISOString().split('T')[0];
        }

        const { data: user } = await supabase.from('users').select('id, full_name').ilike('full_name', `%${name}%`).maybeSingle();
        if (!user) return `No encontré al conductor '${name}'.`;

        const { data: records } = await supabase
            .from('route_records')
            .select('activity_type, recorded_at, odometer')
            .eq('driver_id', user.id)
            .gte('recorded_at', `${dateStr}T00:00:00Z`)
            .lte('recorded_at', `${dateStr}T23:59:59Z`)
            .order('recorded_at', { ascending: true });

        if (!records || records.length === 0) return `No hay registros de actividad para ${user.full_name} el día ${dateStr}.`;

        const logs = records.map((r: any) => {
            const timeStr = new Date(r.recorded_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });
            const typeName = r.activity_type === 'start' ? 'Inicio' : r.activity_type === 'end' ? 'Fin' : r.activity_type;
            return `• ${timeStr} | ${typeName} | ${r.odometer} km`;
        });

        return `Actividad de ${user.full_name} el ${dateStr}:\n${logs.join('\n')}`;
    } catch (error) {
        return `Error al consultar actividad.`;
    }
}

async function getRecentActivity(supabase: any, limit: number = 10) {
    try {
        const { data: records } = await supabase
            .from('route_records')
            .select('activity_type, recorded_at, vehicles(plate), users(full_name)')
            .order('recorded_at', { ascending: false })
            .limit(limit);

        if (!records || records.length === 0) return "No hay registros de actividad recientes.";

        const logs = records.map((r: any) => {
            const timeStr = new Date(r.recorded_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
            const driver = r.users?.full_name || 'Desconocido';
            const plate = r.vehicles?.plate || 'N/A';
            const act = r.activity_type === 'start' ? 'Inició' : r.activity_type === 'end' ? 'Finalizó' : r.activity_type;
            return `• ${timeStr} | ${driver} (${plate}) | ${act}`;
        });

        return "Últimos registros de actividad:\n" + logs.join('\n');
    } catch (error) {
        return "Error al obtener actividad reciente.";
    }
}

export async function POST(req: NextRequest) {
    try {
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY || 'placeholder_for_build',
        });

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        // Fetch specialized role from database
        const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
        const userRole = userData?.role || 'driver';

        const { messages } = await req.json();

        // Base tools available to everyone
        const tools: any[] = [
            {
                type: 'function',
                function: {
                    name: 'getFleetSummary',
                    description: 'Obtiene un resumen general de la flota (total, activos, etc.)',
                    parameters: { type: 'object', properties: {} }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'getVehicleDetails',
                    description: 'Obtiene información detallada de un vehículo específico por su placa',
                    parameters: {
                        type: 'object',
                        properties: {
                            plate: { type: 'string', description: 'Placa del vehículo, ej: ABC123' }
                        },
                        required: ['plate']
                    }
                }
            }
        ];

        // Administrative tools (Restricted)
        if (userRole === 'admin') {
            tools.push(
                {
                    type: 'function',
                    function: {
                        name: 'getDriverInfo',
                        description: 'Busca información de conductores por su nombre',
                        parameters: {
                            type: 'object',
                            properties: {
                                name: { type: 'string', description: 'Nombre o parte del nombre del conductor' }
                            },
                            required: ['name']
                        }
                    }
                },
                {
                    type: 'function',
                    function: {
                        name: 'getDailyActivity',
                        description: 'Consulta si un conductor tuvo registros de actividad en una fecha específica',
                        parameters: {
                            type: 'object',
                            properties: {
                                name: { type: 'string', description: 'Nombre del conductor' },
                                dateStr: { type: 'string', description: 'Fecha en formato YYYY-MM-DD (opcional, por defecto hoy)' }
                            },
                            required: ['name']
                        }
                    }
                },
                {
                    type: 'function',
                    function: {
                        name: 'getRecentActivity',
                        description: 'Obtiene una lista de los registros de actividad más recientes de toda la flota',
                        parameters: {
                            type: 'object',
                            properties: {
                                limit: { type: 'number', description: 'Número de registros a obtener (default 10)' }
                            }
                        }
                    }
                }
            );
        }

        const dateContext = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: `Eres Floti, el asistente inteligente de la flota Datactar. 
                    
                    Tu usuario actual tiene el rol: ${userRole.toUpperCase()}.
                    
                    REGLAS DE SEGURIDAD:
                    1. Si tu rol es DRIVER, NO puedes dar información sobre otros conductores o el historial completo de la flota. Solo puedes hablar de vehículos y estadísticas generales.
                    2. NO reveles identificadores internos como Telegram IDs a menos que seas ADMIN.
                    3. Mantén la confidencialidad de la operación en todo momento.

                    Fecha y Hora Actual: ${dateContext} (Colombia).`
                },
                ...messages
            ],
            tools: tools.length > 0 ? tools : undefined,
            tool_choice: 'auto',
        });

        const responseMessage = response.choices[0].message;
        const toolCalls = responseMessage.tool_calls;
        const thinkingContent = responseMessage.content || "";

        if (toolCalls) {
            const finalMessages = [...messages, responseMessage];
            for (const toolCall of toolCalls) {
                const functionName = (toolCall as any).function.name;
                const functionArgs = JSON.parse((toolCall as any).function.arguments);

                let result = '';
                if (functionName === 'getFleetSummary') result = await getFleetSummary(supabase);
                if (functionName === 'getVehicleDetails') result = await getVehicleDetails(supabase, functionArgs.plate);
                if (functionName === 'getDriverInfo' && userRole === 'admin') result = await getDriverInfo(supabase, functionArgs.name);
                if (functionName === 'getDailyActivity' && userRole === 'admin') result = await getDailyActivity(supabase, functionArgs.name, functionArgs.dateStr);
                if (functionName === 'getRecentActivity' && userRole === 'admin') result = await getRecentActivity(supabase, functionArgs.limit);

                finalMessages.push({
                    tool_call_id: toolCall.id,
                    role: 'tool',
                    name: functionName,
                    content: result,
                } as any);
            }

            const secondResponse = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: 'Eres Floti, el asistente inteligente de la flota Datactar.' },
                    ...finalMessages
                ],
            });

            const finalContent = secondResponse.choices[0].message.content;
            return NextResponse.json({
                message: thinkingContent ? `${thinkingContent}\n\n${finalContent}` : finalContent
            });
        }

        return NextResponse.json({ message: responseMessage.content });

    } catch (error: any) {
        console.error('Chat API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
