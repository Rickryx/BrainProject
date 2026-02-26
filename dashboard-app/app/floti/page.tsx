'use client';

import { useState, useRef, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Send, Sparkles, Bot, User, ArrowLeft, Terminal, Shield } from 'lucide-react';
import Link from 'next/link';

export default function FlotiPage() {
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([
        { role: 'assistant', content: 'Hola, soy **Floti**. Estoy listo para ayudarte a optimizar la gestión de tu flota. ¿En qué puedo apoyarte hoy?' }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    async function handleSend(e: React.FormEvent) {
        e.preventDefault();
        if (!input.trim() || loading) return;

        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setLoading(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: [...messages.slice(-5), { role: 'user', content: userMsg }] })
            });
            const data = await response.json();

            if (data.message) {
                setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
            } else {
                setMessages(prev => [...prev, { role: 'assistant', content: 'Lo siento, hubo un error procesando tu solicitud.' }]);
            }
        } catch (err) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Hubo un error de conexión.' }]);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex h-screen bg-slate-900 text-white overflow-hidden font-sans">
            <Sidebar />
            <main className="flex-1 flex flex-col relative">
                {/* Background Decoration */}
                <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-500/10 blur-[150px] rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-500/10 blur-[150px] rounded-full translate-y-1/2 -translate-x-1/2" />

                <header className="p-8 md:p-12 border-b border-white/5 flex items-center justify-between relative bg-slate-900/50 backdrop-blur-md">
                    <div className="flex items-center gap-6">
                        <div className="w-16 h-16 bg-gradient-to-tr from-blue-600 to-cyan-500 rounded-[22px] p-[2px] shadow-2xl shadow-blue-500/20">
                            <div className="w-full h-full bg-slate-900 rounded-[20px] flex items-center justify-center">
                                <Sparkles className="w-8 h-8 text-blue-400" />
                            </div>
                        </div>
                        <div>
                            <h2 className="text-3xl font-black tracking-tighter flex items-center gap-3">
                                Floti AI Assistant
                                <span className="bg-blue-500/10 text-blue-400 text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full border border-blue-500/20">Admin Only</span>
                            </h2>
                            <p className="text-slate-500 font-bold text-sm uppercase tracking-widest mt-1">Sincronización total con Datactar Decision-OS</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="bg-slate-800/50 px-4 py-2 rounded-xl flex items-center gap-2 border border-white/5 text-xs font-black uppercase tracking-widest text-slate-400">
                            <Terminal className="w-4 h-4" /> Ready for input
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-8 md:p-12 space-y-8 scroll-smooth custom-scrollbar relative" ref={scrollRef}>
                    <div className="max-w-4xl mx-auto space-y-10">
                        {messages.map((m, i) => (
                            <div key={i} className={`flex gap-6 ${m.role === 'assistant' ? 'justify-start' : 'justify-end flex-row-reverse'}`}>
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${m.role === 'assistant' ? 'bg-slate-800 border-white/10 text-blue-400' : 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/20'
                                    }`}>
                                    {m.role === 'assistant' ? <Bot className="w-6 h-6" /> : <User className="w-6 h-6" />}
                                </div>
                                <div className={`max-w-[80%] rounded-[32px] px-8 py-6 text-lg leading-relaxed shadow-sm border ${m.role === 'assistant'
                                    ? 'bg-slate-800/40 border-white/5 text-slate-200'
                                    : 'bg-slate-800 border-white/10 text-white'
                                    }`}>
                                    {m.content.split('\n').map((line, j) => (
                                        <p key={j} className={j > 0 ? 'mt-2' : ''}>
                                            {line.split('**').map((part, k) => (
                                                k % 2 === 1 ? <strong key={k} className="text-blue-400 font-black">{part}</strong> : part
                                            ))}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex gap-6 justify-start">
                                <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-white/10 text-blue-400 flex items-center justify-center animate-pulse">
                                    <Bot className="w-6 h-6" />
                                </div>
                                <div className="bg-slate-800/40 border border-white/5 rounded-[32px] px-8 py-6 flex gap-2">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-8 md:p-12 relative bg-slate-900/50 backdrop-blur-md">
                    <div className="max-w-4xl mx-auto">
                        <form onSubmit={handleSend} className="relative group">
                            <div className="absolute inset-0 bg-blue-500/20 blur-2xl group-focus-within:bg-blue-500/30 transition-all rounded-[30px]" />
                            <div className="relative flex items-center">
                                <input
                                    type="text"
                                    placeholder="Escribe tu consulta sobre la flota aquí..."
                                    className="w-full bg-slate-800/80 border border-white/10 rounded-[30px] px-10 py-6 pr-20 text-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder:text-slate-600 shadow-2xl"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                />
                                <button
                                    type="submit"
                                    disabled={loading || !input.trim()}
                                    className="absolute right-4 p-4 bg-blue-600 hover:bg-blue-500 text-white rounded-[20px] transition-all active:scale-95 disabled:opacity-50 disabled:grayscale"
                                >
                                    <Send className="w-6 h-6" />
                                </button>
                            </div>
                        </form>
                        <p className="text-center mt-6 text-[10px] text-slate-600 font-black uppercase tracking-[0.4em]">Powered by Datactar Intelligent Engine</p>
                    </div>
                </div>
            </main>
        </div>
    );
}
