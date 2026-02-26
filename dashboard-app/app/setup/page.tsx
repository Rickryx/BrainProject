'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Building2, ArrowRight, Loader2, AlertCircle } from 'lucide-react';

export default function SetupPage() {
    const router = useRouter();
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSetup(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push('/login'); return; }

            // 1. Crear empresa
            const { data: company, error: companyError } = await supabase
                .from('companies')
                .insert({ name: name.trim() })
                .select()
                .single();

            if (companyError) throw companyError;

            // 2. Vincular usuario como admin de la empresa
            const { error: memberError } = await supabase
                .from('company_members')
                .insert({ auth_user_id: user.id, company_id: company.id, role: 'admin' });

            if (memberError) throw memberError;

            router.push('/');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-400/10 blur-[120px] rounded-full" />
            <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-cyan-400/10 blur-[120px] rounded-full" />

            <div className="w-full max-w-[480px] relative">
                <div className="flex flex-col items-center mb-12">
                    <div className="w-20 h-20 bg-gradient-to-tr from-blue-600 to-cyan-500 rounded-[28px] flex items-center justify-center mb-6 shadow-2xl shadow-blue-500/20">
                        <Building2 className="w-10 h-10 text-white" />
                    </div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Configurar Empresa</h1>
                    <p className="text-slate-500 font-bold text-base text-center">
                        Crea el espacio de trabajo para tu flota.<br />Solo tú verás estos datos.
                    </p>
                </div>

                <div className="bg-white/70 backdrop-blur-xl border border-white rounded-[48px] p-10 md:p-14 shadow-2xl shadow-slate-200/50">
                    <form onSubmit={handleSetup} className="space-y-8">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 ml-1">
                                Nombre de la Empresa
                            </label>
                            <input
                                required
                                type="text"
                                placeholder="Ej: Transportes García S.A.S"
                                className="w-full px-6 py-5 bg-slate-50/50 border border-slate-100 rounded-[28px] font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all outline-none"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>

                        {error && (
                            <div className="p-5 bg-rose-50 border border-rose-100 rounded-3xl flex items-center gap-4 text-rose-600">
                                <AlertCircle className="w-5 h-5 shrink-0" />
                                <p className="text-sm font-bold">{error}</p>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !name.trim()}
                            className="w-full py-6 bg-blue-600 text-white rounded-[28px] font-black uppercase text-xs tracking-[0.2em] hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                        >
                            {loading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>Crear Espacio de Trabajo <ArrowRight className="w-5 h-5" /></>
                            )}
                        </button>
                    </form>
                </div>

                <p className="text-center mt-12 text-slate-400 font-bold text-xs">
                    Solo personal autorizado. © 2026 Datactar.
                </p>
            </div>
        </div>
    );
}
