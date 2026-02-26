'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { supabase } from '@/lib/supabase';
import { Settings, Clock, Calendar, Save, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function SettingsPage() {
    const [workingHours, setWorkingHours] = useState({
        days: [1, 2, 3, 4, 5],
        startTime: '08:00',
        endTime: '18:00'
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const daysOfWeek = [
        { id: 0, name: 'Domingo' },
        { id: 1, name: 'Lunes' },
        { id: 2, name: 'Martes' },
        { id: 3, name: 'Miércoles' },
        { id: 4, name: 'Jueves' },
        { id: 5, name: 'Viernes' },
        { id: 6, name: 'Sábado' },
    ];

    useEffect(() => {
        fetchSettings();
    }, []);

    async function fetchSettings() {
        try {
            const { data, error } = await supabase
                .from('company_settings')
                .select('*')
                .eq('key', 'working_hours')
                .single();

            if (data) {
                setWorkingHours(data.value);
            }
        } catch (err) {
            console.error('Error fetching settings:', err);
        } finally {
            setLoading(false);
        }
    }

    async function saveSettings() {
        setSaving(true);
        setMessage(null);
        try {
            const { error } = await supabase
                .from('company_settings')
                .upsert({
                    key: 'working_hours',
                    value: workingHours,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'key' });

            if (error) throw error;
            setMessage({ type: 'success', text: 'Configuración guardada correctamente.' });
        } catch (err: any) {
            console.error('Error saving settings:', err);
            setMessage({ type: 'error', text: `Error: ${err.message || 'No se pudo guardar.'}` });
        } finally {
            setSaving(false);
        }
    }

    const toggleDay = (dayId: number) => {
        setWorkingHours(prev => ({
            ...prev,
            days: prev.days.includes(dayId)
                ? prev.days.filter(d => d !== dayId)
                : [...prev.days, dayId].sort()
        }));
    };

    return (
        <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-8 md:p-12">
                <header className="mb-12">
                    <h2 className="text-4xl font-black text-slate-900 tracking-tight">Ajustes del Sistema</h2>
                    <p className="text-slate-500 font-bold text-lg">Configuración de flota y reglas de cumplimiento</p>
                </header>

                {loading ? (
                    <div className="flex items-center justify-center h-64 grayscale opacity-50">
                        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : (
                    <div className="max-w-4xl space-y-8">
                        {/* Working Hours Section */}
                        <div className="bg-white border border-slate-200 rounded-[40px] shadow-sm overflow-hidden p-10">
                            <div className="flex items-center gap-4 mb-10">
                                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                                    <Clock className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Horario Laboral</h3>
                                    <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Define el rango de operación de la flota</p>
                                </div>
                            </div>

                            <div className="space-y-10">
                                {/* Days Selector */}
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 block mb-6">DÍAS LABORALES</label>
                                    <div className="flex flex-wrap gap-3">
                                        {daysOfWeek.map((day) => (
                                            <button
                                                key={day.id}
                                                onClick={() => toggleDay(day.id)}
                                                className={`px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border ${workingHours.days.includes(day.id)
                                                    ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100'
                                                    : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'
                                                    }`}
                                            >
                                                {day.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Time Range */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 block mb-4">HORA DE INICIO</label>
                                        <div className="relative">
                                            <Clock className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                                            <input
                                                type="time"
                                                value={workingHours.startTime}
                                                onChange={(e) => setWorkingHours({ ...workingHours, startTime: e.target.value })}
                                                className="w-full pl-16 pr-8 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 block mb-4">HORA DE FINALIZACIÓN</label>
                                        <div className="relative">
                                            <Clock className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                                            <input
                                                type="time"
                                                value={workingHours.endTime}
                                                onChange={(e) => setWorkingHours({ ...workingHours, endTime: e.target.value })}
                                                className="w-full pl-16 pr-8 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Save Button */}
                        <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-slate-900 p-8 rounded-[35px] shadow-2xl">
                            <div className="flex items-center gap-4">
                                <AlertCircle className="w-6 h-6 text-amber-400" />
                                <p className="text-slate-300 text-sm font-bold">Estos cambios afectarán el cálculo de cumplimiento en los reportes generados a partir de ahora.</p>
                            </div>
                            <button
                                onClick={saveSettings}
                                disabled={saving}
                                className="w-full md:w-auto flex items-center justify-center gap-3 px-12 py-5 bg-blue-600 text-white rounded-3xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50"
                            >
                                <Save className="w-5 h-5" />
                                {saving ? 'Guardando...' : 'Guardar Cambios'}
                            </button>
                        </div>

                        {/* Status Message */}
                        {message && (
                            <div className={`p-6 rounded-[30px] flex items-center gap-4 border animate-in slide-in-from-bottom-4 duration-500 ${message.type === 'success' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-rose-50 text-rose-700 border-rose-100'
                                }`}>
                                {message.type === 'success' ? <CheckCircle2 className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                                <p className="font-bold">{message.text}</p>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
