'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { supabase } from '@/lib/supabase';
import { Car, Plus, Search, MapPin, Activity, Calendar, LayoutGrid, TableProperties, ArrowRight, User, Bell, X, CheckCircle2, Trash2, Download } from 'lucide-react';
import { useCompany, exportToCsv } from '@/lib/company';

export default function VehiclesPage() {
    const { companyId, loading: companyLoading } = useCompany();
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = today.toISOString().split('T')[0];

    const [startDate, setStartDate] = useState(firstDay);
    const [endDate, setEndDate] = useState(lastDay);

    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
    const [loading, setLoading] = useState(true);
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [newVehicle, setNewVehicle] = useState({
        plate: '',
        brand: '',
        line: '',
        model: '',
        location: '',
        current_odometer: 0,
        image_url: ''
    });

    useEffect(() => {
        if (companyId) fetchVehiclesWithStats();
    }, [startDate, endDate, companyId]);

    async function fetchVehiclesWithStats() {
        if (!companyId) return;
        setLoading(true);
        const { data: vData } = await supabase.from('vehicles').select('*').eq('company_id', companyId);
        const { data: aData } = await supabase
            .from('driver_assignments')
            .select('vehicle_id, driver_id, users(id, full_name)')
            .eq('company_id', companyId)
            .eq('role', 'principal')
            .eq('is_active', true);

        if (!vData) { setLoading(false); return; }

        const now = new Date();

        // Week start (Sunday)
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);

        // Month start
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        // Today start
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);

        // Fetch last 30 days for weekly/monthly stats
        const { data: allRecentData } = await supabase
            .from('route_records')
            .select('*')
            .eq('company_id', companyId)
            .gte('recorded_at', monthStart.toISOString())
            .order('recorded_at', { ascending: true })
            .limit(2000);

        const startRange = `${startDate}T00:00:00Z`;
        const endRange = `${endDate}T23:59:59Z`;
        const { data: rData } = await supabase
            .from('route_records')
            .select('*')
            .eq('company_id', companyId)
            .gte('recorded_at', startRange)
            .lte('recorded_at', endRange)
            .order('recorded_at', { ascending: true });


        // calcPeriod: first 'start' record = inicio, last 'end' record = fin
        // If only inicio registered (no 'end' yet) → fin='--', recorrido='--'
        // If both → all three shown correctly
        const calcPeriod = (records: any[]) => {
            if (!records || records.length === 0) return { kmStart: null, kmEnd: null, kmTotal: null };
            const startRecs = records.filter((r: any) => r.activity_type === 'start');
            const endRecs = records.filter((r: any) => r.activity_type === 'end');
            const kmStart = startRecs.length > 0 ? startRecs[0].odometer : null;
            const kmEnd = endRecs.length > 0 ? endRecs[endRecs.length - 1].odometer : null;
            const kmTotal = kmStart !== null && kmEnd !== null ? kmEnd - kmStart : null;
            return { kmStart, kmEnd, kmTotal };
        };

        const processed = vData.map((v: any) => {
            const assignment = aData?.find((a: any) => a.vehicle_id === v.id);
            const currentDriver = assignment?.users ? (assignment.users as any).full_name : v.main_driver;
            const driverId = (assignment as any)?.driver_id || null;

            // Period records for the date-range selector (table summary)
            const periodRecords = (rData || []).filter((r: any) => r.vehicle_id === v.id);
            const { kmStart: periodStart, kmEnd: periodEnd, kmTotal: periodTotal } = calcPeriod(periodRecords);

            // All recent records for this vehicle (sorted asc, from month start)
            const recentRecords = (allRecentData || []).filter((r: any) => r.vehicle_id === v.id);

            // Today
            const todayRecs = recentRecords.filter((r: any) => new Date(r.recorded_at) >= todayStart);
            const { kmStart: dayStartKm, kmEnd: dayEndKm, kmTotal: dayTotal } = calcPeriod(todayRecs);

            // Week
            const weekRecs = recentRecords.filter((r: any) => new Date(r.recorded_at) >= weekStart);
            const { kmStart: weekStartKm, kmEnd: weekEndKm, kmTotal: weekTotal } = calcPeriod(weekRecs);

            // Month (recentRecords already start from monthStart in the query)
            const { kmStart: monthStartKm, kmEnd: monthEndKm, kmTotal: monthTotal } = calcPeriod(recentRecords);

            return {
                ...v,
                main_driver: currentDriver,
                driverId,
                dayStart: periodStart,
                dayEnd: periodEnd,
                dayTotal: periodTotal,
                todayStart: dayStartKm,
                todayEnd: dayEndKm,
                todayTotal: dayTotal,
                weekStart: weekStartKm,
                weekEnd: weekEndKm,
                weekTotal,
                monthStart: monthStartKm,
                monthEnd: monthEndKm,
                monthTotal,
            };
        });

        setVehicles(processed);
        setLoading(false);
    }

    async function handleAddVehicle(e: React.FormEvent) {
        e.preventDefault();
        if (!newVehicle.plate) { alert('La placa es obligatoria.'); return; }
        setSaving(true);
        try {
            const { error } = await supabase.from('vehicles').insert([{
                ...newVehicle,
                plate: newVehicle.plate.toUpperCase(),
                status: 'Activo',
                company_id: companyId
            }]);
            if (error) throw error;
            alert('¡Vehículo agregado correctamente!');
            setIsAddModalOpen(false);
            setNewVehicle({ plate: '', brand: '', line: '', model: '', location: '', current_odometer: 0, image_url: '' });
            fetchVehiclesWithStats();
        } catch (err: any) {
            alert(`Error al agregar vehículo: ${err.message}`);
        } finally {
            setSaving(false);
        }
    }

    async function handleDeleteVehicle(vehicleId: string, plate: string) {
        if (!confirm(`¿Eliminar el vehículo ${plate} y todos sus datos asociados? Esta acción no se puede deshacer.`)) return;
        try {
            const { data: verifications } = await supabase.from('verifications').select('id').eq('vehicle_id', vehicleId);
            if (verifications && verifications.length > 0) {
                const verificationIds = verifications.map((v: any) => v.id);
                await supabase.from('verification_details').delete().in('verification_id', verificationIds);
            }
            await supabase.from('verifications').delete().eq('vehicle_id', vehicleId);
            await supabase.from('route_records').delete().eq('vehicle_id', vehicleId);
            await supabase.from('legal_documents').delete().eq('entity_id', vehicleId).eq('entity_type', 'vehicle');
            await supabase.from('driver_assignments').delete().eq('vehicle_id', vehicleId);
            const { error } = await supabase.from('vehicles').delete().eq('id', vehicleId);
            if (error) throw error;
            alert(`✅ Vehículo ${plate} eliminado correctamente.`);
            fetchVehiclesWithStats();
        } catch (err: any) {
            alert(`Error al eliminar: ${err.message}`);
        }
    }

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    async function handleNotify(driverId: string, driverName: string, plate: string) {
        if (!driverId) { alert('Este vehículo no tiene un conductor activo vinculado para notificar.'); return; }
        if (!confirm(`¿Enviar recordatorio a ${driverName} para que registre su recorrido?`)) return;
        try {
            const res = await fetch('/api/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ driverId, message: `Hola ${driverName}! No veo tu registro de hoy en el vehículo ${plate}. ¿Podrías actualizarlo por favor?` })
            });
            const data = await res.json();
            if (res.ok) alert(`✅ Notificación enviada a ${driverName}`);
            else alert(`❌ Error: ${data?.error || 'No se pudo enviar la notificación'}`);
        } catch {
            alert('Error al conectar con el servicio de notificaciones.');
        }
    }

    const sortedVehicles = [...vehicles].sort((a, b) => {
        if (!sortConfig) return 0;
        const { key, direction } = sortConfig;
        let valA = a[key], valB = b[key];
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        if (typeof valA === 'string') { valA = valA.toLowerCase(); valB = valB.toLowerCase(); }
        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
    });

    const filteredVehicles = sortedVehicles.filter(v =>
        v.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.main_driver?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.location?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totals = filteredVehicles.reduce((acc, v) => ({
        distance: acc.distance + (v.dayTotal || 0),
        count: v.dayTotal !== null ? acc.count + 1 : acc.count
    }), { distance: 0, count: 0 });

    const averageDist = totals.count > 0 ? (totals.distance / totals.count).toFixed(1) : '0';

    return (
        <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-4 md:p-12">
                <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <h2 className="text-4xl font-black text-slate-900 tracking-tight leading-none mb-3">Inventario de Flota</h2>
                        <div className="flex flex-col md:flex-row md:items-center gap-4 text-slate-500">
                            <p className="font-bold text-lg">Gestiona y monitorea todos los vehículos</p>
                            <div className="hidden md:block h-4 w-px bg-slate-200" />
                            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                                <Calendar className="w-4 h-4 text-blue-600" />
                                <div className="flex items-center gap-2">
                                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent border-none outline-none font-black text-xs uppercase tracking-tight text-slate-700 w-24" />
                                    <span className="text-slate-300">/</span>
                                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent border-none outline-none font-black text-xs uppercase tracking-tight text-slate-700 w-24" />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="bg-slate-100 p-1.5 rounded-2xl flex gap-1 border border-slate-200">
                            <button onClick={() => setViewMode('cards')} className={`p-3 rounded-xl transition-all ${viewMode === 'cards' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                                <LayoutGrid className="w-5 h-5" />
                            </button>
                            <button onClick={() => setViewMode('table')} className={`p-3 rounded-xl transition-all ${viewMode === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                                <TableProperties className="w-5 h-5" />
                            </button>
                        </div>
                        <button
                            onClick={() => exportToCsv('vehiculos', vehicles.map(v => ({
                                placa: v.plate,
                                marca: v.brand || '',
                                linea: v.line || '',
                                modelo: v.model || '',
                                estado: v.status || '',
                                conductor_principal: v.main_driver || '',
                                ubicacion: v.location || '',
                                odometro_actual: v.current_odometer || 0,
                            })))}
                            className="flex items-center gap-2 px-6 py-4 bg-white border border-slate-200 text-slate-600 rounded-[24px] font-black uppercase text-xs tracking-widest hover:bg-slate-50 transition-all shadow-sm"
                        >
                            <Download className="w-4 h-4" /> Exportar CSV
                        </button>
                        <button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-[24px] font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 active:scale-95">
                            <Plus className="w-5 h-5" /> Agregar Vehículo
                        </button>
                    </div>
                </header>

                <div className="mb-12 relative max-w-xl">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 w-6 h-6" />
                    <input
                        type="text"
                        placeholder="Buscar por placa, marca o conductor..."
                        className="w-full pl-16 pr-8 py-5 bg-white border border-slate-200 rounded-[28px] shadow-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-slate-700 placeholder:text-slate-300"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 grayscale opacity-50">
                        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="font-black uppercase tracking-widest text-xs">Cargando Datos...</p>
                    </div>
                ) : viewMode === 'cards' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-10">
                        {filteredVehicles.map((vehicle) => (
                            <VehicleCard key={vehicle.id} vehicle={vehicle} onNotify={handleNotify} onDelete={handleDeleteVehicle} />
                        ))}
                    </div>
                ) : (
                    <VehicleTable vehicles={filteredVehicles} totals={totals} average={averageDist} requestSort={requestSort} sortConfig={sortConfig} onNotify={handleNotify} onDelete={handleDeleteVehicle} />
                )}
            </main>

            {/* Add Vehicle Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-[40px] w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-100">
                        <div className="bg-slate-900 p-8 flex justify-between items-center text-white">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-blue-500 rounded-2xl"><Car className="w-6 h-6 text-white" /></div>
                                <div>
                                    <h3 className="text-2xl font-black tracking-tight">Nuevo Vehículo</h3>
                                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Registra una nueva unidad en la flota</p>
                                </div>
                            </div>
                            <button onClick={() => setIsAddModalOpen(false)} className="p-3 hover:bg-white/10 rounded-2xl transition-all"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleAddVehicle} className="p-10 space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {[
                                    { label: 'Placa (Obligatorio)', key: 'plate', placeholder: 'ABC123', upper: true },
                                    { label: 'Lugar de Circulación', key: 'location', placeholder: 'Ej: Bogotá' },
                                    { label: 'Marca / Constructor', key: 'brand', placeholder: 'Toyota, Renault...' },
                                    { label: 'Referencia / Línea', key: 'line', placeholder: 'Prado, Duster...' },
                                    { label: 'Modelo (Año)', key: 'model', placeholder: '2024' },
                                ].map(({ label, key, placeholder, upper }) => (
                                    <div key={key} className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">{label}</label>
                                        <input
                                            type="text"
                                            placeholder={placeholder}
                                            className={`w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all ${upper ? 'uppercase' : ''}`}
                                            value={(newVehicle as any)[key]}
                                            onChange={(e) => setNewVehicle({ ...newVehicle, [key]: e.target.value })}
                                        />
                                    </div>
                                ))}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Odómetro Inicial (KM)</label>
                                    <input type="number" className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all" value={newVehicle.current_odometer} onChange={(e) => setNewVehicle({ ...newVehicle, current_odometer: parseInt(e.target.value) || 0 })} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">URL de Imagen (Opcional)</label>
                                <input type="text" placeholder="https://..." className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all" value={newVehicle.image_url} onChange={(e) => setNewVehicle({ ...newVehicle, image_url: e.target.value })} />
                            </div>
                            <div className="pt-6 flex gap-4">
                                <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 py-5 bg-slate-100 text-slate-500 rounded-[24px] font-black uppercase text-xs tracking-widest hover:bg-slate-200 transition-all">Cancelar</button>
                                <button type="submit" disabled={saving} className="flex-1 py-5 bg-blue-600 text-white rounded-[24px] font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 disabled:opacity-50 flex items-center justify-center gap-2">
                                    {saving ? 'Guardando...' : <><CheckCircle2 className="w-5 h-5" /> Crear Vehículo</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

function VehicleCard({ vehicle, onNotify, onDelete }: {
    vehicle: any,
    onNotify: (id: string, name: string, plate: string) => void,
    onDelete: (id: string, plate: string) => void
}) {
    return (
        <div className="bg-[#f2f4f7] rounded-[36px] p-5 shadow-sm hover:shadow-2xl transition-all duration-700 border border-white relative overflow-hidden group">
            <div className="absolute -top-32 -right-32 w-80 h-80 bg-blue-400/10 blur-[100px] rounded-full group-hover:scale-110 transition-transform" />

            {/* Top row: plate + status + delete */}
            <div className="flex justify-between items-center mb-4 relative">
                <div className="bg-yellow-400 px-3 py-1.5 rounded-xl border-[2.5px] border-slate-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                    <span className="font-black text-slate-900 text-xs tracking-[0.1em] uppercase">{vehicle.plate}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black tracking-widest uppercase border ${vehicle.status === 'Activo' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-rose-100 text-rose-700 border-rose-200'}`}>
                        {vehicle.status || 'Activo'}
                    </span>
                    <button onClick={(e) => { e.preventDefault(); onDelete(vehicle.id, vehicle.plate); }} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all" title="Eliminar vehículo">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Brand + model */}
            <div className="mb-3 relative">
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mb-0.5">{vehicle.brand}</p>
                <h3 className="text-xl font-black text-slate-900 leading-none truncate">{vehicle.line || 'SUV'}</h3>
                <p className="text-slate-500 font-bold text-xs mt-1">{vehicle.model || '2021'}</p>
            </div>

            {/* Driver row */}
            <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-full bg-white border border-slate-100 flex items-center justify-center text-slate-400 shadow-sm relative shrink-0">
                    <User className="w-3.5 h-3.5" />
                    {vehicle.driverId && (
                        <button onClick={(e) => { e.preventDefault(); onNotify(vehicle.driverId, vehicle.main_driver, vehicle.plate); }} className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 text-white rounded-full flex items-center justify-center border border-white hover:bg-blue-700 transition-colors shadow-sm" title="Notificar Conductor">
                            <Bell className="w-2 h-2" />
                        </button>
                    )}
                </div>
                <div>
                    <p className="font-black text-slate-800 text-sm leading-tight">{vehicle.main_driver || 'Sin Conductor'}</p>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-tighter">{vehicle.location || 'N/A'}</p>
                </div>
            </div>

            {/* Vehicle image */}
            <div className="relative h-24 mb-3 flex items-center justify-center">
                {vehicle.image_url ? (
                    <img src={vehicle.image_url} alt={vehicle.plate} className="h-full object-contain group-hover:scale-110 transition-transform duration-1000 rotate-2 group-hover:rotate-0" />
                ) : (
                    <div className="bg-white/50 p-5 rounded-[24px] border border-dashed border-slate-300 text-slate-200">
                        <Car className="w-12 h-12" />
                    </div>
                )}
            </div>

            {/* ── Ultra-flat 9-stat grid ── */}
            <div className="pt-3 border-t border-slate-200/50">
                {/* Column headers */}
                <div className="grid grid-cols-4 gap-1 mb-1 px-0.5">
                    <div />
                    <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest text-center">Inicio</p>
                    <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest text-center">Km</p>
                    <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest text-center">Fin</p>
                </div>

                {/* Hoy */}
                <div className="grid grid-cols-4 gap-1 mb-1">
                    <div className="flex items-center gap-1 bg-blue-100 rounded-lg px-1.5 py-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                        <span className="text-[7px] font-black text-blue-700 uppercase leading-none">Hoy</span>
                    </div>
                    <div className="bg-white border border-slate-100 rounded-lg py-1.5 flex items-center justify-center shadow-sm">
                        <span className="text-[8px] font-black text-slate-700 leading-none">{vehicle.todayStart?.toLocaleString() ?? '--'}</span>
                    </div>
                    <div className="bg-black rounded-lg py-1.5 flex items-center justify-center shadow-sm">
                        <span className="text-[8px] font-black text-white leading-none">{vehicle.todayTotal?.toLocaleString() ?? '--'}</span>
                    </div>
                    <div className="bg-white border border-slate-100 rounded-lg py-1.5 flex items-center justify-center shadow-sm">
                        <span className="text-[8px] font-black text-slate-700 leading-none">{vehicle.todayEnd?.toLocaleString() ?? '--'}</span>
                    </div>
                </div>

                {/* Semana */}
                <div className="grid grid-cols-4 gap-1 mb-1">
                    <div className="flex items-center gap-1 bg-violet-100 rounded-lg px-1.5 py-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                        <span className="text-[7px] font-black text-violet-700 uppercase leading-none">Sem</span>
                    </div>
                    <div className="bg-white border border-slate-100 rounded-lg py-1.5 flex items-center justify-center shadow-sm">
                        <span className="text-[8px] font-black text-slate-700 leading-none">{vehicle.weekStart?.toLocaleString() ?? '--'}</span>
                    </div>
                    <div className="bg-violet-700 rounded-lg py-1.5 flex items-center justify-center shadow-sm">
                        <span className="text-[8px] font-black text-white leading-none">{vehicle.weekTotal?.toLocaleString() ?? '--'}</span>
                    </div>
                    <div className="bg-white border border-slate-100 rounded-lg py-1.5 flex items-center justify-center shadow-sm">
                        <span className="text-[8px] font-black text-slate-700 leading-none">{vehicle.weekEnd?.toLocaleString() ?? '--'}</span>
                    </div>
                </div>

                {/* Mes */}
                <div className="grid grid-cols-4 gap-1">
                    <div className="flex items-center gap-1 bg-emerald-100 rounded-lg px-1.5 py-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        <span className="text-[7px] font-black text-emerald-700 uppercase leading-none">Mes</span>
                    </div>
                    <div className="bg-white border border-slate-100 rounded-lg py-1.5 flex items-center justify-center shadow-sm">
                        <span className="text-[8px] font-black text-slate-700 leading-none">{vehicle.monthStart?.toLocaleString() ?? '--'}</span>
                    </div>
                    <div className="bg-emerald-700 rounded-lg py-1.5 flex items-center justify-center shadow-sm">
                        <span className="text-[8px] font-black text-white leading-none">{vehicle.monthTotal?.toLocaleString() ?? '--'}</span>
                    </div>
                    <div className="bg-white border border-slate-100 rounded-lg py-1.5 flex items-center justify-center shadow-sm">
                        <span className="text-[8px] font-black text-slate-700 leading-none">{vehicle.monthEnd?.toLocaleString() ?? '--'}</span>
                    </div>
                </div>
            </div>

            <Link href={`/vehicles/${vehicle.id}`} className="block mt-3">
                <button className="w-full py-2.5 bg-white hover:bg-slate-900 hover:text-white text-slate-600 font-black uppercase text-[9px] tracking-[0.4em] rounded-[16px] transition-all border border-slate-100 shadow-sm active:scale-95 flex items-center justify-center gap-2">
                    Más Detalles <ArrowRight className="w-3.5 h-3.5" />
                </button>
            </Link>
        </div>
    );
}

function VehicleTable({ vehicles, totals, average, requestSort, sortConfig, onNotify, onDelete }: {
    vehicles: any[],
    totals: any,
    average: any,
    requestSort: any,
    sortConfig: any,
    onNotify: (id: string, name: string, plate: string) => void,
    onDelete: (id: string, plate: string) => void
}) {
    const renderSortIcon = (key: string) => {
        if (sortConfig?.key !== key) return <Activity className="w-3 h-3 opacity-20" />;
        return <Activity className={`w-3 h-3 ${sortConfig.direction === 'asc' ? 'rotate-180' : ''} text-blue-600`} />;
    };

    return (
        <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full max-h-[800px]">
            <div className="flex-1 overflow-auto">
                <table className="w-full text-left font-sans border-collapse">
                    <thead className="bg-[#fbfeff] text-slate-400 text-[10px] font-black uppercase tracking-[2px] sticky top-0 z-10">
                        <tr>
                            <th className="px-10 py-6 bg-[#fbfeff] border-b border-slate-100 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => requestSort('plate')}>
                                <div className="flex items-center gap-2">Vehículo {renderSortIcon('plate')}</div>
                            </th>
                            <th className="px-10 py-6 bg-[#fbfeff] border-b border-slate-100 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => requestSort('main_driver')}>
                                <div className="flex items-center gap-2">Conductor {renderSortIcon('main_driver')}</div>
                            </th>
                            <th className="px-10 py-6 bg-[#fbfeff] border-b border-slate-100 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => requestSort('status')}>
                                <div className="flex items-center gap-2">Estado {renderSortIcon('status')}</div>
                            </th>
                            <th className="px-10 py-6 bg-[#fbfeff] border-b border-slate-100">Km Inicio</th>
                            <th className="px-10 py-6 bg-[#fbfeff] border-b border-slate-100">Km Fin</th>
                            <th className="px-10 py-6 bg-[#fbfeff] border-b border-slate-100 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => requestSort('dayTotal')}>
                                <div className="flex items-center gap-2">Distancia {renderSortIcon('dayTotal')}</div>
                            </th>
                            <th className="px-10 py-6 bg-[#fbfeff] border-b border-slate-100">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {vehicles.map((v: any) => (
                            <tr key={v.id} className="hover:bg-slate-50/50 transition-colors group">
                                <td className="px-10 py-6">
                                    <div className="flex items-center gap-4">
                                        <div className="bg-yellow-400 px-3 py-1.5 rounded-xl border-[2.5px] border-slate-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] font-black text-[11px] tracking-widest leading-none">{v.plate}</div>
                                        <div className="flex flex-col">
                                            <span className="font-black text-slate-800 tracking-tight">{v.brand} {v.line}</span>
                                            <span className="text-[10px] text-slate-400 font-bold uppercase">{v.model}</span>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-10 py-6 text-slate-700 font-bold">{v.main_driver || 'Sin Asignar'}</td>
                                <td className="px-10 py-6">
                                    <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${v.status === 'Activo' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{v.status}</span>
                                </td>
                                <td className="px-10 py-6 text-slate-500 font-black">{v.dayStart?.toLocaleString() || '--'}</td>
                                <td className="px-10 py-6 text-slate-500 font-black">{v.dayEnd?.toLocaleString() || '--'}</td>
                                <td className="px-10 py-6">
                                    <span className={`font-black ${v.dayTotal !== null ? 'text-blue-600' : 'text-slate-300'}`}>
                                        {v.dayTotal !== null ? `${v.dayTotal.toLocaleString()} km` : '--'}
                                    </span>
                                </td>
                                <td className="px-10 py-6">
                                    <div className="flex items-center gap-3">
                                        {v.driverId && (
                                            <button onClick={() => onNotify(v.driverId, v.main_driver, v.plate)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all" title="Notificar Conductor">
                                                <Bell className="w-5 h-5" />
                                            </button>
                                        )}
                                        <Link href={`/vehicles/${v.id}`} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all">
                                            <ArrowRight className="w-5 h-5" />
                                        </Link>
                                        <button onClick={() => onDelete(v.id, v.plate)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all" title="Eliminar vehículo">
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="bg-slate-900 text-white p-8 grid grid-cols-3 gap-10">
                <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-1">Recorrido Total (Periodo)</span>
                    <span className="text-3xl font-black text-white">{totals.distance.toLocaleString()} <span className="text-xl text-blue-400">km</span></span>
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-1">Vehículos Activos</span>
                    <span className="text-3xl font-black text-white">{totals.count}</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-1">Promedio por Vehículo</span>
                    <span className="text-3xl font-black text-blue-400">{average} <span className="text-xl text-white">km</span></span>
                </div>
            </div>
        </div>
    );
}