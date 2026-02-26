'use client';

import { useEffect, useState, useMemo } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { supabase } from '@/lib/supabase';
import { ChevronLeft, ChevronRight, X, Truck, TrendingUp, Route, Calendar } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────
interface Trip {
    date: string;
    startKm: number;
    endKm: number;
    distKm: number;
    startTime: string;
    endTime: string;
    driver: string;
}
interface DayData {
    date: string;
    trips: Trip[];
    totalKm: number;
    startKm: number | null;
    endKm: number | null;
    inRoute: boolean; // start without matching end = currently on route
}
interface VehicleRow {
    id: string;
    plate: string;
    brand: string;
    line: string;
    model: string;
    imageUrl: string;
    driverName: string;
    days: Record<string, DayData>;
    monthTotal: number;
    monthTrips: number;
}

// ─── Helpers ──────────────────────────────────────────────────
const fmtKm = (n: number) => n.toLocaleString('es-CO');
const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
const dayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function getDaysInMonth(year: number, month: number): Date[] {
    const days: Date[] = [];
    const d = new Date(year, month, 1);
    while (d.getMonth() === month) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
    return days;
}

// Light-theme color scale based on km intensity
function kmColor(km: number, max: number) {
    if (km === 0 || max === 0) return {
        bg: 'bg-slate-100',
        border: 'border-slate-200',
        text: 'text-slate-400',
        pill: 'bg-slate-100 text-slate-400',
    };
    const r = km / max;
    if (r < 0.25) return { bg: 'bg-blue-100', border: 'border-blue-200', text: 'text-blue-600', pill: 'bg-blue-100 text-blue-600' };
    if (r < 0.55) return { bg: 'bg-blue-300', border: 'border-blue-400', text: 'text-blue-800', pill: 'bg-blue-200 text-blue-800' };
    if (r < 0.80) return { bg: 'bg-blue-500', border: 'border-blue-600', text: 'text-white', pill: 'bg-blue-500 text-white' };
    return { bg: 'bg-blue-700', border: 'border-blue-800', text: 'text-white', pill: 'bg-blue-700 text-white' };
}

// Fixed widths — must match between header row and data rows
const IDENTITY_W = 140; // px — vehicle name col
const SUMMARY_W = 64;  // px — month summary col
const CELL_W = 22;  // px — each day cell
const GAP = 2;   // px — gap between cells

// ─── Page ─────────────────────────────────────────────────────
export default function TripsPage() {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth());
    const [loading, setLoading] = useState(true);
    const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
    const [selected, setSelected] = useState<{ vehicle: VehicleRow; day: DayData } | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const days = useMemo(() => getDaysInMonth(year, month), [year, month]);

    useEffect(() => { fetchData(); }, [year, month]);

    async function fetchData() {
        setLoading(true);
        try {
            const monthStart = new Date(year, month, 1, 0, 0, 0, 0);
            const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

            const [{ data: vData }, { data: aData }, { data: rData }] = await Promise.all([
                supabase.from('vehicles').select('*').order('plate'),
                supabase.from('driver_assignments')
                    .select('vehicle_id, users(full_name)')
                    .eq('role', 'principal').eq('is_active', true),
                supabase.from('route_records')
                    .select('*, users:driver_id(full_name)')
                    .gte('recorded_at', monthStart.toISOString())
                    .lte('recorded_at', monthEnd.toISOString())
                    .order('recorded_at', { ascending: true })
                    .limit(10000),
            ]);

            if (!vData) { setLoading(false); return; }
            const allRecs = rData || [];

            const rows: VehicleRow[] = vData.map(v => {
                const assignment = aData?.find((a: any) => a.vehicle_id === v.id);
                const driverName = assignment?.users
                    ? (assignment.users as any).full_name
                    : (v.main_driver || 'Sin conductor');

                const vRecs = allRecs.filter((r: any) => r.vehicle_id === v.id);
                const dayMap: Record<string, any[]> = {};
                vRecs.forEach((r: any) => {
                    const k = dayKey(new Date(r.recorded_at));
                    if (!dayMap[k]) dayMap[k] = [];
                    dayMap[k].push(r);
                });

                const daysData: Record<string, DayData> = {};
                Object.entries(dayMap).forEach(([date, recs]) => {
                    const starts = recs.filter((r: any) => r.activity_type === 'start');
                    const ends = recs.filter((r: any) => r.activity_type === 'end');
                    const usedEnds = new Set<string>();
                    const trips: Trip[] = [];

                    starts.forEach((s: any) => {
                        const match = ends.find((e: any) =>
                            new Date(e.recorded_at) > new Date(s.recorded_at) &&
                            !usedEnds.has(e.recorded_at)
                        );
                        if (match) {
                            usedEnds.add(match.recorded_at);
                            const dist = match.odometer - s.odometer;
                            if (dist > 0) {
                                trips.push({
                                    date,
                                    startKm: s.odometer,
                                    endKm: match.odometer,
                                    distKm: dist,
                                    startTime: fmtTime(s.recorded_at),
                                    endTime: fmtTime(match.recorded_at),
                                    driver: s.users?.full_name || driverName,
                                });
                            }
                        }
                    });

                    daysData[date] = {
                        date, trips,
                        totalKm: trips.reduce((s, t) => s + t.distKm, 0),
                        startKm: starts[0]?.odometer ?? null,
                        endKm: ends[ends.length - 1]?.odometer ?? null,
                        inRoute: starts.length > usedEnds.size,
                    };
                });

                return {
                    id: v.id, plate: v.plate, brand: v.brand || '',
                    line: v.line || '', model: v.model || '',
                    imageUrl: v.image_url || '', driverName,
                    days: daysData,
                    monthTotal: Object.values(daysData).reduce((s, d) => s + d.totalKm, 0),
                    monthTrips: Object.values(daysData).reduce((s, d) => s + d.trips.length, 0),
                };
            });

            setVehicles(rows);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }

    function prevMonth() { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); }
    function nextMonth() { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); }
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

    const monthName = new Date(year, month, 1)
        .toLocaleString('es-CO', { month: 'long', year: 'numeric' });

    const globalMaxDay = useMemo(() => {
        let max = 0;
        vehicles.forEach(v => Object.values(v.days).forEach(d => { if (d.totalKm > max) max = d.totalKm; }));
        return max;
    }, [vehicles]);

    const fleetKm = vehicles.reduce((s, v) => s + v.monthTotal, 0);
    const fleetTrips = vehicles.reduce((s, v) => s + v.monthTrips, 0);
    const activeV = vehicles.filter(v => v.monthTotal > 0).length;
    const todayKey = dayKey(now);
    const DOW = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

    // Total calendar width for the overflow wrapper
    const calendarW = IDENTITY_W + 6 + days.length * CELL_W + (days.length - 1) * GAP + 6 + SUMMARY_W;

    return (
        <div className="flex h-screen bg-slate-100/50 text-slate-900 font-sans">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">

                {/* ── Header ── */}
                <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 px-8 py-5 flex items-center justify-between shadow-sm">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Datactar · Fleet</p>
                        <h1 className="text-2xl font-black tracking-tight text-slate-900 leading-none mt-0.5">Historial de Recorridos</h1>
                    </div>

                    {/* Month navigator */}
                    <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-2xl p-1">
                        <button onClick={prevMonth} className="p-2 hover:bg-white rounded-xl transition-all shadow-sm">
                            <ChevronLeft className="w-4 h-4 text-slate-500" />
                        </button>
                        <span className="text-sm font-black text-slate-800 px-4 capitalize min-w-[170px] text-center">{monthName}</span>
                        <button onClick={nextMonth} disabled={isCurrentMonth} className="p-2 hover:bg-white rounded-xl transition-all shadow-sm disabled:opacity-30">
                            <ChevronRight className="w-4 h-4 text-slate-500" />
                        </button>
                    </div>
                </div>

                {/* ── Fleet KPIs ── */}
                <div className="px-8 pt-6 pb-5 grid grid-cols-3 gap-4">
                    {[
                        { label: 'Km flota', value: fleetKm > 0 ? fmtKm(fleetKm) : '--', sub: 'en el mes', Icon: TrendingUp, color: 'bg-blue-50 text-blue-600 border-blue-100' },
                        { label: 'Viajes completados', value: fleetTrips > 0 ? String(fleetTrips) : '--', sub: 'recorridos', Icon: Route, color: 'bg-violet-50 text-violet-600 border-violet-100' },
                        { label: 'Vehículos activos', value: `${activeV} / ${vehicles.length}`, sub: 'con actividad', Icon: Truck, color: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
                    ].map(({ label, value, sub, Icon, color }) => (
                        <div key={label} className="flex items-center gap-4 bg-white border border-slate-200 rounded-[24px] p-5 shadow-sm">
                            <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${color}`}>
                                <Icon className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">{label}</p>
                                <p className="text-2xl font-black text-slate-900 leading-none">{value}</p>
                                <p className="text-[10px] font-bold text-slate-400">{sub}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Calendar ── */}
                <div className="px-8 pb-8">
                    {loading ? (
                        <div className="flex items-center justify-center py-32">
                            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : vehicles.length === 0 ? (
                        <div className="text-center py-24">
                            <Truck className="w-12 h-12 mx-auto mb-4 text-slate-200" />
                            <p className="font-black uppercase tracking-widest text-sm text-slate-400">Sin vehículos registrados</p>
                        </div>
                    ) : (
                        <div className="space-y-2">

                            {/* Scrollable wrapper — prevents overflow on small screens */}
                            <div className="overflow-x-auto pb-2">
                                <div style={{ minWidth: calendarW }}>

                                    {/* ── Day-of-week header row ── */}
                                    <div className="flex items-end mb-2" style={{ gap: 0 }}>
                                        {/* Spacer matching identity col */}
                                        <div style={{ width: IDENTITY_W, flexShrink: 0 }} />
                                        {/* Spacer for left padding */}
                                        <div style={{ width: 6, flexShrink: 0 }} />
                                        {/* Day cells */}
                                        {days.map((d, i) => (
                                            <div
                                                key={d.toISOString()}
                                                style={{ width: CELL_W, flexShrink: 0, marginLeft: i === 0 ? 0 : GAP, minWidth: CELL_W }}
                                                className="text-center"
                                            >
                                                <p className="text-[6px] font-black uppercase text-slate-400">{DOW[d.getDay()]}</p>
                                                <p className={`text-[9px] font-black ${dayKey(d) === todayKey ? 'text-blue-600' : 'text-slate-500'}`}>
                                                    {d.getDate()}
                                                </p>
                                            </div>
                                        ))}
                                        {/* Spacer for right padding */}
                                        <div style={{ width: 6, flexShrink: 0 }} />
                                        {/* Spacer matching summary col */}
                                        <div style={{ width: SUMMARY_W, flexShrink: 0 }} />
                                    </div>

                                    {/* ── Vehicle rows ── */}
                                    {vehicles.map(v => {
                                        const isExpanded = expandedId === v.id && selected?.vehicle.id === v.id;
                                        return (
                                            <div key={v.id} className="bg-white border border-slate-200 rounded-[18px] overflow-hidden mb-2 shadow-sm hover:shadow-md transition-shadow">

                                                {/* Main row */}
                                                <div className="flex items-center" style={{ gap: 0 }}>

                                                    {/* Identity */}
                                                    <div
                                                        className="flex items-center gap-3 shrink-0 border-r border-slate-100 px-4 py-3"
                                                        style={{ width: IDENTITY_W }}
                                                    >
                                                        <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                                                            {v.imageUrl
                                                                ? <img src={v.imageUrl} alt={v.plate} className="w-8 h-8 object-contain" />
                                                                : <Truck className="w-4 h-4 text-slate-400" />}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1.5 mb-0.5">
                                                                <span className="bg-yellow-400 text-slate-900 font-black text-[9px] px-1.5 py-0.5 rounded-md border border-slate-900/10 leading-none">
                                                                    {v.plate}
                                                                </span>
                                                                {v.monthTotal > 0 && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                                                            </div>
                                                            <p className="text-[8px] font-bold text-slate-500 truncate">{v.brand} {v.line} {v.model}</p>
                                                            <p className="text-[8px] font-bold text-slate-400 truncate">{v.driverName}</p>
                                                        </div>
                                                    </div>

                                                    {/* Left inner padding */}
                                                    <div style={{ width: 6, flexShrink: 0 }} />

                                                    {/* Day cells */}
                                                    {days.map((d, i) => {
                                                        const k = dayKey(d);
                                                        const data = v.days[k];
                                                        const km = data?.totalKm || 0;
                                                        const inRoute = data?.inRoute === true;
                                                        const col = inRoute
                                                            ? { bg: 'bg-emerald-400', border: 'border-emerald-500', text: 'text-white' }
                                                            : kmColor(km, globalMaxDay);
                                                        const isToday = k === todayKey;
                                                        const isActive = isExpanded && selected?.day.date === k;

                                                        return (
                                                            <button
                                                                key={k}
                                                                onClick={() => {
                                                                    if (!data) return;
                                                                    if (isActive) {
                                                                        setSelected(null);
                                                                        setExpandedId(null);
                                                                    } else {
                                                                        setSelected({ vehicle: v, day: data });
                                                                        setExpandedId(v.id);
                                                                    }
                                                                }}
                                                                disabled={!data}
                                                                title={data ? (data.inRoute ? `🟢 En ruta · inicio ${fmtKm(data.startKm ?? 0)} km` : `${fmtKm(km)} km · ${data.trips.length} viaje(s)`) : 'Sin actividad'}
                                                                style={{
                                                                    width: CELL_W,
                                                                    flexShrink: 0,
                                                                    marginLeft: i === 0 ? 0 : GAP,
                                                                    height: 30,
                                                                }}
                                                                className={`
                                                                    rounded-lg border flex flex-col items-center justify-center transition-all
                                                                    ${col.bg} ${col.border}
                                                                    ${data ? 'cursor-pointer hover:brightness-95 hover:scale-110 hover:shadow-md hover:z-10' : 'cursor-default'}
                                                                    ${isToday ? (inRoute ? 'ring-2 ring-emerald-500 ring-offset-1' : 'ring-2 ring-blue-500 ring-offset-1') : ''}
                                                                    ${isActive ? 'ring-2 ring-slate-800 ring-offset-1' : ''}
                                                                `}
                                                            >
                                                                {inRoute ? (
                                                                    <span className="text-[8px] leading-none animate-pulse">●</span>
                                                                ) : km > 0 ? (
                                                                    <span className={`text-[7px] font-black leading-none ${col.text}`}>
                                                                        {km >= 1000 ? `${(km / 1000).toFixed(1)}k` : km}
                                                                    </span>
                                                                ) : null}
                                                                {data && data.trips.length > 1 && (
                                                                    <span className={`text-[6px] font-black leading-none mt-0.5 ${col.text} opacity-70`}>
                                                                        ×{data.trips.length}
                                                                    </span>
                                                                )}
                                                            </button>
                                                        );
                                                    })}

                                                    {/* Right inner padding */}
                                                    <div style={{ width: 6, flexShrink: 0 }} />

                                                    {/* Month summary */}
                                                    <div
                                                        className="shrink-0 border-l border-slate-100 px-3 py-3 text-right"
                                                        style={{ width: SUMMARY_W }}
                                                    >
                                                        <p className="text-[7px] font-black uppercase tracking-wider text-slate-400">Mes</p>
                                                        <p className="text-sm font-black text-slate-900 leading-none">
                                                            {v.monthTotal > 0 ? fmtKm(v.monthTotal) : '--'}
                                                        </p>
                                                        <p className="text-[8px] font-bold text-slate-400 mt-0.5">
                                                            {v.monthTrips > 0 ? `${v.monthTrips} viaje${v.monthTrips !== 1 ? 's' : ''}` : 'sin viajes'}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* ── Expanded day detail ── */}
                                                {isExpanded && selected && (
                                                    <div className="border-t border-slate-100 bg-slate-50/70">
                                                        <div className="px-5 pt-4 pb-3 flex items-start justify-between">
                                                            <div>
                                                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                                                                    {new Date(selected.day.date + 'T12:00:00').toLocaleDateString('es-CO', {
                                                                        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                                                                    })}
                                                                </p>
                                                                <div className="flex items-baseline gap-3 flex-wrap">
                                                                    <p className="text-xl font-black text-slate-900">
                                                                        {fmtKm(selected.day.totalKm)} km
                                                                    </p>
                                                                    <span className="text-sm font-bold text-slate-400">
                                                                        {selected.day.trips.length} viaje{selected.day.trips.length !== 1 ? 's' : ''}
                                                                    </span>
                                                                    {selected.day.startKm !== null && (
                                                                        <span className="text-[11px] font-bold text-slate-400">
                                                                            odómetro {fmtKm(selected.day.startKm)} → {fmtKm(selected.day.endKm ?? 0)}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => { setSelected(null); setExpandedId(null); }}
                                                                className="p-1.5 hover:bg-slate-200 rounded-xl text-slate-400 hover:text-slate-700 transition-all mt-1 shrink-0"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        </div>

                                                        {selected.day.trips.length === 0 ? (
                                                            <div className="px-5 pb-5">
                                                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                                                                    <p className="text-amber-700 font-bold text-xs">
                                                                        Hay registros pero sin pares inicio/fin completos.
                                                                        {selected.day.startKm !== null && ` Odómetro registrado: ${fmtKm(selected.day.startKm)} km`}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="px-5 pb-5 flex flex-wrap gap-3 mt-1">
                                                                {selected.day.trips.map((trip, i) => (
                                                                    <TripCard key={i} trip={trip} index={i} />
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ── Legend ── */}
                            <div className="flex items-center gap-4 pt-1 justify-end flex-wrap">
                                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Intensidad</span>
                                {[
                                    { label: 'En ruta 🟢', bg: 'bg-emerald-400 border border-emerald-500' },
                                    { label: 'Sin actividad', bg: 'bg-slate-100 border border-slate-200' },
                                    { label: 'Baja', bg: 'bg-blue-100 border border-blue-200' },
                                    { label: 'Media', bg: 'bg-blue-300 border border-blue-400' },
                                    { label: 'Alta', bg: 'bg-blue-500 border border-blue-600' },
                                    { label: 'Máxima', bg: 'bg-blue-700 border border-blue-800' },
                                ].map(({ label, bg }) => (
                                    <div key={label} className="flex items-center gap-1.5">
                                        <div className={`w-4 h-4 rounded-md ${bg}`} />
                                        <span className="text-[9px] font-bold text-slate-500">{label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

// ── Trip detail card ──────────────────────────────────────────
function TripCard({ trip, index }: { trip: Trip; index: number }) {
    const palettes = [
        { border: 'border-blue-200', bg: 'bg-blue-50', dot: 'bg-blue-500', label: 'text-blue-600', km: 'text-blue-900', bar: 'bg-blue-400' },
        { border: 'border-violet-200', bg: 'bg-violet-50', dot: 'bg-violet-500', label: 'text-violet-600', km: 'text-violet-900', bar: 'bg-violet-400' },
        { border: 'border-emerald-200', bg: 'bg-emerald-50', dot: 'bg-emerald-500', label: 'text-emerald-600', km: 'text-emerald-900', bar: 'bg-emerald-400' },
        { border: 'border-amber-200', bg: 'bg-amber-50', dot: 'bg-amber-500', label: 'text-amber-600', km: 'text-amber-900', bar: 'bg-amber-400' },
        { border: 'border-rose-200', bg: 'bg-rose-50', dot: 'bg-rose-500', label: 'text-rose-600', km: 'text-rose-900', bar: 'bg-rose-400' },
    ];
    const p = palettes[index % palettes.length];

    return (
        <div className={`border ${p.border} ${p.bg} rounded-[16px] p-4 w-[190px] shrink-0`}>
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
                <div className={`w-2 h-2 rounded-full ${p.dot} shrink-0`} />
                <span className={`text-[8px] font-black uppercase tracking-widest ${p.label}`}>
                    Viaje {index + 1}
                </span>
            </div>

            {/* Distance — big number */}
            <p className={`text-3xl font-black leading-none ${p.km}`}>
                {trip.distKm.toLocaleString('es-CO')}
            </p>
            <p className={`text-[9px] font-black uppercase tracking-wider ${p.label} mb-4`}>kilómetros</p>

            {/* Timeline bar */}
            <div className="relative mb-1">
                <div className="h-1.5 bg-white rounded-full border border-slate-200">
                    <div className={`h-full rounded-full ${p.bar} opacity-60`} style={{ width: '100%' }} />
                </div>
                <div className="absolute -top-0.5 left-0 w-2.5 h-2.5 rounded-full bg-white border-2 border-slate-300 shadow-sm" />
                <div className="absolute -top-0.5 right-0 w-2.5 h-2.5 rounded-full bg-white border-2 border-slate-300 shadow-sm" />
            </div>
            <div className="flex justify-between text-[9px] font-black text-slate-500 mb-3">
                <span>{trip.startTime}</span>
                <span>{trip.endTime}</span>
            </div>

            {/* Odometer */}
            <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-white">
                <div>
                    <p className="text-[7px] font-black uppercase text-slate-400 tracking-wider mb-0.5">Inicio km</p>
                    <p className="text-[10px] font-black text-slate-700">{trip.startKm.toLocaleString('es-CO')}</p>
                </div>
                <div>
                    <p className="text-[7px] font-black uppercase text-slate-400 tracking-wider mb-0.5">Fin km</p>
                    <p className="text-[10px] font-black text-slate-700">{trip.endKm.toLocaleString('es-CO')}</p>
                </div>
            </div>

            {/* Driver */}
            <p className="text-[8px] font-bold text-slate-500 mt-2 pt-2 border-t border-white truncate">
                {trip.driver}
            </p>
        </div>
    );
}