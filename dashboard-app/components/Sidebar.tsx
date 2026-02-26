'use client';

import Link from "next/link";
import { LayoutDashboard, Car, Calendar, Users, Settings, LogOut, FileText, Sparkles, Bell, Map as MapIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

const navItems = [
    { name: "Resumen", href: "/", icon: LayoutDashboard },
    { name: "Alertas", href: "/alerts", icon: Bell },
    { name: "Conductores", href: "/drivers", icon: Users },
    { name: "Vehiculos", href: "/vehicles", icon: Car },
    { name: "Viajes", href: "/trips", icon: MapIcon },
    { name: "Documentación", href: "/documents", icon: Sparkles },
    { name: "Reportes", href: "/reports", icon: FileText },
    { name: "Ajustes", href: "/settings", icon: Settings },
];

export function Sidebar() {
    const router = useRouter();

    async function handleSignOut() {
        await supabase.auth.signOut();
        router.push("/login");
    }

    return (
        <aside className="w-64 bg-white border-r border-slate-200 hidden md:flex flex-col shadow-sm shrink-0">
            <div className="p-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-cyan-500 rounded-xl p-[1px] shadow-lg shadow-blue-500/10">
                        <div className="w-full h-full bg-white rounded-[11px] flex items-center justify-center p-1.5">
                            <img src="/logo-floti2.png" alt="Floti" className="w-full h-full object-contain" />
                        </div>
                    </div>
                    <div>
                        <h1 className="text-xl font-black bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent leading-none">
                            FLOTI
                        </h1>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                            by Datactar
                        </p>
                    </div>
                </div>
            </div>

            <nav className="flex-1 px-4 space-y-1">
                {navItems.map((item) => (
                    <Link
                        key={item.name}
                        href={item.href}
                        className="flex items-center gap-3 px-4 py-3 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all duration-200 group"
                    >
                        <item.icon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        <span className="font-semibold">{item.name}</span>
                    </Link>
                ))}
            </nav>

            <div className="p-4 border-t border-slate-100">
                <button
                    onClick={handleSignOut}
                    className="flex items-center gap-3 px-4 py-3 text-slate-500 hover:text-rose-600 hover:bg-rose-50 w-full rounded-xl transition-all duration-200"
                >
                    <LogOut className="w-5 h-5" />
                    <span>Sign Out</span>
                </button>
            </div>
        </aside>
    );
}
