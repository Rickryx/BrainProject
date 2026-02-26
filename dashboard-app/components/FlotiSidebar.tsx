'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Bot, User, X, ChevronRight } from 'lucide-react';

export function FlotiSidebar() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([
        { role: 'assistant', content: 'Hola, soy **Floti**. Estoy listo para apoyarte con la gestión de la flota. ¿Qué necesitas saber hoy?' }
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
                setMessages(prev => [...prev, { role: 'assistant', content: 'Lo siento, hubo un error.' }]);
            }
        } catch (err) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Error de conexión.' }]);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className={`fixed right-0 top-0 h-screen transition-all duration-500 ease-in-out z-50 flex ${isOpen ? 'w-[400px]' : 'w-0'}`}>
            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 w-12 h-24 bg-[#eeeeee] border-l border-t border-b border-slate-200 rounded-l-2xl flex items-center justify-center text-blue-600 hover:text-blue-800 transition-all shadow-[-10px_0_30px_rgba(0,0,0,0.05)] ${isOpen ? 'opacity-100' : 'opacity-100'}`}
            >
                {isOpen ? <ChevronRight className="w-6 h-6" /> : <div className="flex flex-col items-center gap-2"><img src="/logo-floti2.png" alt="Floti" className="w-6 h-6 object-contain animate-pulse" /><span className="text-[10px] font-black vertical-text uppercase tracking-widest">Floti</span></div>}
            </button>

            {/* Sidebar Content */}
            <div className="flex-1 bg-[#eeeeee] border-l border-slate-200 flex flex-col shadow-[-20px_0_50px_rgba(0,0,0,0.1)] overflow-hidden">
                <header className="p-6 border-b border-slate-200 bg-white/80 backdrop-blur-md flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-cyan-500 rounded-xl p-[1px] shadow-lg shadow-blue-500/10">
                            <div className="w-full h-full bg-white rounded-[11px] flex items-center justify-center p-1.5">
                                <img src="/logo-floti2.png" alt="Floti" className="w-full h-full object-contain" />
                            </div>
                        </div>
                        <div>
                            <h3 className="text-slate-900 font-black text-sm tracking-tight">Floti Assistant</h3>
                            <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Datactar OS</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar" ref={scrollRef}>
                    {messages.map((m, i) => (
                        <div key={i} className={`flex gap-3 ${m.role === 'assistant' ? 'justify-start' : 'justify-end flex-row-reverse'}`}>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${m.role === 'assistant' ? 'bg-white border-slate-200 text-blue-600' : 'bg-blue-600 border-blue-500 text-white shadow-md'
                                }`}>
                                {m.role === 'assistant' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                            </div>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${m.role === 'assistant'
                                ? 'bg-white border border-slate-100 text-slate-700'
                                : 'bg-blue-50 border border-blue-100 text-blue-900'
                                }`}>
                                {m.content.split('\n').map((line, j) => (
                                    <p key={j} className={j > 0 ? 'mt-1' : ''}>
                                        {line.split('**').map((part, k) => (
                                            k % 2 === 1 ? <strong key={k} className="text-blue-700 font-bold">{part}</strong> : part
                                        ))}
                                    </p>
                                ))}
                            </div>
                        </div>
                    ))}
                    {loading && (
                        <div className="flex gap-3 justify-start">
                            <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-blue-600 flex items-center justify-center animate-pulse">
                                <Bot className="w-4 h-4" />
                            </div>
                            <div className="bg-white/50 border border-slate-100 rounded-2xl px-4 py-3 flex gap-1.5 items-center">
                                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" />
                                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 bg-white/50 backdrop-blur-md border-t border-slate-200">
                    <form onSubmit={handleSend} className="relative">
                        <input
                            type="text"
                            placeholder="Consultar flota..."
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 pr-12 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all placeholder:text-slate-400 shadow-inner"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                        />
                        <button
                            type="submit"
                            disabled={loading || !input.trim()}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all disabled:opacity-50 shadow-md"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </form>
                    <p className="text-[8px] text-slate-400 font-black uppercase tracking-[0.3em] text-center mt-4">Datactar Intelligent Engine</p>
                </div>
            </div>

            <style jsx>{`
                .vertical-text {
                    writing-mode: vertical-rl;
                    text-orientation: mixed;
                    transform: rotate(180deg);
                }
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(0, 0, 0, 0.05);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(0, 0, 0, 0.1);
                }
            `}</style>
        </div>
    );
}
