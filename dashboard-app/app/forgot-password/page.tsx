'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Mail, ArrowLeft, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    async function handleReset(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
        });

        if (resetError) {
            setError(resetError.message);
            setLoading(false);
        } else {
            setSuccess(true);
            setLoading(false);
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
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Recuperar Acceso</h1>
                    <p className="text-slate-500 font-bold text-base text-center">Te enviaremos un enlace para restablecer tu contraseña</p>
                </div>

                <div className="bg-white/70 backdrop-blur-xl border border-white rounded-[48px] p-10 md:p-14 shadow-2xl shadow-slate-200/50">
                    {success ? (
                        <div className="text-center space-y-8 animate-in fade-in zoom-in duration-500">
                            <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                                <CheckCircle2 className="w-10 h-10" />
                            </div>
                            <div className="space-y-4">
                                <h3 className="text-2xl font-black text-slate-900 tracking-tight">¡Correo Enviado!</h3>
                                <p className="text-slate-500 font-bold">
                                    Hemos enviado un enlace de recuperación a <span className="text-slate-900">{email}</span>. Revisa tu bandeja de entrada.
                                </p>
                            </div>
                            <Link
                                href="/login"
                                className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-blue-600 hover:gap-4 transition-all"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Volver al Login
                            </Link>
                        </div>
                    ) : (
                        <form onSubmit={handleReset} className="space-y-8">
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 ml-1">Correo Electrónico</label>
                                    <div className="relative group">
                                        <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors">
                                            <Mail className="w-5 h-5" />
                                        </div>
                                        <input
                                            required
                                            type="email"
                                            placeholder="tu@correo.com"
                                            className="w-full pl-16 pr-8 py-5 bg-slate-50/50 border border-slate-100 rounded-[28px] font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all outline-none"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>

                            {error && (
                                <div className="p-5 bg-rose-50 border border-rose-100 rounded-3xl flex items-center gap-4 text-rose-600 animate-in fade-in zoom-in duration-300">
                                    <p className="text-sm font-bold">{error}</p>
                                </div>
                            )}

                            <div className="space-y-4">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full py-6 bg-blue-600 text-white rounded-[28px] font-black uppercase text-xs tracking-[0.2em] hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                                >
                                    {loading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <>
                                            Enviar Enlace
                                            <ArrowRight className="w-5 h-5" />
                                        </>
                                    )}
                                </button>

                                <Link
                                    href="/login"
                                    className="w-full py-6 bg-slate-100 text-slate-500 rounded-[28px] font-black uppercase text-[10px] tracking-[0.2em] hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                    Cancelar
                                </Link>
                            </div>
                        </form>
                    )}
                </div>

                <p className="text-center mt-12 text-slate-400 font-bold text-xs">
                    © 2026 Datactar. Todos los derechos reservados.
                </p>
            </div>
        </div>
    );
}
