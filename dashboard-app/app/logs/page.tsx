'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { supabase } from '@/lib/supabase';
import { Activity, Clock, Car, Fuel, Map } from 'lucide-react';

export default function LogsPage() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchLogs();

        // Optional: Set up real-time subscription
        const channel = supabase
            .channel('schema-db-changes')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'route_records' },
                () => fetchLogs()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    async function fetchLogs() {
        const { data, error } = await supabase
            .from('route_records')
            .select(`
                id,
                activity_type,
                recorded_at,
                odometer,
                users (full_name),
                vehicles (plate)
            `)
            .order('recorded_at', { ascending: false })
            .limit(30);

        if (data) {
            const processedLogs = data.map((r: any) => ({
                id: r.id,
                type: r.activity_type,
                user: r.users?.full_name || 'Sistema',
                plate: r.vehicles?.plate || 'N/A',
                time: new Date(r.recorded_at).toLocaleTimeString('es-CO', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                    timeZone: 'America/Bogota'
                }),
                detail: r.activity_type === 'start'
                    ? `Inició recorrido con ${r.odometer.toLocaleString()} km`
                    : `Finalizó recorrido con ${r.odometer.toLocaleString()} km`,
                rawTime: r.recorded_at
            }));
            setLogs(processedLogs);
        }
        setLoading(false);
    }

    return (
        <div className="flex h-screen bg-slate-50 text-slate-900">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-8">
                <header className="mb-12">
                    <h2 className="text-4xl font-black text-slate-900 tracking-tight">System Logs</h2>
                    <p className="text-slate-500 font-bold text-lg">Real-time operational events</p>
                </header>

                {loading ? (
                    <div className="flex items-center justify-center py-20 grayscale opacity-50">
                        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : logs.length > 0 ? (
                    <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                        {logs.map((log) => (
                            <div key={log.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                {/* Icon Wrapper */}
                                <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-100 group-[.is-active]:bg-blue-600 group-[.is-active]:text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 transition-transform duration-500 group-hover:scale-125 z-10">
                                    {getIcon(log.type)}
                                </div>

                                {/* Content Box */}
                                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-300">
                                    <div className="flex items-center justify-between space-x-2 mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="font-black text-slate-800 text-sm whitespace-nowrap">{log.user}</span>
                                            <span className="bg-yellow-400 px-2 py-0.5 rounded text-[10px] font-black border border-slate-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] uppercase">{log.plate}</span>
                                        </div>
                                        <time className="font-mono text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full">{log.time}</time>
                                    </div>
                                    <div className="text-slate-500 font-medium text-sm leading-relaxed">{log.detail}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20 text-slate-400 font-bold italic">
                        No se han encontrado registros de actividad aún.
                    </div>
                )}
            </main>
        </div>
    );
}

function getIcon(type: string) {
    switch (type) {
        case 'start': return <Map className="w-5 h-5" />;
        case 'end': return <Clock className="w-5 h-5" />;
        case 'fuel': return <Fuel className="w-5 h-5" />;
        default: return <Activity className="w-5 h-5" />;
    }
}
