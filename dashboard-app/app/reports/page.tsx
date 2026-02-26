'use client';

import { useState, useEffect, Suspense } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { supabase } from '@/lib/supabase';
import { Download, FileText, Calendar, Filter, ChevronRight, Activity, TrendingUp, AlertCircle, Printer, CheckCircle2, X, AlertTriangle, Eye, Settings, Hammer, Wrench, AlertOctagon, Fuel, User } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

function ReportsContent() {
    const searchParams = useSearchParams();
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [reportData, setReportData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [summary, setSummary] = useState({
        totalKm: 0,
        avgDaily: 0,
        complianceRate: 0,
        missingRecords: 0
    });

    const [activeTab, setActiveTab] = useState<'mileage' | 'preop' | 'vehicle_report'>('mileage');
    const [selectedVehicleForReport, setSelectedVehicleForReport] = useState<string>('');
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [vehicleReportData, setVehicleReportData] = useState<any>(null);
    const [preopData, setPreopData] = useState<any[]>([]);
    const [preopSummary, setPreopSummary] = useState({
        complianceRate: 0,
        criticalIssues: 0
    });

    const [showOnlyIssues, setShowOnlyIssues] = useState(false);
    const [selectedPreop, setSelectedPreop] = useState<any>(null);
    const [preopDetails, setPreopDetails] = useState<any[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);

    useEffect(() => {
        // Default to last 7 days
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 7);
        setDateRange({
            start: start.toISOString().split('T')[0],
            end: end.toISOString().split('T')[0]
        });

        // Handle URL Params
        const tab = searchParams.get('tab');
        const filter = searchParams.get('filter');
        if (tab === 'preop') setActiveTab('preop');
        if (tab === 'vehicle_report') setActiveTab('vehicle_report');
        if (filter === 'issues') setShowOnlyIssues(true);

        const loadVehicles = async () => {
            const { data } = await supabase.from('vehicles').select('*').order('plate', { ascending: true });
            if (data) setVehicles(data);
        };
        loadVehicles();
    }, [searchParams]);

    const filteredPreopData = showOnlyIssues
        ? preopData.filter(v => !v.passed)
        : preopData;

    async function getAIRecommendations(vehicle: any, stats: any) {
        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [
                        { role: 'user', content: `Genera una recomendación de 3 líneas para el vehículo ${vehicle.plate} (${vehicle.brand} ${vehicle.line}) considerando: Kilometraje recorrido este mes: ${stats.km_driven} km, Fallos preoperacionales encontrados: ${stats.failCount}, Calificación ponderada: ${stats.weightedScore}/100, Estado general: ${stats.preopStatus}. Sé profesional y directo.` }
                    ]
                })
            });
            const data = await res.json();
            setVehicleReportData((prev: any) => ({ ...prev, ai_recommendation: data.message }));
        } catch (error) {
            setVehicleReportData((prev: any) => ({ ...prev, ai_recommendation: 'No se pudieron generar recomendaciones en este momento.' }));
        }
    }

    async function generateReport() {
        setLoading(true);
        try {
            if (activeTab === 'mileage') {
                const { data: sData } = await supabase.from('company_settings').select('*').eq('key', 'working_hours').single();
                const wh = sData?.value || { days: [1, 2, 3, 4, 5], startTime: '08:00', endTime: '18:00' };
                const { data: vData } = await supabase.from('vehicles').select('*');
                const { data: rData } = await supabase.from('route_records').select('*, users(full_name)').gte('recorded_at', `${dateRange.start}T00:00:00Z`).lte('recorded_at', `${dateRange.end}T23:59:59Z`).order('recorded_at', { ascending: true });
                const { data: aData } = await supabase.from('driver_assignments').select('vehicle_id, users(full_name)').eq('role', 'principal').eq('is_active', true);

                if (vData && rData) {
                    const daysInRange: string[] = [];
                    let curr = new Date(dateRange.start);
                    while (curr <= new Date(dateRange.end)) {
                        daysInRange.push(curr.toISOString().split('T')[0]);
                        curr.setDate(curr.getDate() + 1);
                    }

                    const processed = vData.map(v => {
                        const vehicleRecords = rData.filter(r => r.vehicle_id === v.id);
                        const assignment = aData?.find(a => a.vehicle_id === v.id);
                        const currentDriver = assignment?.users ? (assignment.users as any).full_name : v.main_driver;
                        let kmInRange = 0;
                        if (vehicleRecords.length > 1) kmInRange = vehicleRecords[vehicleRecords.length - 1].odometer - vehicleRecords[0].odometer;

                        let compliantDays = 0;
                        let totalWorkingDays = 0;
                        daysInRange.forEach(d => {
                            if (wh.days.includes(new Date(`${d}T12:00:00`).getDay())) {
                                totalWorkingDays++;
                                if (vehicleRecords.some(r => r.recorded_at.startsWith(d) && r.activity_type === 'start') && vehicleRecords.some(r => r.recorded_at.startsWith(d) && r.activity_type === 'end')) compliantDays++;
                            }
                        });

                        return { ...v, main_driver: currentDriver, kmInRange, totalWorkingDays, compliantDays, compliance: totalWorkingDays > 0 ? (compliantDays / totalWorkingDays) * 100 : 100 };
                    });

                    setReportData(processed);
                    const totalKm = processed.reduce((acc, c) => acc + c.kmInRange, 0);
                    const totalWorkingDaysAll = processed.reduce((acc, c) => acc + c.totalWorkingDays, 0);
                    const totalCompliantDaysAll = processed.reduce((acc, c) => acc + c.compliantDays, 0);
                    setSummary({ totalKm, avgDaily: Math.round(totalKm / Math.max(1, daysInRange.length)), complianceRate: totalWorkingDaysAll > 0 ? Math.round((totalCompliantDaysAll / totalWorkingDaysAll) * 100) : 100, missingRecords: totalWorkingDaysAll - totalCompliantDaysAll });
                }
            } else if (activeTab === 'preop') {
                const { data: vData } = await supabase
                    .from('verifications')
                    .select('*, vehicles(plate, line), users(full_name)')
                    .gte('recorded_at', `${dateRange.start}T00:00:00Z`)
                    .lte('recorded_at', `${dateRange.end}T23:59:59Z`)
                    .order('recorded_at', { ascending: false });

                if (vData) {
                    setPreopData(vData);
                    const total = vData.length;
                    const passed = vData.filter(v => v.passed).length;
                    setPreopSummary({
                        complianceRate: total > 0 ? Math.round((passed / total) * 100) : 100,
                        criticalIssues: vData.filter(v => !v.passed).length
                    });
                } else {
                    setPreopData([]);
                }
            } else if (activeTab === 'vehicle_report') {
                if (!selectedVehicleForReport) {
                    alert('Por favor selecciona un vehículo.');
                    setLoading(false);
                    return;
                }
                const vid = selectedVehicleForReport;
                // 1. Vehicle Info
                const { data: vehicle } = await supabase.from('vehicles').select('*').eq('id', vid).single();

                // 2. Mileage (Start/End)
                const { data: routes } = await supabase.from('route_records').select('*').eq('vehicle_id', vid).gte('recorded_at', `${dateRange.start}T00:00:00Z`).lte('recorded_at', `${dateRange.end}T23:59:59Z`).order('recorded_at', { ascending: true });
                const km_start = routes?.length ? routes[0].odometer : vehicle.current_odometer;
                const km_end = routes?.length ? routes[routes.length - 1].odometer : vehicle.current_odometer;
                const km_driven = km_end - km_start;

                // 3. Maintenance
                const { data: maints } = await supabase.from('maintenance_logs').select('*').eq('vehicle_id', vid).gte('status_change_date', `${dateRange.start}T00:00:00Z`).lte('status_change_date', `${dateRange.end}T23:59:59Z`).order('status_change_date', { ascending: false });

                // 4. Incidents
                const { data: incs } = await supabase.from('incidents').select('*, users(full_name)').eq('vehicle_id', vid).gte('event_date', dateRange.start).lte('event_date', dateRange.end).order('event_date', { ascending: false });

                // 5. Fuel
                const { data: fuels } = await supabase.from('fuel_records').select('*').eq('vehicle_id', vid).gte('recorded_at', `${dateRange.start}T00:00:00Z`).lte('recorded_at', `${dateRange.end}T23:59:59Z`).order('recorded_at', { ascending: false });

                // 6. Preop Agregation & Weighting
                const { data: preops } = await supabase.from('verifications').select('id, passed, comments, recorded_at').eq('vehicle_id', vid).gte('recorded_at', `${dateRange.start}T00:00:00Z`).lte('recorded_at', `${dateRange.end}T23:59:59Z`);

                let preopStatus = 'Bueno';
                let weightedScore = 100;
                let observations: any[] = [];
                let failCount = 0;

                if (preops && preops.length > 0) {
                    const preopIds = preops.map(p => p.id);
                    const { data: details } = await supabase.from('verification_details').select('*').in('verification_id', preopIds).eq('answer', 'MAL');

                    failCount = details?.length || 0;
                    weightedScore = Math.max(0, 100 - (failCount * 5));

                    if (weightedScore < 60) preopStatus = 'Malo';
                    else if (weightedScore < 90) preopStatus = 'Regular';

                    observations = preops.filter(p => p.comments && p.comments.toLowerCase() !== 'no').map(p => ({
                        date: new Date(p.recorded_at).toLocaleDateString(),
                        text: p.comments
                    }));
                }

                setVehicleReportData({
                    vehicle,
                    mileage: { km_start, km_end, km_driven },
                    maintenance: maints || [],
                    incidents: incs || [],
                    fuel: fuels || [],
                    preop: { status: preopStatus, score: weightedScore, count: preops?.length || 0, observations, failCount },
                    ai_recommendation: 'Analizando con Floti...'
                });

                getAIRecommendations(vehicle, { km_driven, failCount, preopStatus, weightedScore });
            }
        } catch (err) {
            console.error('Error generating report:', err);
        } finally {
            setLoading(false);
        }
    }

    const handlePrint = () => window.print();

    async function fetchPreopDetails(verificationId: string) {
        setLoadingDetails(true);
        try {
            const { data, error } = await supabase
                .from('verification_details')
                .select('*')
                .eq('verification_id', verificationId)
                .order('id', { ascending: true });

            if (data) setPreopDetails(data);
            else setPreopDetails([]);
        } catch (err) {
            setPreopDetails([]);
        } finally {
            setLoadingDetails(false);
        }
    }

    return (
        <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden print:bg-white print:overflow-visible font-sans">
            <div className="print:hidden"><Sidebar /></div>
            <main className="flex-1 overflow-y-auto p-8 md:p-12 print:p-0 print:overflow-visible">
                {/* Print Branding Header */}
                <div className="hidden print:flex flex-col items-center mb-12 border-b-2 border-slate-900 pb-8 uppercase text-center">
                    <h1 className="text-3xl font-black tracking-tighter">Datactar Decisions OS</h1>
                    <p className="text-sm font-bold text-slate-500 mt-2">Reporte Institucional de Operaciones</p>
                </div>

                <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 print:hidden">
                    <div>
                        <h2 className="text-4xl font-black text-slate-900 tracking-tight">Reportes de Flota</h2>
                        <p className="text-slate-500 font-bold text-lg">Inteligencia Operacional y Cumplimiento</p>

                        <div className="flex bg-slate-200/50 p-1.5 rounded-[22px] mt-8 w-fit">
                            <button
                                onClick={() => setActiveTab('mileage')}
                                className={`px-6 py-2.5 rounded-[18px] text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'mileage' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Consolidado Kilometraje
                            </button>
                            <button
                                onClick={() => setActiveTab('vehicle_report')}
                                className={`px-6 py-2.5 rounded-[18px] text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'vehicle_report' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Reporte por Vehículo
                            </button>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        {activeTab === 'vehicle_report' && (
                            <select
                                value={selectedVehicleForReport}
                                onChange={e => setSelectedVehicleForReport(e.target.value)}
                                className="bg-white px-6 py-3 rounded-2xl border border-slate-200 shadow-sm font-black text-xs outline-none min-w-[200px]"
                            >
                                <option value="">Seleccionar Vehículo</option>
                                {vehicles.map(v => (
                                    <option key={v.id} value={v.id}>{v.plate} - {v.line}</option>
                                ))}
                            </select>
                        )}
                        <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-2xl border border-slate-200 shadow-sm">
                            <Calendar className="w-5 h-5 text-blue-600" />
                            <div className="flex items-center gap-2">
                                <input type="date" className="bg-transparent font-black text-xs outline-none" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} />
                                <span className="text-slate-300 font-black">/</span>
                                <input type="date" className="bg-transparent font-black text-xs outline-none" value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} />
                            </div>
                        </div>
                        <button onClick={generateReport} disabled={loading} className="bg-slate-900 text-white px-8 py-4 rounded-[22px] font-black uppercase text-xs tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2 shadow-xl shadow-slate-200 disabled:opacity-50">
                            {loading ? 'Generando...' : <><Activity className="w-4 h-4" /> Generar</>}
                        </button>
                    </div>
                </header>

                <div className="hidden print:block mb-10 border-b-4 border-slate-900 pb-6">
                    <h1 className="text-4xl font-black">{activeTab === 'mileage' ? 'REPORTE DE KILOMETRAJE' : 'REPORTE PREOPERACIONAL'}</h1>
                    <p className="text-slate-500 font-bold mt-2">Datactar Decisions OS | Período: {dateRange.start} - {dateRange.end}</p>
                </div>

                {activeTab === 'mileage' ? (
                    reportData.length > 0 ? (
                        <div className="space-y-12">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 print:grid-cols-4">
                                <StatCard label="Km Totales" value={`${summary.totalKm} KM`} icon={<TrendingUp className="w-6 h-6" />} color="blue" />
                                <StatCard label="Promedio Diario" value={`${summary.avgDaily} KM`} icon={<Activity className="w-6 h-6" />} color="blue" />
                                <StatCard label="Cumplimiento" value={`${summary.complianceRate}%`} icon={<CheckCircle2 className="w-6 h-6" />} color="amber" />
                                <StatCard label="Faltantes" value={summary.missingRecords} icon={<AlertCircle className="w-6 h-6" />} color="rose" />
                            </div>
                            <div className="bg-white border border-slate-200 rounded-[40px] shadow-sm overflow-hidden print:border-slate-800 print:rounded-none print:shadow-none">
                                <div className="p-8 border-b border-slate-100 flex justify-between items-center print:border-slate-800">
                                    <h3 className="text-xl font-black text-slate-800 print:text-sm">Detalle por Vehículo</h3>
                                    <button onClick={handlePrint} className="flex items-center gap-2 px-6 py-3 bg-slate-50 text-slate-600 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all print:hidden border border-slate-200"><Printer className="w-4 h-4" /> Imprimir</button>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-slate-50/50 print:bg-white border-b print:border-slate-800">
                                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Vehículo</th>
                                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Conductor</th>
                                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Jornadas</th>
                                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Km</th>
                                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 print:divide-slate-200">
                                            {reportData.map((v) => (
                                                <tr key={v.id} className="hover:bg-slate-50/50 transition-colors group print:hover:bg-transparent">
                                                    <td className="px-8 py-6"><div className="bg-yellow-400 px-3 py-1 rounded-lg border-2 border-slate-900 font-black text-xs tracking-widest">{v.plate}</div></td>
                                                    <td className="px-8 py-6 font-black text-slate-700">{v.main_driver || 'Sin asignación'}</td>
                                                    <td className="px-8 py-6 text-center font-black">{v.compliantDays}/{v.totalWorkingDays}</td>
                                                    <td className="px-8 py-6 font-black">{v.kmInRange} KM</td>
                                                    <td className="px-8 py-6">
                                                        <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${v.compliance >= 100 ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                                                            {v.compliance >= 100 ? 'Cumple' : 'Alerta'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <EmptyState generateReport={generateReport} />
                    )
                ) : activeTab === 'preop' ? (
                    preopData.length > 0 ? (
                        <div className="space-y-12">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:grid-cols-3">
                                <StatCard label="Inspecciones" value={preopData.length} icon={<FileText className="w-6 h-6" />} color="blue" />
                                <StatCard label="Aprobación" value={`${preopSummary.complianceRate}%`} icon={<CheckCircle2 className="w-6 h-6" />} color="blue" />
                                <StatCard label="Novedades" value={preopSummary.criticalIssues} icon={<AlertCircle className="w-6 h-6" />} color="rose" />
                            </div>
                            <div className="bg-white border border-slate-200 rounded-[40px] shadow-sm overflow-hidden print:border-slate-800 print:rounded-none print:shadow-none">
                                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/30 print:bg-white print:border-slate-800">
                                    <div className="flex items-center gap-6">
                                        <h3 className="text-xl font-black text-slate-800 print:text-sm">Inspecciones Preoperacionales</h3>
                                        <label className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-all select-none group print:hidden">
                                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${showOnlyIssues ? 'bg-rose-500 border-rose-500' : 'border-slate-300 group-hover:border-slate-400'}`}>
                                                {showOnlyIssues && <CheckCircle2 className="w-3 h-3 text-white" />}
                                            </div>
                                            <input type="checkbox" className="hidden" checked={showOnlyIssues} onChange={() => setShowOnlyIssues(!showOnlyIssues)} />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Ver solo novedades</span>
                                        </label>
                                    </div>
                                    <button onClick={handlePrint} className="flex items-center gap-2 px-6 py-3 bg-slate-50 text-slate-600 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all print:hidden border border-slate-200"><Printer className="w-4 h-4" /> Imprimir</button>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-slate-50/50 print:bg-white border-b print:border-slate-800">
                                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Fecha</th>
                                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Vehículo</th>
                                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Conductor</th>
                                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Resultado</th>
                                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Comentarios</th>
                                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 print:divide-slate-200">
                                            {filteredPreopData.map((v) => (
                                                <tr key={v.id} className={`hover:bg-slate-50/50 transition-colors group print:hover:bg-transparent ${!v.passed ? 'bg-rose-50/30 print:bg-slate-50' : ''}`}>
                                                    <td className="px-8 py-6 font-bold text-slate-500 text-xs">{new Date(v.recorded_at).toLocaleDateString()}</td>
                                                    <td className="px-8 py-6 font-black text-slate-800">{v.vehicles?.plate}</td>
                                                    <td className="px-8 py-6 font-black text-slate-700">{v.users?.full_name}</td>
                                                    <td className="px-8 py-6 text-center">
                                                        <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${v.passed ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                                                            {v.passed ? 'Pasa' : 'No Pasa'}
                                                        </span>
                                                    </td>
                                                    <td className="px-8 py-6 max-w-xs"><p className="text-xs font-bold text-slate-600 italic">"{v.comments || 'Sin novedad'}"</p></td>
                                                    <td className="px-8 py-6 text-right">
                                                        <button
                                                            onClick={() => {
                                                                setSelectedPreop(v);
                                                                fetchPreopDetails(v.id);
                                                            }}
                                                            className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm flex items-center gap-2 ml-auto font-black uppercase text-[9px] tracking-widest"
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                            Detalles
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <EmptyState generateReport={generateReport} />
                    )
                ) : (
                    vehicleReportData ? (
                        <div id="printable-vehicle-report" className="space-y-12 print:space-y-8">
                            {/* Header Infográfico */}
                            <div className="bg-white border-2 border-slate-900 overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col md:flex-row print:shadow-none print:border-slate-800">
                                <div className="bg-slate-900 text-white p-10 md:w-1/3 flex flex-col justify-center items-center text-center">
                                    <div className="bg-yellow-400 text-black px-6 py-2 rounded-xl border-4 border-white font-black text-3xl mb-4 shadow-xl uppercase">{vehicleReportData.vehicle.plate}</div>
                                    <h2 className="text-xl font-black uppercase tracking-widest">{vehicleReportData.vehicle.brand} {vehicleReportData.vehicle.line}</h2>
                                    <p className="opacity-60 font-bold mt-2">Modelo {vehicleReportData.vehicle.model}</p>
                                </div>
                                <div className="flex-1 p-10 grid grid-cols-2 lg:grid-cols-4 gap-8">
                                    <ReportStat label="Km Inicial" value={`${vehicleReportData.mileage.km_start?.toLocaleString() || '--'} km`} />
                                    <ReportStat label="Km Final" value={`${vehicleReportData.mileage.km_end?.toLocaleString() || '--'} km`} />
                                    <ReportStat label="Km Recorridos" value={`${vehicleReportData.mileage.km_driven.toLocaleString()} km`} />
                                    <ReportStat label="Ubicación" value={vehicleReportData.vehicle.location || 'N/A'} />
                                    <ReportStat label="Calificación Preop" value={`${vehicleReportData.preop.score}/100`} color={vehicleReportData.preop.score >= 90 ? 'text-emerald-500' : vehicleReportData.preop.score >= 60 ? 'text-amber-500' : 'text-rose-500'} />
                                    <ReportStat label="Ingresos Taller" value={vehicleReportData.maintenance.length} />
                                    <ReportStat label="Registros Preop" value={vehicleReportData.preop.count} />
                                    <ReportStat label="Línea/Ref" value={vehicleReportData.vehicle.line || 'N/A'} />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                                {/* Tabla de Mantenimiento */}
                                <div className="space-y-6">
                                    <h4 className="text-xs font-black uppercase tracking-[0.3em] flex items-center gap-2 border-b-2 border-slate-900 pb-2"><Settings className="w-4 h-4" /> Historial de Taller (Período)</h4>
                                    <div className="space-y-4">
                                        {vehicleReportData.maintenance.length > 0 ? vehicleReportData.maintenance.map((m: any) => (
                                            <div key={m.id} className="border-b border-slate-100 pb-4">
                                                <div className="flex justify-between items-start mb-1">
                                                    <p className="font-black text-slate-800 text-sm">{m.activity_performed}</p>
                                                    <span className="text-[10px] font-bold text-slate-400 italic">{new Date(m.status_change_date).toLocaleDateString()}</span>
                                                </div>
                                                <p className="text-[10px] font-black uppercase text-blue-600 tracking-tight">{m.workshop_name} • {m.mileage_at_event?.toLocaleString()} km</p>
                                            </div>
                                        )) : <p className="text-slate-300 italic font-bold text-[10px]">Sin ingresos a taller este mes.</p>}
                                    </div>
                                </div>

                                {/* Tabla de Incidentes */}
                                <div className="space-y-6">
                                    <h4 className="text-xs font-black uppercase tracking-[0.3em] flex items-center gap-2 border-b-2 border-slate-900 pb-2"><AlertTriangle className="w-4 h-4" /> Incidentes y Seguros</h4>
                                    <div className="space-y-4">
                                        {vehicleReportData.incidents.length > 0 ? vehicleReportData.incidents.map((i: any) => (
                                            <div key={i.id} className="border-b border-slate-100 pb-4">
                                                <div className="flex justify-between items-start mb-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="bg-rose-100 text-rose-600 text-[8px] font-black px-1.5 py-0.5 rounded uppercase">{i.event_type}</span>
                                                        <p className="font-black text-slate-800 text-sm">{i.component_affected}</p>
                                                    </div>
                                                    <span className="text-[10px] font-bold text-slate-400 italic">{i.event_date}</span>
                                                </div>
                                                <p className="text-[10px] font-black uppercase text-slate-500 tracking-tight">Conductor: {i.users?.full_name}</p>
                                            </div>
                                        )) : <p className="text-slate-300 italic font-bold text-[10px]">Sin reportes de accidentes o incidentes.</p>}
                                    </div>
                                </div>
                            </div>

                            {/* Observaciones Preoperacionales */}
                            <div className="space-y-6">
                                <h4 className="text-xs font-black uppercase tracking-[0.3em] flex items-center gap-2 border-b-2 border-slate-900 pb-2"><FileText className="w-4 h-4" /> Observaciones de Inspección Preoperacional</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {vehicleReportData.preop.observations.length > 0 ? vehicleReportData.preop.observations.map((obs: any, idx: number) => (
                                        <div key={idx} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                                            <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">{obs.date}</span>
                                            <p className="font-bold text-slate-700 mt-2 italic text-sm">"{obs.text}"</p>
                                        </div>
                                    )) : <p className="text-slate-300 italic font-bold text-[10px]">No se registraron observaciones adicionales en el período.</p>}
                                </div>
                            </div>

                            {/* Recomendaciones Floti AI */}
                            <div className="p-8 bg-blue-50 border-2 border-blue-200 rounded-3xl relative overflow-hidden group">
                                <Activity className="absolute -right-4 -bottom-4 w-32 h-32 text-blue-100 -rotate-12 group-hover:scale-110 transition-transform" />
                                <div className="relative">
                                    <h4 className="text-blue-700 font-black text-xs uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4" /> Recomendaciones de Floti
                                    </h4>
                                    <p className="text-blue-900 font-bold leading-relaxed whitespace-pre-wrap">
                                        {vehicleReportData.ai_recommendation}
                                    </p>
                                </div>
                            </div>

                            {/* Sección de Firmas (Solo Impresión) */}
                            <div className="mt-20 pt-20 border-t-2 border-slate-200 hidden print:grid grid-cols-2 gap-20">
                                <div className="text-center">
                                    <div className="border-b-2 border-slate-900 mb-4 h-24"></div>
                                    <p className="font-black uppercase text-[10px] tracking-widest text-slate-900">Firma Administrador Flota</p>
                                    <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">Datactar Decisions OS</p>
                                </div>
                                <div className="text-center">
                                    <div className="border-b-2 border-slate-900 mb-4 h-24"></div>
                                    <p className="font-black uppercase text-[10px] tracking-widest text-slate-900">Firma Conductor Principal</p>
                                    <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">Validación de Período</p>
                                </div>
                            </div>

                            <div className="flex justify-end print:hidden">
                                <button onClick={handlePrint} className="flex items-center gap-2 px-10 py-5 bg-slate-900 text-white rounded-[24px] font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-2xl shadow-slate-200 active:scale-95">
                                    <Printer className="w-5 h-5" /> Exportar a PDF
                                </button>
                            </div>
                        </div>
                    ) : (
                        <EmptyState generateReport={generateReport} text="Selecciona un vehículo para generar el reporte" />
                    )
                )}

                {/* Pre-op Details Modal */}
                {selectedPreop && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-[40px] w-full max-w-2xl shadow-2xl border border-white relative overflow-hidden h-[85vh] flex flex-col">
                            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">Inspección Detallada</h3>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mt-1">
                                        <div className="bg-yellow-400 px-2 py-0.5 rounded text-[8px] border border-slate-900 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">{selectedPreop.vehicles?.plate || 'N/A'}</div>
                                        {selectedPreop.users?.full_name || 'Conductor'} • {selectedPreop.recorded_at ? new Date(selectedPreop.recorded_at).toLocaleDateString() : 'N/A'}
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
                                            (preopDetails || []).map((detail: any, idx: number) => (
                                                <div key={detail.id} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-slate-200 transition-all shadow-sm">
                                                    <div className="flex items-center gap-4">
                                                        <span className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400">
                                                            {idx + 1}
                                                        </span>
                                                        <p className="font-bold text-sm text-slate-800">{detail.question_text}</p>
                                                    </div>
                                                    <div className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border flex items-center gap-2 ${detail.answer === 'BIEN' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                                                        {detail.answer === 'BIEN' ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
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

export default function ReportsPage() {
    return (
        <Suspense fallback={<div className="flex h-screen bg-slate-50 items-center justify-center font-black uppercase text-xs tracking-widest text-slate-400 animate-pulse">Cargando Sistema de Reportes...</div>}>
            <ReportsContent />
        </Suspense>
    );
}

function ReportStat({ label, value, color }: any) {
    return (
        <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
            <p className={`text-xl font-black ${color || 'text-slate-900'} uppercase`}>{value}</p>
        </div>
    );
}

function EmptyState({ generateReport, text }: any) {
    return (
        <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
            <div className="w-24 h-24 bg-slate-100 rounded-[35px] flex items-center justify-center text-slate-300"><FileText className="w-12 h-12" /></div>
            <div>
                <h4 className="text-2xl font-black text-slate-800">Analítica de Flota</h4>
                <p className="text-slate-400 font-bold mt-2">{text || 'Selecciona un rango para generar el reporte de cumplimiento.'}</p>
            </div>
            <button onClick={generateReport} className="bg-blue-600 text-white px-10 py-4 rounded-[22px] font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100">Consultar Ahora</button>
        </div>
    );
}

function StatCard({ label, value, icon, color }: any) {
    const colors: any = {
        blue: "bg-blue-50 text-blue-600",
        amber: "bg-amber-50 text-amber-600",
        rose: "bg-rose-50 text-rose-600"
    };
    return (
        <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm print:shadow-none print:border-slate-300">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 print:bg-slate-100 ${colors[color]}`}>{icon}</div>
            <p className="text-3xl font-black text-slate-900 tracking-tighter mb-1 uppercase">{value}</p>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
        </div>
    );
}
