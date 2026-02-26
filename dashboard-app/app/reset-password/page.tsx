'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Lock, ArrowRight, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function ResetPasswordPage() {
    const router = useRouter();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    async function handleUpdatePassword(e: React.FormEvent) {
        e.preventDefault();

        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden.');
            return;
        }

        if (password.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres.');
            return;
        }

        setLoading(true);
        setError(null);

        const { error: updateError } = await supabase.auth.updateUser({
            password: password,
        });

        if (updateError) {
            setError(updateError.message);
            setLoading(false);
        } else {
            setSuccess(true);
            setLoading(false);
            setTimeout(() => {
                router.push('/login');
            }, 3000);
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-400/10 blur-[120px] rounded-full" />
            <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-cyan-400/10 blur-[120px] rounded-full" />

            <div className="w-full max-w-[480px] relative">
                <div className="flex flex-col items-center mb-12">
                    <div className="w-20 h-20 bg-gradient-to-tr from-blue-600 to-cyan-500 rounded-[28px] p-[1.5px] shadow-2xl shadow-blue-500/20 mb-6">
                        <div className="w-full h-full bg-white rounded-[26.5px] flex items-center justify-center p-3">
                            <img src="/logo-floti2.png" alt="Floti Logo" className="w-full h-full object-contain" />
                        </div>
                    </div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Nueva Contraseña</h1>
                    <p className="text-slate-500 font-bold text-base text-center">Ingresa tu nueva clave de acceso</p>
                </div>

                <div className="bg-white/70 backdrop-blur-xl border border-white rounded-[48px] p-10 md:p-14 shadow-2xl shadow-slate-200/50">
                    {success ? (
                        <div className="text-center space-y-8 animate-in fade-in zoom-in duration-500">
                            <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                                <CheckCircle2 className="w-10 h-10" />
                            </div>
                            <div className="space-y-4">
                                <h3 className="text-2xl font-black text-slate-900 tracking-tight">¡Cambio Exitoso!</h3>
                                <p className="text-slate-500 font-bold">
                                    Tu contraseña ha sido actualizada. Serás redirigido al login en unos segundos.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleUpdatePassword} className="space-y-8">
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 ml-1">Nueva Contraseña</label>
                                    <div className="relative group">
                                        <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors">
                                            <Lock className="w-5 h-5" />
                                        </div>
                                        <input
                                            required
                                            type="password"
                                            placeholder="••••••••"
                                            className="w-full pl-16 pr-8 py-5 bg-slate-50/50 border border-slate-100 rounded-[28px] font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all outline-none"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 ml-1">Confirmar Contraseña</label>
                                    <div className="relative group">
                                        <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors">
                                            <Lock className="w-5 h-5" />
                                        </div>
                                        <input
                                            required
                                            type="password"
                                            placeholder="••••••••"
                                            className="w-full pl-16 pr-8 py-5 bg-slate-50/50 border border-slate-100 rounded-[28px] font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all outline-none"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>

                            {error && (
                                <div className="p-5 bg-rose-50 border border-rose-100 rounded-3xl flex items-center gap-4 text-rose-600 animate-in fade-in zoom-in duration-300">
                                    <AlertCircle className="w-5 h-5 shrink-0" />
                                    <p className="text-sm font-bold">{error}</p>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-6 bg-blue-600 text-white rounded-[28px] font-black uppercase text-xs tracking-[0.2em] hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                            >
                                {loading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        Actualizar Contraseña
                                        <ArrowRight className="w-5 h-5" />
                                    </>
                                )}
                            </button>
                        </form>
                    )}
                </div>

                <p className="text-center mt-12 text-slate-400 font-bold text-xs">
                    © 2026 Datactar. Seguridad Reforzada.
                </p>
            </div>
        </div>
    );
}
