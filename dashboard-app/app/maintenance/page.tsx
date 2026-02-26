
'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { supabase } from '@/lib/supabase';
import { AlertTriangle, CheckCircle, Wrench } from 'lucide-react';

export default function MaintenancePage() {
    const [alerts, setAlerts] = useState<any[]>([]);
    const [rules, setRules] = useState<any[]>([]);

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        // Fetch Active Alerts with Vehicle Data
        const { data: aData, error } = await supabase
            .from('maintenance_alerts')
            .select('*, vehicle:vehicles(plate, brand), rule:maintenance_rules(name, description)')
            .eq('status', 'active');

        if (aData) setAlerts(aData);

        // Fetch Rules
        const { data: rData } = await supabase.from('maintenance_rules').select('*');
        if (rData) setRules(rData);
    }

    async function markResolved(id: string) {
        await supabase.from('maintenance_alerts').update({ status: 'resolved' }).eq('id', id);
        fetchData(); // Refresh
    }

    return (
        <div className="flex h-screen bg-slate-50 text-slate-900">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-8">
                <header className="mb-8">
                    <h2 className="text-3xl font-bold text-slate-900">Maintenance Center</h2>
                    <p className="text-slate-500 font-medium">Manage vehicle health and scheduled services</p>
                </header>

                {/* Active Alerts Section */}
                <section className="mb-10">
                    <h3 className="text-xl font-bold text-rose-600 mb-4 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" />
                        Active Alerts ({alerts.length})
                    </h3>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {alerts.map((alert) => (
                            <div key={alert.id} className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:shadow-md transition-all">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 bg-rose-50 rounded-xl text-rose-600">
                                        <Wrench className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-bold text-slate-900 text-lg">{alert.vehicle?.plate}</h4>
                                            <span className="text-xs bg-slate-100 px-2.5 py-1 rounded-full font-bold text-slate-500 uppercase">{alert.vehicle?.brand}</span>
                                        </div>
                                        <p className="text-rose-600 font-bold mt-1">{alert.rule?.name}</p>
                                        <p className="text-sm text-slate-500 mt-1 font-medium">Triggered at <span className="text-slate-900 font-bold">{alert.triggered_at_km?.toLocaleString()} km</span></p>
                                        <p className="text-xs text-slate-400 mt-1">{new Date(alert.created_at).toLocaleDateString()}</p>
                                    </div>
                                </div>

                                <button
                                    onClick={() => markResolved(alert.id)}
                                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl flex items-center gap-2 shadow-sm transition-all active:scale-95"
                                >
                                    <CheckCircle className="w-4 h-4" />
                                    Mark Resolved
                                </button>
                            </div>
                        ))}

                        {alerts.length === 0 && (
                            <div className="col-span-1 lg:col-span-2 p-12 bg-white border border-slate-200 border-dashed rounded-2xl text-center text-slate-400 shadow-sm">
                                <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p className="font-bold text-lg">Everything is running smoothly!</p>
                                <p className="text-sm">No active maintenance alerts for today.</p>
                            </div>
                        )}
                    </div>
                </section>

                {/* Rules Section */}
                <section>
                    <h3 className="text-xl font-bold text-slate-800 mb-4">Maintenance Rules</h3>
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-4 font-bold">Rule Name</th>
                                    <th className="px-6 py-4 font-bold">Interval (km)</th>
                                    <th className="px-6 py-4 font-bold">Description</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {rules.map((rule) => (
                                    <tr key={rule.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-5 font-bold text-slate-900">{rule.name}</td>
                                        <td className="px-6 py-5">
                                            <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-bold text-sm">
                                                Every {rule.interval_km.toLocaleString()} km
                                            </span>
                                        </td>
                                        <td className="px-6 py-5 text-slate-500 text-sm font-medium">{rule.description}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Coming Soon Section */}
                <section className="mt-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-[40px] p-10 text-white relative overflow-hidden shadow-xl shadow-blue-100 italic">
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-4">
                            <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest backdrop-blur-md">Próximamente</span>
                            <h3 className="text-2xl font-black tracking-tight">Mantenimiento Inteligente 2.0</h3>
                        </div>
                        <p className="max-w-xl text-blue-50 font-medium leading-relaxed">
                            Estamos trabajando en integrar telemetría GPS en tiempo real para automatizar las alertas basadas en odómetros precisos, consumo de combustible y diagnóstico remoto de motor.
                        </p>
                    </div>
                </section>
            </main>
        </div>
    );
}
