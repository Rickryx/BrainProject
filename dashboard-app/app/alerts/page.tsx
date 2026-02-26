'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { supabase } from '@/lib/supabase';
import {
    AlertTriangle,
    CheckCircle,
    Wrench,
    FileText,
    Car,
    User,
    ChevronRight,
    Calendar,
    Bell,
    ExternalLink,
    X,
    Eye,
    ActivitySquare
} from 'lucide-react';
import Link from 'next/link';

export default function AlertsPage() {
    const [alerts, setAlerts] = useState<any>({
        preop: [],
        docs: [],
        maintenance: []
    });
    const [loading, setLoading] = useState(true);
    const [selectedPreop, setSelectedPreop] = useState<any>(null);
    const [preopDetails, setPreopDetails] = useState<any[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);

    useEffect(() => {
        fetchAlerts();
    }, []);

    async function fetchAlerts() {
        setLoading(true);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

        try {
            // 1. Pre-op Issues (Passed = false OR has comments)
            const { data: preopData } = await supabase
                .from('verifications')
                .select('*, vehicles(plate, line), users(full_name)')
                .gte('recorded_at', today.toISOString())
                .order('recorded_at', { ascending: false });

            const preopIssues = preopData?.filter(v =>
                !v.passed ||
                (v.comments && v.comments.trim().toLowerCase() !== 'no' && v.comments.trim() !== '')
            ) || [];

            // 2. Document Expirations (Next 30 days)
            const { data: docData } = await supabase
                .from('legal_documents')
                .select('*')
                .lte('expiration_date', thirtyDaysFromNow.toISOString().split('T')[0])
                .order('expiration_date', { ascending: true });

            // 3. Maintenance Alerts
            const { data: maintData } = await supabase
                .from('maintenance_alerts')
                .select('*, vehicle:vehicles(plate, brand), rule:maintenance_rules(name)')
                .eq('status', 'active');

            setAlerts({
                preop: preopIssues,
                docs: docData || [],
                maintenance: maintData || []
            });
        } catch (error) {
            console.error('Error fetching alerts:', error);
        } finally {
            setLoading(false);
        }
    }

    async function fetchPreopDetails(verificationId: string) {
        setLoadingDetails(true);
        const { data } = await supabase
            .from('verification_details')
            .select('*')
            .eq('verification_id', verificationId)
            .order('id', { ascending: true });

        if (data) setPreopDetails(data);
        setLoadingDetails(false);
    }

    const totalAlerts = alerts.preop.length + alerts.docs.length + alerts.maintenance.length;

    return (
        <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-4 md:p-12">
                <header className="mb-12 flex justify-between items-center">
                    <div>
                        <h2 className="text-4xl font-black text-slate-900 tracking-tight leading-none mb-3">Centro de Alertas</h2>
                        <p className="text-slate-500 font-bold text-lg">Central de notificaciones críticas y cumplimiento</p>
                    </div>
                    <div className="bg-rose-500 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-3 animate-pulse">
                        <Bell className="w-5 h-5" />
                        {totalAlerts} ACCIONES PENDIENTES
                    </div>
                </header>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 grayscale opacity-50">
                        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="font-black uppercase tracking-widest text-xs">Sincronizando Alertas...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">

                        {/* 1. Pre-operational Alerts */}
                        <section className="space-y-6">
                            <h3 className="text-xl font-black text-slate-800 flex items-center gap-3 uppercase tracking-tight">
                                <ActivitySquareIcon className="w-6 h-6 text-rose-500" />
                                Novedades Preop
                            </h3>
                            <div className="space-y-4">
                                {alerts.preop.length > 0 ? alerts.preop.map((item: any) => (
                                    <AlertItem
                                        key={item.id}
                                        type="preop"
                                        title={item.vehicles?.plate}
                                        subtitle={item.users?.full_name}
                                        description={item.comments || 'Inspección No Aprobada'}
                                        time={new Date(item.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        severity={!item.passed ? 'high' : 'medium'}
                                        onViewDetails={() => {
                                            setSelectedPreop(item);
                                            fetchPreopDetails(item.id);
                                        }}
                                    />
                                )) : <EmptyAlerts label="Sin novedades preoperacionales" />}
                            </div>
                        </section>

                        {/* 2. Document Alerts */}
                        <section className="space-y-6">
                            <h3 className="text-xl font-black text-slate-800 flex items-center gap-3 uppercase tracking-tight">
                                <FileText className="w-6 h-6 text-amber-500" />
                                Vencimientos
                            </h3>
                            <div className="space-y-4">
                                {alerts.docs.length > 0 ? alerts.docs.map((item: any) => (
                                    <AlertItem
                                        key={item.id}
                                        type="doc"
                                        title={item.doc_type}
                                        subtitle={item.entity_type === 'vehicle' ? 'Vínculo: Vehículo' : 'Vínculo: Conductor'}
                                        description={`Vence el ${item.expiration_date}`}
                                        time={item.expiration_date}
                                        severity="medium"
                                        link="/documents"
                                    />
                                )) : <EmptyAlerts label="Documentación al día" />}
                            </div>
                        </section>

                        {/* 3. Maintenance Alerts */}
                        <section className="space-y-6">
                            <h3 className="text-xl font-black text-slate-800 flex items-center gap-3 uppercase tracking-tight">
                                <Wrench className="w-6 h-6 text-blue-500" />
                                Mantenimiento
                            </h3>
                            <div className="space-y-4">
                                {alerts.maintenance.length > 0 ? alerts.maintenance.map((item: any) => (
                                    <AlertItem
                                        key={item.id}
                                        type="maint"
                                        title={item.vehicle?.plate}
                                        subtitle={item.rule?.name}
                                        description="Servicio Preventivo Requerido"
                                        time={`${item.triggered_at_km?.toLocaleString()} km`}
                                        severity="high"
                                        link="/maintenance"
                                    />
                                )) : <EmptyAlerts label="Sin servicios pendientes" />}
                            </div>
                        </section>

                    </div>
                )}

                {/* Pre-op Details Modal */}
                {selectedPreop && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-[40px] w-full max-w-2xl shadow-2xl border border-white relative overflow-hidden h-[85vh] flex flex-col">
                            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">Inspección Detallada</h3>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mt-1">
                                        <div className="bg-yellow-400 px-2 py-0.5 rounded text-[8px] border border-slate-900 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">{selectedPreop.vehicles?.plate}</div>
                                        {selectedPreop.users?.full_name} • {new Date(selectedPreop.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </div>
                                <button onClick={() => setSelectedPreop(null)} className="p-3 text-slate-400 hover:bg-slate-100 rounded-2xl transition-all">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-8 space-y-8">
                                <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                                    <p className="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest">Comentarios del Conductor</p>
                                    <p className="font-bold text-slate-700 italic text-lg leading-relaxed">
                                        "{selectedPreop.comments || 'Sin comentarios adicionales'}"
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between px-4 mb-2">
                                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Punto de Inspección</p>
                                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Evaluación</p>
                                    </div>
                                    <div className="space-y-3">
                                        {loadingDetails ? (
                                            <div className="flex flex-col items-center justify-center py-20 opacity-30">
                                                <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
                                                <p className="text-[10px] font-black uppercase tracking-widest">Cargando desglose...</p>
                                            </div>
                                        ) : (
                                            preopDetails.map((detail, idx) => (
                                                <div key={detail.id} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-slate-200 transition-all shadow-sm">
                                                    <div className="flex items-center gap-4">
                                                        <span className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400">
                                                            {idx + 1}
                                                        </span>
                                                        <p className="font-bold text-sm text-slate-800">{detail.question_text}</p>
                                                    </div>
                                                    <div className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border flex items-center gap-2 ${detail.answer === 'BIEN' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                                                        {detail.answer === 'BIEN' ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                                                        {detail.answer}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="p-8 border-t border-slate-100 bg-slate-50/30">
                                <button
                                    onClick={() => setSelectedPreop(null)}
                                    className="w-full py-5 bg-slate-900 text-white rounded-[24px] font-black uppercase text-xs tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
                                >
                                    Cerrar Detalles
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

function AlertItem({ title, subtitle, description, time, severity, link, type, onViewDetails }: any) {
    const icons: any = {
        preop: <AlertTriangle className="w-5 h-5" />,
        doc: <FileText className="w-5 h-5" />,
        maint: <Wrench className="w-5 h-5" />
    };

    const colors: any = {
        high: "bg-rose-50 border-rose-100 text-rose-700",
        medium: "bg-amber-50 border-amber-100 text-amber-700",
        low: "bg-blue-50 border-blue-100 text-blue-700"
    };

    const content = (
        <div className={`p-6 rounded-[32px] border transition-all hover:shadow-xl hover:scale-[1.02] group ${colors[severity]}`}>
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-white/50 rounded-xl group-hover:rotate-12 transition-transform">
                        {icons[type]}
                    </div>
                    <div>
                        <h4 className="font-black text-lg leading-none mb-1 uppercase tracking-tight">{title}</h4>
                        <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest">{subtitle}</p>
                    </div>
                </div>
                <span className="text-[10px] font-black opacity-40">{time}</span>
            </div>
            <p className="font-bold text-sm italic line-clamp-2">"{description}"</p>
            <div className="mt-6 flex justify-end">
                <div className="p-2 bg-white/20 rounded-full group-hover:bg-white/40 transition-colors">
                    <ChevronRight className="w-4 h-4" />
                </div>
            </div>
        </div>
    );

    if (type === 'preop' && onViewDetails) {
        return (
            <button onClick={onViewDetails} className="block w-full text-left">
                {content}
            </button>
        );
    }

    return (
        <Link href={link} className="block">
            {content}
        </Link>
    );
}

function EmptyAlerts({ label }: { label: string }) {
    return (
        <div className="p-10 bg-white border border-slate-200 border-dashed rounded-[32px] text-center">
            <CheckCircle className="w-10 h-10 text-emerald-100 mx-auto mb-3" />
            <p className="text-xs font-black text-slate-300 uppercase tracking-widest">{label}</p>
        </div>
    );
}

function ActivitySquareIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M17 12h-2l-2 5-2-10-2 5H7" />
        </svg>
    )
}
