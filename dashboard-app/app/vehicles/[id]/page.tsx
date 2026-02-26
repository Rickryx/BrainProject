'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { supabase } from '@/lib/supabase';
import { Car, ArrowLeft, Save, Trash2, Camera, Activity, User, Info, Bell, Shield, Calendar, Upload, ExternalLink, AlertTriangle, CheckCircle, X, Eye, Fuel, Hammer, AlertOctagon, Wrench, Droplets, CircleDot, RotateCcw } from 'lucide-react';

export default function VehicleDetailPage() {
    const router = useRouter();
    const params = useParams();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [vehicle, setVehicle] = useState<any>(null);
    const [drivers, setDrivers] = useState<any[]>([]);
    const [history, setHistory] = useState<any[]>([]);
    const [activeAssignments, setActiveAssignments] = useState<any[]>([]);
    const [legalDocs, setLegalDocs] = useState<any[]>([]);
    const [fuelHistory, setFuelHistory] = useState<any[]>([]);
    const [selectedPreop, setSelectedPreop] = useState<any>(null);
    const [preopDetails, setPreopDetails] = useState<any[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [maintenanceHistory, setMaintenanceHistory] = useState<any[]>([]);
    const [incidentHistory, setIncidentHistory] = useState<any[]>([]);
    const [isMaintModalOpen, setIsMaintModalOpen] = useState(false);
    const [isIncidentModalOpen, setIsIncidentModalOpen] = useState(false);
    const [kmSinceOil, setKmSinceOil] = useState<number>(0);
    const [kmSinceAlign, setKmSinceAlign] = useState<number>(0);
    const [lastOilDate, setLastOilDate] = useState<string | null>(null);
    const [lastAlignDate, setLastAlignDate] = useState<string | null>(null);

    const [maintForm, setMaintForm] = useState({
        activity_performed: '', workshop_name: '', mileage_at_event: '',
        status_change_date: new Date().toISOString().slice(0, 16), observations: ''
    });
    const [incidentForm, setIncidentForm] = useState({
        event_date: new Date().toISOString().slice(0, 10),
        event_time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
        event_type: 'Accidente', component_affected: '', driver_id: '', observations: ''
    });

    useEffect(() => { if (params.id) fetchData(); }, [params.id]);

    async function fetchData() {
        setLoading(true);
        try {
            const { data: vData } = await supabase.from('vehicles').select('*').eq('id', params.id).maybeSingle();
            if (vData) setVehicle(vData);

            const { data: dData } = await supabase.from('users').select('id, full_name').eq('role', 'driver').order('full_name');
            if (dData) setDrivers(dData);

            const { data: aData } = await supabase.from('driver_assignments').select('*, users(full_name)').eq('vehicle_id', params.id).eq('is_active', true);
            if (aData) setActiveAssignments(aData);

            const { data: docData } = await supabase.from('legal_documents').select('*').eq('entity_id', params.id).eq('entity_type', 'vehicle').order('expiration_date', { ascending: false });
            if (docData) setLegalDocs(docData);

            const { data: rData } = await supabase.from('route_records').select('*, users:driver_id(full_name)').eq('vehicle_id', params.id).order('recorded_at', { ascending: false }).limit(20);
            const { data: allRoutes } = await supabase.from('route_records').select('activity_type, odometer, recorded_at').eq('vehicle_id', params.id).order('recorded_at', { ascending: true });

            if (rData) {
                const enrichedHistory = await Promise.all(rData.map(async (rec) => {
                    if (rec.activity_type === 'start') {
                        const { data: vVerif } = await supabase.from('verifications').select('id, passed, comments').eq('vehicle_id', params.id).eq('driver_id', rec.driver_id).gte('recorded_at', new Date(new Date(rec.recorded_at).getTime() - 30 * 60000).toISOString()).lte('recorded_at', rec.recorded_at).order('recorded_at', { ascending: false }).limit(1).maybeSingle();
                        return { ...rec, verification: vVerif };
                    }
                    return rec;
                }));
                setHistory(enrichedHistory);
                const todayStr = new Date().toLocaleDateString('en-CA');
                const todayRecords = rData.filter(r => new Date(r.recorded_at).toLocaleDateString('en-CA') === todayStr);
                const startRecord = todayRecords.find(r => r.activity_type === 'start');
                const endRecord = todayRecords.find(r => r.activity_type === 'end');
                const lastKnownKm = rData[0]?.odometer ?? null;
                setVehicle((prev: any) => prev ? {
                    ...prev,
                    todayStart: startRecord?.odometer,
                    todayEnd: endRecord?.odometer,
                    todayTotal: (startRecord?.odometer !== undefined && endRecord?.odometer !== undefined) ? endRecord.odometer - startRecord.odometer : null,
                    lastKnownKm,
                } : prev);
            }

            const { data: maintData } = await supabase.from('maintenance_logs').select('*').eq('vehicle_id', params.id).order('status_change_date', { ascending: false });
            if (maintData) {
                setMaintenanceHistory(maintData);
                const lastOil = maintData.find(m => m.activity_performed?.toLowerCase().includes('aceite'));
                const lastAlign = maintData.find(m => m.activity_performed?.toLowerCase().includes('alineaci') || m.activity_performed?.toLowerCase().includes('balanceo'));
                if (lastOil) setLastOilDate(lastOil.status_change_date);
                if (lastAlign) setLastAlignDate(lastAlign.status_change_date);
                if (allRoutes) {
                    setKmSinceOil(calcKmSince(allRoutes, lastOil ? new Date(lastOil.status_change_date) : null));
                    setKmSinceAlign(calcKmSince(allRoutes, lastAlign ? new Date(lastAlign.status_change_date) : null));
                }
            }

            const { data: fData } = await supabase.from('fuel_records').select('*, users:driver_id(full_name)').eq('vehicle_id', params.id).order('recorded_at', { ascending: false });
            if (fData) setFuelHistory(fData);

            const { data: incData } = await supabase.from('incidents').select('*, users:driver_id(full_name)').eq('vehicle_id', params.id).order('event_date', { ascending: false });
            if (incData) setIncidentHistory(incData);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }

    function calcKmSince(routes: any[], since: Date | null): number {
        let total = 0;
        const starts = routes.filter(r => r.activity_type === 'start');
        const ends = routes.filter(r => r.activity_type === 'end');
        for (const start of starts) {
            if (since && new Date(start.recorded_at) < since) continue;
            const matchEnd = ends.find(e => new Date(e.recorded_at) > new Date(start.recorded_at));
            if (matchEnd && start.odometer && matchEnd.odometer) {
                const diff = matchEnd.odometer - start.odometer;
                if (diff > 0) total += diff;
            }
        }
        return total;
    }

    async function handleSave() {
        setSaving(true);
        try {
            const { error: vError } = await supabase.from('vehicles').update({ status: vehicle.status, main_driver: vehicle.main_driver, location: vehicle.location, brand: vehicle.brand, line: vehicle.line, model: vehicle.model, image_url: vehicle.image_url, oil_change_interval: vehicle.oil_change_interval, alignment_interval: vehicle.alignment_interval }).eq('id', vehicle.id);
            if (vError) throw vError;
            if (vehicle.main_driver) {
                const sel = drivers.find(d => d.full_name === vehicle.main_driver);
                if (sel) {
                    await supabase.from('driver_assignments').update({ is_active: false }).eq('vehicle_id', vehicle.id).eq('role', 'principal');
                    const { error: aError } = await supabase.from('driver_assignments').upsert({ driver_id: sel.id, vehicle_id: vehicle.id, role: 'principal', is_active: true }, { onConflict: 'driver_id, vehicle_id' });
                    if (aError) throw aError;
                }
            }
            alert('¡Cambios guardados!');
        } catch (err: any) { alert(`Error al guardar: ${err.message}`); }
        finally { setSaving(false); }
    }

    async function handleNotify() {
        const activeAssignment = activeAssignments.find(a => a.role === 'principal') || activeAssignments[0];
        if (!activeAssignment?.driver_id) { alert('No hay conductor activo.'); return; }
        const driverName = vehicle?.main_driver || 'el conductor';
        if (!confirm(`¿Enviar recordatorio a ${driverName}?`)) return;
        try {
            const res = await fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ driverId: activeAssignment.driver_id, message: `Hola ${driverName}! No veo tu registro de hoy en el vehículo ${vehicle?.plate}.` }) });
            if (res.ok) alert(`✅ Notificación enviada a ${driverName}`);
            else { const d = await res.json(); alert(`❌ Error: ${d?.error || 'No se pudo enviar'}`); }
        } catch { alert('Error al conectar.'); }
    }

    async function handleSaveMaintenance() {
        if (!maintForm.activity_performed || !maintForm.workshop_name) { alert('Completa los campos obligatorios.'); return; }
        try {
            const { error } = await supabase.from('maintenance_logs').insert({ vehicle_id: params.id, activity_performed: maintForm.activity_performed, workshop_name: maintForm.workshop_name, mileage_at_event: maintForm.mileage_at_event ? parseFloat(maintForm.mileage_at_event) : null, status_change_date: maintForm.status_change_date, observations: maintForm.observations });
            if (error) throw error;
            setIsMaintModalOpen(false);
            setMaintForm({ activity_performed: '', workshop_name: '', mileage_at_event: '', status_change_date: new Date().toISOString().slice(0, 16), observations: '' });
            fetchData();
        } catch (err: any) { alert(`Error: ${err.message}`); }
    }

    async function handleSaveIncident() {
        if (!incidentForm.event_type || !incidentForm.driver_id) { alert('Selecciona tipo y conductor.'); return; }
        try {
            const { error } = await supabase.from('incidents').insert({ vehicle_id: params.id, ...incidentForm });
            if (error) throw error;
            setIsIncidentModalOpen(false);
            setIncidentForm({ event_date: new Date().toISOString().slice(0, 10), event_time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }), event_type: 'Accidente', component_affected: '', driver_id: '', observations: '' });
            fetchData();
        } catch (err: any) { alert(`Error: ${err.message}`); }
    }

    async function handleQuickService(type: 'oil' | 'align') {
        const label = type === 'oil' ? 'Cambio de Aceite' : 'Alineación y Balanceo';
        const workshop = prompt(`¿En qué taller se realizó el ${label}?`);
        if (!workshop) return;
        try {
            const { error } = await supabase.from('maintenance_logs').insert({ vehicle_id: params.id, activity_performed: label, workshop_name: workshop, mileage_at_event: vehicle?.lastKnownKm ?? vehicle?.current_odometer ?? null, status_change_date: new Date().toISOString(), observations: 'Registrado desde panel de servicios' });
            if (error) throw error;
            alert(`✅ ${label} registrado. Contador reiniciado.`);
            fetchData();
        } catch (err: any) { alert(`Error: ${err.message}`); }
    }

    const oilInterval = vehicle?.oil_change_interval || 5000;
    const alignInterval = vehicle?.alignment_interval || 10000;
    const oilRemaining = oilInterval - kmSinceOil;
    const alignRemaining = alignInterval - kmSinceAlign;
    const activeAssignment = activeAssignments.find(a => a.role === 'principal') || activeAssignments[0];
    const hasStartToday = vehicle?.todayStart !== undefined;
    const hasEndToday = vehicle?.todayEnd !== undefined;

    if (loading) return <div className="flex items-center justify-center h-screen bg-slate-50"><div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

    if (!vehicle) return (
        <div className="flex flex-col items-center justify-center h-screen bg-slate-50 gap-6">
            <div className="bg-white p-12 rounded-[40px] shadow-sm border border-slate-200 text-center">
                <Car className="w-16 h-16 text-slate-200 mx-auto mb-6" />
                <h2 className="text-2xl font-black text-slate-800">Vehículo no encontrado</h2>
            </div>
            <button onClick={() => router.back()} className="flex items-center gap-2 bg-slate-900 text-white px-8 py-4 rounded-[20px] font-black uppercase text-xs tracking-widest hover:bg-slate-800">
                <ArrowLeft className="w-4 h-4" /> Volver
            </button>
        </div>
    );

    return (
        <div className="flex h-screen bg-slate-100/50 text-slate-900 font-sans">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
                <button onClick={() => router.back()} className="flex items-center gap-2 text-slate-500 font-black uppercase text-[10px] tracking-[0.2em] mb-4 hover:text-blue-600 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Volver a Inventario
                </button>

                <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-6">

                    {/* ── Summary Card — compacta, sin scroll ── */}
                    <div className="lg:w-[340px] shrink-0">
                        <div className="bg-[#f2f4f7] rounded-[28px] p-4 shadow-xl border border-white relative overflow-hidden sticky top-4">
                            <div className="absolute -top-16 -right-16 w-48 h-48 bg-blue-400/10 blur-[60px] rounded-full pointer-events-none" />
                            <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-blue-400/10 blur-[60px] rounded-full pointer-events-none" />
                            <div className="relative space-y-3">

                                {/* Plate + Status */}
                                <div className="flex items-center justify-between">
                                    <div className="bg-yellow-400 px-2.5 py-1 rounded-lg border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                                        <span className="font-black text-slate-900 text-sm tracking-[0.15em] uppercase">{vehicle.plate}</span>
                                    </div>
                                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-widest uppercase border ${vehicle.status === 'Activo' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-rose-100 text-rose-700 border-rose-200'}`}>
                                        {vehicle.status === 'Activo' ? 'En Orden' : vehicle.status}
                                    </span>
                                </div>

                                {/* Brand + Driver en una fila */}
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <p className="text-slate-400 text-[9px] font-black uppercase tracking-[0.3em] leading-none">{vehicle.brand}</p>
                                        <h3 className="text-lg font-black text-slate-900 leading-tight">{vehicle.line || 'SUV'} <span className="text-slate-400 font-bold text-sm">{vehicle.model}</span></h3>
                                    </div>
                                    <div className="flex items-center gap-1.5 bg-white/70 rounded-xl px-2.5 py-1.5 border border-white shrink-0">
                                        <User className="w-3 h-3 text-slate-400" />
                                        <p className="font-black text-slate-700 text-[10px] max-w-[90px] truncate">{activeAssignment?.users?.full_name || 'Sin Conductor'}</p>
                                        {activeAssignments.length > 0 && (
                                            <button onClick={handleNotify} className="ml-0.5 text-blue-500 hover:text-blue-700" title="Notificar">
                                                <Bell className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Image — más pequeña */}
                                <div className="h-20 flex items-center justify-center">
                                    {vehicle.image_url
                                        ? <img src={vehicle.image_url} alt="Vehicle" className="h-full object-contain drop-shadow-xl hover:scale-105 transition-transform duration-500" />
                                        : <div className="bg-white/50 p-4 rounded-2xl border border-dashed border-slate-300 text-slate-200"><Car className="w-12 h-12" /></div>
                                    }
                                </div>

                                {/* Recorrido Hoy — compacto */}
                                <div className="bg-white/60 rounded-2xl p-3 border border-white">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-black text-slate-600 text-[9px] uppercase tracking-widest flex items-center gap-1">
                                            <Activity className="w-3 h-3" /> Recorrido Hoy
                                        </span>
                                        {hasStartToday || hasEndToday
                                            ? <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded-md text-[8px] font-black uppercase">Registrado</span>
                                            : <span className="bg-slate-100 text-slate-400 px-2 py-0.5 rounded-md text-[8px] font-black uppercase">Sin datos hoy</span>
                                        }
                                    </div>
                                    <div className="grid grid-cols-3 gap-1.5">
                                        <MiniStat label="Inicio" value={vehicle.todayStart ?? vehicle.lastKnownKm} color="blue" dim={!hasStartToday} />
                                        <MiniStat label="Recorrido" value={vehicle.todayTotal ?? '--'} color="black" dark />
                                        <MiniStat label="Fin" value={vehicle.todayEnd} color="rose" dim={!hasEndToday} />
                                    </div>
                                    {hasStartToday && !hasEndToday && (
                                        <div className="mt-1.5 flex items-center gap-1.5 bg-amber-50 rounded-lg px-2 py-1 border border-amber-100">
                                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                            <span className="text-[8px] font-black uppercase text-amber-600">En ruta ahora</span>
                                        </div>
                                    )}
                                    {hasStartToday && hasEndToday && vehicle.todayTotal !== null && (
                                        <div className="mt-1.5 flex items-center justify-between bg-blue-50 rounded-lg px-2 py-1 border border-blue-100">
                                            <span className="text-[8px] font-black uppercase text-blue-400">Total hoy</span>
                                            <span className="text-xs font-black text-blue-700">+{vehicle.todayTotal.toLocaleString()} km</span>
                                        </div>
                                    )}
                                </div>

                                {/* Servicios — muy compactos */}
                                <div className="space-y-1.5">
                                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 px-0.5">Próximos Servicios</p>
                                    <ServiceAlert
                                        icon={<Droplets className="w-3 h-3" />}
                                        label="Aceite"
                                        kmDone={kmSinceOil}
                                        interval={oilInterval}
                                        remaining={oilRemaining}
                                        lastDate={lastOilDate}
                                        onReset={() => handleQuickService('oil')}
                                    />
                                    <ServiceAlert
                                        icon={<CircleDot className="w-3 h-3" />}
                                        label="Alineación"
                                        kmDone={kmSinceAlign}
                                        interval={alignInterval}
                                        remaining={alignRemaining}
                                        lastDate={lastAlignDate}
                                        onReset={() => handleQuickService('align')}
                                    />
                                </div>

                                <p className="text-center text-[8px] text-slate-300 font-black uppercase tracking-[0.3em]">By Datactar</p>
                            </div>
                        </div>
                    </div>

                    {/* ── Right column ── */}
                    <div className="flex-1 space-y-6">
                        {/* Detalles Técnicos */}
                        <div className="bg-white rounded-[32px] p-7 shadow-sm border border-slate-200">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl"><Info className="w-5 h-5" /></div>
                                    <h3 className="text-xl font-black text-slate-900 tracking-tight">Detalles Técnicos</h3>
                                </div>
                                <span className={`px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest border-2 ${vehicle.status === 'Activo' ? 'bg-blue-50 text-blue-600 border-blue-100' : vehicle.status === 'Mantenimiento' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>{vehicle.status}</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                                <FormField label="Placa (ID)" value={vehicle.plate} readOnly />
                                <FormField label="Estado de Operación" type="select" value={vehicle.status || 'Activo'} options={['Activo', 'Inactivo', 'Mantenimiento']} onChange={(val: string) => setVehicle({ ...vehicle, status: val })} />
                                <FormField label="Conductor Principal" type="select" value={vehicle.main_driver || ''} options={['', ...Array.from(new Set(drivers.map(d => d.full_name)))]} onChange={(val: string) => setVehicle({ ...vehicle, main_driver: val })} />
                                <FormField label="Lugar de Circulación" value={vehicle.location} onChange={(val: string) => setVehicle({ ...vehicle, location: val })} />
                                <FormField label="Marca / Fabricante" value={vehicle.brand} onChange={(val: string) => setVehicle({ ...vehicle, brand: val })} />
                                <FormField label="Línea / Versión" value={vehicle.line} onChange={(val: string) => setVehicle({ ...vehicle, line: val })} />
                                <FormField label="Modelo (Año)" value={vehicle.model} onChange={(val: string) => setVehicle({ ...vehicle, model: val })} />
                                <div className="md:col-span-2">
                                    <FormField label="URL Imagen (Cloud)" value={vehicle.image_url} placeholder="https://..." onChange={(val: string) => setVehicle({ ...vehicle, image_url: val })} icon={<Camera className="w-4 h-4" />} />
                                </div>
                                <div className="md:col-span-2 pt-5 border-t border-slate-100">
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="p-2 bg-amber-50 text-amber-600 rounded-lg"><Wrench className="w-4 h-4" /></div>
                                        <h4 className="font-black text-slate-800 uppercase text-sm tracking-tight">Intervalos de Servicio</h4>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1 flex items-center gap-2"><Droplets className="w-3.5 h-3.5 text-amber-500" /> Cambio de Aceite (cada X km)</label>
                                            <input type="number" value={vehicle.oil_change_interval ?? 5000} onChange={(e) => setVehicle({ ...vehicle, oil_change_interval: parseInt(e.target.value) || 0 })} className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-[16px] font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-500/10" placeholder="5000" />
                                            <p className="text-[10px] font-bold text-slate-400 ml-1">Recorrido desde último: <span className="text-amber-600 font-black">{kmSinceOil.toLocaleString()} km</span></p>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1 flex items-center gap-2"><CircleDot className="w-3.5 h-3.5 text-blue-500" /> Alineación y Balanceo (cada X km)</label>
                                            <input type="number" value={vehicle.alignment_interval ?? 10000} onChange={(e) => setVehicle({ ...vehicle, alignment_interval: parseInt(e.target.value) || 0 })} className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-[16px] font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-500/10" placeholder="10000" />
                                            <p className="text-[10px] font-bold text-slate-400 ml-1">Recorrido desde último: <span className="text-blue-600 font-black">{kmSinceAlign.toLocaleString()} km</span></p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col md:flex-row gap-3 justify-between">
                                <button className="flex items-center justify-center gap-2 px-6 py-3 bg-rose-50 text-rose-600 rounded-[16px] font-black uppercase text-xs tracking-widest hover:bg-rose-100 transition-all">
                                    <Trash2 className="w-4 h-4" /> Eliminar Vehículo
                                </button>
                                <button onClick={handleSave} disabled={saving} className="flex items-center justify-center gap-2 px-10 py-3 bg-blue-600 text-white rounded-[16px] font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 active:scale-95 disabled:opacity-50">
                                    <Save className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar Cambios'}
                                </button>
                            </div>
                        </div>

                        {/* Documentación Legal */}
                        <div className="bg-white rounded-[32px] p-7 shadow-sm border border-slate-200">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl"><Shield className="w-5 h-5" /></div>
                                <h3 className="text-xl font-black text-slate-900 tracking-tight">Documentación Legal</h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <DocManager label="SOAT" docType="SOAT" docs={legalDocs.filter(d => d.doc_type === 'SOAT')} entityId={params.id as string} entityType="vehicle" onRefresh={fetchData} />
                                <DocManager label="Tecnomecánica" docType="Tecno" docs={legalDocs.filter(d => d.doc_type === 'Tecno')} entityId={params.id as string} entityType="vehicle" onRefresh={fetchData} />
                                <DocManager label="Tarjeta de Operación" docType="Tarjeta de Operación" docs={legalDocs.filter(d => d.doc_type === 'Tarjeta de Operación')} entityId={params.id as string} entityType="vehicle" onRefresh={fetchData} />
                                <DocManager label="Póliza P.R.E. / P.R.C." docType="Póliza" docs={legalDocs.filter(d => d.doc_type === 'Póliza')} entityId={params.id as string} entityType="vehicle" onRefresh={fetchData} />
                            </div>
                        </div>

                        {/* Historial de Tanqueo */}
                        <div className="bg-white rounded-[32px] p-7 shadow-sm border border-slate-200">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl"><Fuel className="w-5 h-5" /></div>
                                    <h3 className="text-xl font-black text-slate-900 tracking-tight">Historial de Tanqueo</h3>
                                </div>
                                {fuelHistory.length > 0 && (
                                    <div className="flex gap-5">
                                        <div className="text-right"><p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Último Tanqueo</p><p className="font-black text-slate-800 text-sm">{new Date(fuelHistory[0].recorded_at).toLocaleDateString()}</p></div>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-3">
                                {fuelHistory.length > 0 ? fuelHistory.map((fuel) => (
                                    <div key={fuel.id} className="bg-slate-50/50 rounded-2xl p-5 border border-slate-100 hover:border-blue-100 transition-all">
                                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-blue-600 shadow-sm"><Fuel className="w-5 h-5" /></div>
                                                <div>
                                                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{new Date(fuel.recorded_at).toLocaleString()}</p>
                                                    <p className="font-black text-slate-900">{fuel.gallons} Galones · <span className="text-slate-500 font-bold text-sm">{fuel.station_name}</span></p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <div className="bg-white px-3 py-2 rounded-xl border border-slate-100 shadow-sm text-center"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Costo</p><p className="font-black text-slate-900 text-sm">${fuel.cost_total?.toLocaleString()}</p></div>
                                                <div className="bg-white px-3 py-2 rounded-xl border border-slate-100 shadow-sm text-center"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Km</p><p className="font-black text-slate-900 text-sm">{fuel.mileage?.toLocaleString()}</p></div>
                                                {fuel.photo_url && <a href={fuel.photo_url} target="_blank" rel="noopener noreferrer" className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700"><Camera className="w-4 h-4" /></a>}
                                            </div>
                                        </div>
                                    </div>
                                )) : <p className="text-slate-400 font-bold italic text-center py-8 border-2 border-dashed border-slate-100 rounded-2xl">No hay registros de combustible aún.</p>}
                            </div>
                        </div>

                        {/* Mantenimiento */}
                        <div id="maintenance-history" className="bg-white rounded-[32px] p-7 shadow-sm border border-slate-200">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl"><Hammer className="w-5 h-5" /></div>
                                    <h3 className="text-xl font-black text-slate-900 tracking-tight">Historial de Mantenimiento</h3>
                                </div>
                                <button onClick={() => setIsMaintModalOpen(true)} className="px-4 py-2 bg-amber-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-amber-700 transition-all shadow-lg shadow-amber-100 flex items-center gap-2">
                                    <Wrench className="w-3.5 h-3.5" /> Registrar
                                </button>
                            </div>
                            <div className="space-y-3">
                                {maintenanceHistory.length > 0 ? maintenanceHistory.map((m) => (
                                    <div key={m.id} className="bg-slate-50/50 rounded-2xl p-5 border border-slate-100 hover:border-amber-100 transition-all">
                                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-amber-600 shadow-sm"><Hammer className="w-5 h-5" /></div>
                                                <div>
                                                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{new Date(m.status_change_date).toLocaleDateString()}</p>
                                                    <p className="font-black text-slate-900">{m.activity_performed}</p>
                                                    <p className="text-amber-600 font-bold uppercase text-xs">En: {m.workshop_name}</p>
                                                </div>
                                            </div>
                                            {m.mileage_at_event && <div className="bg-white px-3 py-2 rounded-xl border border-slate-100 shadow-sm text-center"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Km</p><p className="font-black text-slate-900 text-sm">{m.mileage_at_event?.toLocaleString()}</p></div>}
                                        </div>
                                        {m.observations && <div className="mt-2 p-2.5 bg-white/50 rounded-xl border border-slate-50 text-xs font-bold text-slate-500 italic">"{m.observations}"</div>}
                                    </div>
                                )) : <p className="text-slate-400 font-bold italic text-center py-8 border-2 border-dashed border-slate-100 rounded-2xl">No hay registros de taller aún.</p>}
                            </div>
                        </div>

                        {/* Incidentes */}
                        <div id="incident-history" className="bg-white rounded-[32px] p-7 shadow-sm border border-slate-200">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl"><AlertOctagon className="w-5 h-5" /></div>
                                    <h3 className="text-xl font-black text-slate-900 tracking-tight">Incidentes y Accidentes</h3>
                                </div>
                                <button onClick={() => setIsIncidentModalOpen(true)} className="px-4 py-2 bg-rose-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-rose-700 transition-all shadow-lg shadow-rose-100 flex items-center gap-2">
                                    <AlertTriangle className="w-3.5 h-3.5" /> Reportar
                                </button>
                            </div>
                            <div className="space-y-3">
                                {incidentHistory.length > 0 ? incidentHistory.map((inc) => (
                                    <div key={inc.id} className="bg-rose-50/30 rounded-2xl p-5 border border-rose-100 hover:border-rose-200 transition-all">
                                        <div className="flex items-start gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-white border border-rose-100 flex items-center justify-center text-rose-600 shadow-sm shrink-0"><AlertOctagon className="w-5 h-5" /></div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{inc.event_date} | {inc.event_time}</p>
                                                    <span className="bg-rose-600 text-white text-[8px] font-black px-2 py-0.5 rounded uppercase">{inc.event_type}</span>
                                                </div>
                                                <p className="font-black text-slate-900">Afectación: {inc.component_affected || 'General'}</p>
                                                <p className="text-slate-500 font-bold uppercase text-[10px]">Conductor: {inc.users?.full_name}</p>
                                            </div>
                                        </div>
                                        {inc.observations && <div className="mt-2 p-2.5 bg-white/50 rounded-xl border border-rose-100 text-xs font-bold text-slate-600 italic">"{inc.observations}"</div>}
                                    </div>
                                )) : <p className="text-slate-400 font-bold italic text-center py-8 border-2 border-dashed border-rose-100/30 rounded-2xl">No hay reportes de incidentes.</p>}
                            </div>
                        </div>

                        {/* Historial de Eventos */}
                        <div className="bg-white rounded-[32px] p-7 shadow-sm border border-slate-200">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl"><Activity className="w-5 h-5" /></div>
                                <h3 className="text-xl font-black text-slate-900 tracking-tight">Historial de Eventos</h3>
                            </div>
                            <div className="space-y-5">
                                {history.length > 0 ? history.map((event) => (
                                    <div key={event.id} className="relative pl-7 border-l-2 border-slate-100 pb-5 last:pb-0">
                                        <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-4 border-white shadow-sm ${event.activity_type === 'start' ? 'bg-blue-500' : 'bg-rose-500'}`} />
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">{new Date(event.recorded_at).toLocaleString()}</p>
                                        <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 hover:border-blue-100 transition-all">
                                            <div className="flex justify-between items-start mb-1.5">
                                                <div>
                                                    <p className="font-black text-slate-800">{event.activity_type === 'start' ? 'Inicio de Recorrido' : 'Fin de Recorrido'}</p>
                                                    <p className="text-slate-500 font-bold uppercase tracking-tight text-xs">Conductor: {event.users?.full_name}</p>
                                                </div>
                                                <p className="font-black text-slate-900 bg-white px-3 py-1 rounded-lg border border-slate-100 shadow-sm text-sm">{event.odometer?.toLocaleString()} KM</p>
                                            </div>
                                            {event.activity_type === 'start' && event.verification && (
                                                <div className="pt-2.5 border-t border-slate-100/50 flex flex-col gap-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${event.verification.passed ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>{event.verification.passed ? 'Preoperacional OK' : 'Con Novedad'}</span>
                                                        <span className="text-[10px] font-bold text-slate-400 italic">Inspección Preoperacional</span>
                                                    </div>
                                                    {event.verification.comments && <div className="bg-white/50 p-2.5 rounded-xl border border-slate-50 text-xs font-bold text-slate-600 italic">"{event.verification.comments}"</div>}
                                                    <button onClick={() => { setSelectedPreop({ ...event.verification, users: event.users, recorded_at: event.recorded_at }); fetchPreopDetails(event.verification.id); }} className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800">
                                                        <Eye className="w-3 h-3" /> Ver desglose completo
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )) : <p className="text-slate-400 font-bold italic text-center py-8">No hay eventos registrados.</p>}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Pre-op Modal */}
                {selectedPreop && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                        <div className="bg-white rounded-[32px] w-full max-w-2xl shadow-2xl h-[85vh] flex flex-col">
                            <div className="p-7 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <div>
                                    <h3 className="text-xl font-black text-slate-900">Inspección Detallada</h3>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mt-1">
                                        <span className="bg-yellow-400 px-2 py-0.5 rounded text-[8px] border border-slate-900 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">{vehicle?.plate}</span>
                                        {selectedPreop.users?.full_name} • {selectedPreop.recorded_at ? new Date(selectedPreop.recorded_at).toLocaleDateString() : ''}
                                    </p>
                                </div>
                                <button onClick={() => setSelectedPreop(null)} className="p-2.5 text-slate-400 hover:bg-slate-100 rounded-xl"><X className="w-5 h-5" /></button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-7 space-y-3">
                                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                                    <p className="text-[10px] font-black uppercase text-slate-400 mb-1.5 tracking-widest">Comentarios</p>
                                    <p className="font-bold text-slate-700 italic">"{selectedPreop.comments || 'Sin comentarios'}"</p>
                                </div>
                                {loadingDetails ? <div className="flex justify-center py-10 opacity-30"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
                                    : (preopDetails || []).map((detail: any, idx: number) => (
                                        <div key={detail.id} className="flex items-center justify-between p-3.5 bg-white border border-slate-100 rounded-xl shadow-sm">
                                            <div className="flex items-center gap-3">
                                                <span className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400">{idx + 1}</span>
                                                <p className="font-bold text-sm text-slate-800">{detail.question_text}</p>
                                            </div>
                                            <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase border flex items-center gap-1.5 ${detail.answer === 'BIEN' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                                                {detail.answer === 'BIEN' ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />} {detail.answer}
                                            </div>
                                        </div>
                                    ))}
                            </div>
                            <div className="p-5 border-t border-slate-100">
                                <button onClick={() => setSelectedPreop(null)} className="w-full py-3.5 bg-slate-900 text-white rounded-[16px] font-black uppercase text-xs tracking-widest hover:bg-slate-800">Cerrar</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Maintenance Modal */}
                {isMaintModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                        <div className="bg-white rounded-[32px] w-full max-w-xl shadow-2xl p-8">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-black text-slate-900">Registrar Mantenimiento</h3>
                                <button onClick={() => setIsMaintModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl"><X /></button>
                            </div>
                            <div className="space-y-4">
                                <FormField label="Actividad Realizada" value={maintForm.activity_performed} onChange={(val: string) => setMaintForm({ ...maintForm, activity_performed: val })} placeholder="Ej: Cambio de Aceite, Alineación y Balanceo..." />
                                <FormField label="Taller Responsable" value={maintForm.workshop_name} onChange={(val: string) => setMaintForm({ ...maintForm, workshop_name: val })} placeholder="Nombre del taller" />
                                <FormField label="Kilometraje (opcional)" value={maintForm.mileage_at_event} onChange={(val: string) => setMaintForm({ ...maintForm, mileage_at_event: val })} placeholder="0" />
                                <FormField label="Fecha y Hora" type="datetime-local" value={maintForm.status_change_date} onChange={(val: string) => setMaintForm({ ...maintForm, status_change_date: val })} />
                                <FormField label="Observaciones" value={maintForm.observations} onChange={(val: string) => setMaintForm({ ...maintForm, observations: val })} placeholder="Detalles adicionales..." />
                                <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 text-[10px] font-bold text-amber-700">
                                    💡 <strong>"aceite"</strong> reinicia contador de aceite · <strong>"alineaci"</strong> o <strong>"balanceo"</strong> reinicia alineación
                                </div>
                                <button onClick={handleSaveMaintenance} className="w-full py-3.5 bg-amber-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-amber-700 transition-all shadow-xl shadow-amber-100">Guardar y Reiniciar Contador</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Incident Modal */}
                {isIncidentModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                        <div className="bg-white rounded-[32px] w-full max-w-xl shadow-2xl p-8">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-black text-slate-900">Reportar Incidente</h3>
                                <button onClick={() => setIsIncidentModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl"><X /></button>
                            </div>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField label="Fecha" type="date" value={incidentForm.event_date} onChange={(val: string) => setIncidentForm({ ...incidentForm, event_date: val })} />
                                    <FormField label="Hora" type="time" value={incidentForm.event_time} onChange={(val: string) => setIncidentForm({ ...incidentForm, event_time: val })} />
                                </div>
                                <FormField label="Tipo de Evento" type="select" options={['Accidente', 'Incidente', 'Falla Técnica', 'Avería']} value={incidentForm.event_type} onChange={(val: string) => setIncidentForm({ ...incidentForm, event_type: val })} />
                                <FormField label="Componente Afectado" value={incidentForm.component_affected} onChange={(val: string) => setIncidentForm({ ...incidentForm, component_affected: val })} placeholder="Ej: Parachoques, Motor..." />
                                <FormField label="Conductor Involucrado" type="select" options={['', ...drivers.map(d => d.id)]} value={incidentForm.driver_id} onChange={(val: string) => setIncidentForm({ ...incidentForm, driver_id: val })} />
                                <FormField label="Observaciones" value={incidentForm.observations} onChange={(val: string) => setIncidentForm({ ...incidentForm, observations: val })} placeholder="Describe lo ocurrido..." />
                                <button onClick={handleSaveIncident} className="w-full py-3.5 bg-rose-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-rose-700 transition-all shadow-xl shadow-rose-100">Reportar</button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

// ── Mini stat para la tarjeta compacta ──
function MiniStat({ label, value, color, dark, dim }: any) {
    const colors: any = { blue: 'bg-blue-500', rose: 'bg-rose-500', black: 'bg-white' };
    return (
        <div className={`p-2 rounded-xl border ${dark ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-white text-slate-900'} shadow-sm ${dim ? 'opacity-40' : ''}`}>
            <div className={`w-1 h-4 rounded-full mb-1 ${dark ? 'bg-white' : colors[color] || 'bg-slate-400'}`} />
            <p className="text-xs font-black leading-none">{typeof value === 'number' ? value.toLocaleString() : (value ?? '--')}</p>
            <p className="text-[8px] font-bold opacity-50 uppercase tracking-tighter mt-0.5">{label}</p>
        </div>
    );
}

// ── Service Alert compacto ──
function ServiceAlert({ icon, label, kmDone, interval, remaining, lastDate, onReset }: any) {
    const isOverdue = remaining <= 0;
    const isSoon = remaining > 0 && remaining <= 1000;
    const bgColor = isOverdue ? 'bg-rose-50 border-rose-200' : isSoon ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100';
    const textColor = isOverdue ? 'text-rose-600' : isSoon ? 'text-amber-600' : 'text-emerald-600';
    const iconColor = isOverdue ? 'text-rose-500' : isSoon ? 'text-amber-500' : 'text-emerald-500';
    const barColor = isOverdue ? 'bg-rose-500' : isSoon ? 'bg-amber-400' : 'bg-emerald-400';
    const progress = Math.min(100, Math.max(0, (kmDone / interval) * 100));

    return (
        <div className={`rounded-xl px-3 py-2 border ${bgColor}`}>
            <div className="flex items-center gap-1.5 mb-1">
                <div className={`${iconColor} shrink-0`}>{icon}</div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 flex-1">{label}</p>
                <span className={`text-[9px] font-black ${textColor} shrink-0`}>
                    {isOverdue ? `⚠️ +${Math.abs(remaining).toLocaleString()} km` : `Faltan ${remaining.toLocaleString()} km`}
                </span>
            </div>
            <div className="w-full h-1.5 bg-slate-200/60 rounded-full overflow-hidden mb-1">
                <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between items-center">
                <span className="text-[8px] font-bold text-slate-400">{kmDone.toLocaleString()} / {interval.toLocaleString()} km</span>
                <button onClick={onReset} className="flex items-center gap-1 text-[8px] font-black uppercase text-slate-300 hover:text-emerald-600 transition-colors">
                    <RotateCcw className="w-2.5 h-2.5" /> Fue al taller
                </button>
            </div>
        </div>
    );
}

function FormField({ label, value, readOnly, type = "text", options = [], onChange, placeholder, icon }: any) {
    return (
        <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">{label}</label>
            <div className="relative group">
                {icon && <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors">{icon}</div>}
                {type === 'select'
                    ? <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-[16px] font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all appearance-none">{options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}</select>
                    : <input type={type} value={value || ''} readOnly={readOnly} placeholder={placeholder} onChange={(e) => onChange && onChange(e.target.value)} className={`w-full ${icon ? 'pl-12' : 'px-5'} py-3 bg-slate-50 border border-slate-100 rounded-[16px] font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`} />
                }
            </div>
        </div>
    );
}

function DocManager({ label, docType, docs, entityId, entityType, onRefresh }: any) {
    const [uploading, setUploading] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [expDate, setExpDate] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const latestDoc = docs[0];

    const handleFileSelect = async (e: any) => {
        const file = e.target.files[0]; if (!file) return;
        setSelectedFile(file); setAnalyzing(true); setExpDate('');
        try {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64 = (reader.result as string).split(',')[1];
                const res = await fetch('/api/analyze-doc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: base64, docType }) });
                const data = await res.json();
                if (data.expiration_date) setExpDate(data.expiration_date);
                else alert('No se pudo extraer la fecha.');
            };
        } catch { console.error('Error analyzing'); } finally { setAnalyzing(false); }
    };

    const handleUpload = async () => {
        if (!selectedFile || !expDate) { alert('Selecciona archivo y fecha.'); return; }
        setUploading(true);
        try {
            const file = selectedFile;
            const safeDocType = docType.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '_');
            const filePath = `manual_docs/${entityId}_${safeDocType}_${Date.now()}.${file.name.split('.').pop()}`;
            const { error: uploadError } = await supabase.storage.from('fleet_photos').upload(filePath, file, { upsert: true, contentType: file.type });
            if (uploadError) throw new Error(`Storage: ${uploadError.message}`);
            const { data: { publicUrl } } = supabase.storage.from('fleet_photos').getPublicUrl(filePath);
            const { error: dbError } = await supabase.from('legal_documents').insert({ entity_type: entityType, entity_id: entityId, doc_type: docType, expiration_date: expDate, file_url: publicUrl, metadata: { source: 'dashboard_manual_upload', uploaded_at: new Date().toISOString(), original_name: file.name } });
            if (dbError) throw new Error(`DB: ${dbError.message}`);
            alert('✅ Documento cargado.'); setExpDate(''); onRefresh();
        } catch (err: any) { alert(`Error: ${err.message}`); } finally { setUploading(false); }
    };

    const handleDelete = async (docId: string, fileUrl?: string) => {
        if (!confirm('¿Eliminar este documento?')) return;
        try {
            if (fileUrl) { const p = fileUrl.split('/storage/v1/object/public/fleet_photos/'); if (p.length > 1) await supabase.storage.from('fleet_photos').remove([decodeURIComponent(p[1])]); }
            const { error } = await supabase.from('legal_documents').delete().eq('id', docId);
            if (error) throw error;
            alert('✅ Eliminado.'); onRefresh();
        } catch (err: any) { alert(`Error: ${err.message}`); }
    };

    const getStatus = (date: string) => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const diff = Math.ceil((new Date(date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diff < 0) return { label: 'Vencido', color: 'text-rose-600 bg-rose-50 border-rose-100' };
        if (diff <= 30) return { label: 'Vence Pronto', color: 'text-amber-600 bg-amber-50 border-amber-100' };
        return { label: 'Al día', color: 'text-emerald-600 bg-emerald-50 border-emerald-100' };
    };

    return (
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex justify-between items-center">
                <h4 className="font-black text-slate-900 uppercase tracking-tight text-sm">{label}</h4>
                {latestDoc && <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${getStatus(latestDoc.expiration_date).color}`}>{getStatus(latestDoc.expiration_date).label}</span>}
            </div>
            {latestDoc ? (
                <div className="bg-white p-3.5 rounded-xl border border-slate-100 flex items-center justify-between">
                    <div><p className="text-[10px] font-black uppercase text-slate-400 mb-0.5">Vencimiento</p><p className="font-black text-slate-800 flex items-center gap-2 text-sm"><Calendar className="w-3.5 h-3.5 text-blue-500" />{latestDoc.expiration_date}</p></div>
                    <div className="flex gap-2">
                        <a href={latestDoc.file_url} target="_blank" rel="noopener noreferrer" className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all"><ExternalLink className="w-4 h-4" /></a>
                        <button onClick={() => handleDelete(latestDoc.id, latestDoc.file_url)} className="p-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-600 hover:text-white transition-all"><Trash2 className="w-4 h-4" /></button>
                    </div>
                </div>
            ) : (
                <div className="bg-white/50 p-3.5 rounded-xl border border-dashed border-slate-200 text-center">
                    <AlertTriangle className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                    <p className="text-xs font-bold text-slate-400 italic">Sin documento</p>
                </div>
            )}
            <div className="space-y-2 pt-2 border-t border-slate-200/50">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Carga Manual {analyzing && <span className="ml-1 text-blue-500 animate-pulse">Analizando...</span>}</p>
                <input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 text-xs focus:outline-none" />
                <div className="flex gap-2">
                    <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-slate-50 cursor-pointer shadow-sm">
                        <Upload className="w-3.5 h-3.5" /> Seleccionar
                        <input type="file" className="hidden" onChange={handleFileSelect} accept="image/*,application/pdf" />
                    </label>
                    <button onClick={handleUpload} disabled={uploading || !expDate || !selectedFile} className="flex-1 py-2 bg-slate-900 text-white rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-slate-800 disabled:opacity-50 shadow-md">
                        {uploading ? 'Cargando...' : 'Subir'}
                    </button>
                </div>
            </div>
        </div>
    );
}