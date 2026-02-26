'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { supabase } from '@/lib/supabase';
import { Activity, AlertTriangle, Car, Truck, Bell, Navigation, CheckCircle } from 'lucide-react';
import { useCompany } from '@/lib/company';

export default function Home() {
  const { companyId, loading: companyLoading } = useCompany();
  const [stats, setStats] = useState<any>({
    totalVehicles: 0,
    activeRoutes: '0 / 0',
    alerts: 0,
    docAlerts: 0,
    missingStarts: '0 / 0'
  });
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [fuelDates, setFuelDates] = useState<Record<string, string>>({});
  const [pendingDrivers, setPendingDrivers] = useState<any[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'finished'>('all');

  useEffect(() => {
    if (companyId) fetchData();
  }, [companyId]);

  async function fetchData() {
    if (!companyId) return;
    const { data: vData } = await supabase.from('vehicles').select('*').eq('company_id', companyId);
    const { data: aData } = await supabase
      .from('driver_assignments')
      .select('vehicle_id, driver_id, users(id, full_name)')
      .eq('company_id', companyId)
      .eq('role', 'principal')
      .eq('is_active', true);

    // Get today's range
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch today's records
    const { data: rData } = await supabase
      .from('route_records')
      .select('vehicle_id, activity_type, recorded_at')
      .eq('company_id', companyId)
      .gte('recorded_at', today.toISOString())
      .order('recorded_at', { ascending: false });

    // Latest status per vehicle today
    const latestStatus: Record<string, string> = {};
    rData?.forEach(r => {
      if (!latestStatus[r.vehicle_id]) {
        latestStatus[r.vehicle_id] = r.activity_type;
      }
    });

    // Identify vehicles state
    const totalFleet = vData?.length || 0;
    const missing = vData?.filter(v => v.status === 'Activo' && !latestStatus[v.id]).map(v => ({ ...v, is_active_route: false })) || [];
    const activeToday = vData?.filter(v => latestStatus[v.id] === 'start').map(v => ({ ...v, is_active_route: true })) || [];
    const finishedToday = vData?.filter(v => latestStatus[v.id] === 'end') || [];
    const totalStartedToday = vData?.filter(v => latestStatus[v.id]).length || 0;

    // Fetch today's alerts: failed pre-ops OR custom comments reported
    // We fetch them and filter manually for the 'No' comment logic
    const { data: verifData } = await supabase
      .from('verifications')
      .select('passed, comments')
      .eq('company_id', companyId)
      .gte('recorded_at', today.toISOString());

    const alertCount = verifData?.filter(v =>
      !v.passed ||
      (v.comments && v.comments.trim().toLowerCase() !== 'no' && v.comments.trim() !== '')
    ).length || 0;

    // Fetch upcoming document expirations (next 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const { data: dAlerts } = await supabase
      .from('legal_documents')
      .select('id')
      .eq('company_id', companyId)
      .lte('expiration_date', thirtyDaysFromNow.toISOString().split('T')[0])
      .gte('expiration_date', new Date().toISOString().split('T')[0]);

    setStats({
      totalVehicles: totalFleet,
      activeRoutes: `${activeToday.length} / ${totalFleet}`,
      alerts: alertCount,
      docAlerts: dAlerts?.length || 0,
      missingStarts: `${finishedToday.length} / ${totalStartedToday}` // Finished / Total Started today
    });

    if (vData) {
      const vehiclesWithState = vData.map(v => {
        const assignment = aData?.find(a => a.vehicle_id === v.id);
        return {
          ...v,
          driverId: (assignment as any)?.driver_id || null,
          main_driver: (assignment?.users as any)?.full_name || v.main_driver,
          is_active_route: latestStatus[v.id] === 'start',
          is_finished_route: latestStatus[v.id] === 'end'
        };
      });

      // Sort vehicles
      const sortedVehicles = [...vehiclesWithState].sort((a, b) => {
        const stateA = latestStatus[a.id] || 'pending';
        const stateB = latestStatus[b.id] || 'pending';
        if (stateA === 'start' && stateB !== 'start') return -1;
        if (stateB === 'start' && stateA !== 'start') return 1;
        return 0;
      });
      setVehicles(sortedVehicles);
    }

    // Combine missing and active for the Operational Tracking
    setPendingDrivers([...missing, ...activeToday]);

    // Fetch Last Fueling for each vehicle
    const { data: fuelData } = await supabase
      .from('fuel_records')
      .select('vehicle_id, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    const latestFuel: Record<string, string> = {};
    fuelData?.forEach(f => {
      if (!latestFuel[f.vehicle_id]) {
        latestFuel[f.vehicle_id] = f.created_at;
      }
    });
    setFuelDates(latestFuel);
  }

  async function handleNotify(driverId: string, driverName: string, plate: string) {
    if (!driverId) {
      alert('Este vehículo no tiene un conductor activo vinculado.');
      return;
    }
    if (!confirm(`¿Enviar recordatorio a ${driverName}?`)) return;

    try {
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId,
          message: `Hola ${driverName}! No veo tu registro de hoy en el vehículo ${plate}. ¿Podrías actualizarlo por favor?`
        })
      });
      if (res.ok) alert(`✅ Recordatorio enviado a ${driverName}`);
      else alert('❌ Error al enviar notificación.');
    } catch (e) {
      alert('Error de conexión.');
    }
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-4 md:p-12">
        {/* Top Bar */}
        <header className="mb-12 flex justify-between items-center">
          <div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tight">Fleet Dashboard</h2>
            <p className="text-slate-500 font-bold text-lg mt-1">Welcome back, Admin.</p>
          </div>
          <div className="flex gap-4">
            <button className="h-14 w-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-100 transition-all shadow-sm">
              <Bell className="w-6 h-6" />
            </button>
            <div className="h-14 px-6 rounded-2xl bg-white border border-slate-200 flex items-center gap-3 text-slate-900 font-black shadow-sm">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs">RM</div>
              Admin Profile
            </div>
          </div>
        </header>

        {/* Highlight Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          <button onClick={() => setFilterStatus(prev => prev === 'active' ? 'all' : 'active')} className="text-left">
            <StatCard
              title="Rutas Activas"
              value={stats.activeRoutes}
              icon={Navigation}
              color="text-blue-600"
              iconBg="bg-blue-50"
              active={filterStatus === 'active'}
            />
          </button>
          <button onClick={() => setFilterStatus(prev => prev === 'finished' ? 'all' : 'finished')} className="text-left">
            <StatCard
              title="Rutas Terminadas"
              value={stats.missingStarts}
              icon={CheckCircle}
              color="text-indigo-600"
              iconBg="bg-indigo-50"
              active={filterStatus === 'finished'}
            />
          </button>
          <Link href="/alerts">
            <StatCard
              title="Anomalías Hoy"
              value={stats.alerts}
              icon={AlertTriangle}
              color="text-rose-600"
              iconBg="bg-rose-50"
            />
          </Link>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
          {/* Left Col: Operations */}
          <div className="xl:col-span-2 space-y-10">
            {/* Table View */}
            <section className="bg-white border border-slate-200 rounded-[40px] shadow-sm overflow-hidden">
              <div className="p-10 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">Fleet Overview</h3>
                {filterStatus !== 'all' && (
                  <button onClick={() => setFilterStatus('all')} className="text-xs font-bold text-rose-500 hover:text-rose-700 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    Clear Filter ({filterStatus === 'active' ? 'Active' : 'Finished'})
                  </button>
                )}
                <Link href="/vehicles" className="text-blue-600 font-black text-xs uppercase tracking-widest hover:underline">View All</Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-sans">
                  <thead className="bg-[#fbfeff] text-slate-400 text-[10px] font-black uppercase tracking-[2px]">
                    <tr>
                      <th className="px-10 py-5">Vehicle</th>
                      <th className="px-10 py-5">Status</th>
                      <th className="px-10 py-5">Odometer</th>
                      <th className="px-10 py-5">Último Tanqueo</th>
                      <th className="px-10 py-5">Today</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {vehicles
                      .filter(v => {
                        if (filterStatus === 'active') return v.is_active_route;
                        if (filterStatus === 'finished') return v.is_finished_route;
                        return true;
                      })
                      .slice(0, 10).map((v) => (
                        <tr key={v.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => window.location.href = `/vehicles/${v.id}`}>
                          <td className="px-10 py-6">
                            <div className="flex items-center gap-4">
                              <div className="bg-yellow-400 px-3 py-1.5 rounded-xl border-[2.5px] border-slate-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] font-black text-[11px] tracking-widest leading-none">
                                {v.plate}
                              </div>
                              <span className="font-black text-slate-800 tracking-tight">{v.brand} {v.line}</span>
                            </div>
                          </td>
                          <td className="px-10 py-6">
                            <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-200/50 ${v.status === 'Activo'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-100 text-slate-500 border-slate-200'
                              }`}>
                              {v.status || 'Activo'}
                            </span>
                          </td>
                          <td className="px-10 py-6 text-slate-700 font-black text-base">{v.current_odometer?.toLocaleString() || '0'} km</td>
                          <td className="px-10 py-6">
                            <span className="text-slate-500 font-bold text-xs">
                              {fuelDates[v.id] ? new Date(fuelDates[v.id]).toLocaleDateString() : 'Sin registro'}
                            </span>
                          </td>
                          <td className="px-10 py-6">
                            {v.is_active_route && <span className="text-blue-600 text-[10px] font-black uppercase tracking-widest">En Ruta</span>}
                            {v.is_finished_route && <span className="text-indigo-600 text-[10px] font-black uppercase tracking-widest">Finalizado</span>}
                            {!v.is_active_route && !v.is_finished_route && <span className="text-slate-300 text-[10px] font-black uppercase tracking-widest">Sin Actividad</span>}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Status Tracker                */}
            <section className="bg-white border border-slate-200 rounded-[40px] p-10 shadow-sm relative overflow-hidden">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">Operational Tracking</h3>
                <div className="flex gap-2">
                  <span className="bg-amber-100 text-amber-700 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-amber-200/50">
                    {stats.missingStarts} Pendientes
                  </span>
                  <span className="bg-blue-100 text-blue-700 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-200/50">
                    {stats.activeRoutes} En Ruta
                  </span>
                </div>
              </div>

              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {pendingDrivers
                  .filter(v => {
                    if (filterStatus === 'active') return v.is_active_route;
                    if (filterStatus === 'finished') return !v.is_active_route;
                    return true;
                  })
                  .length > 0 ? pendingDrivers
                    .filter(v => {
                      if (filterStatus === 'active') return v.is_active_route;
                      if (filterStatus === 'finished') return !v.is_active_route;
                      return true;
                    })
                    .map(v => (
                      <div key={v.id} className="flex items-center justify-between p-6 bg-slate-50 rounded-[32px] border border-slate-100 group hover:border-blue-200 transition-all">
                        <div className="flex items-center gap-5">
                          <div className="w-16 h-16 rounded-[22px] bg-white shadow-md flex items-center justify-center font-black text-slate-900 border border-slate-100 text-sm tracking-widest uppercase">
                            {v.plate}
                          </div>
                          <div>
                            <p className="font-black text-slate-900 text-lg leading-none">{v.main_driver || 'Sin Conductor'}</p>
                            {v.is_active_route ? (
                              <p className="text-xs text-blue-600 font-bold mt-2 uppercase tracking-tight italic">● Actualmente en Recorrido</p>
                            ) : (
                              <p className="text-xs text-amber-600 font-bold mt-2 uppercase tracking-tight italic">● Falta Inicio de Ruta</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {!v.is_active_route && v.driverId && (
                            <button
                              onClick={() => handleNotify(v.driverId, v.main_driver, v.plate)}
                              className="p-3 bg-white text-blue-600 rounded-2xl border border-slate-200 hover:bg-blue-50 transition-all shadow-sm group/bell"
                              title="Enviar Recordatorio"
                            >
                              <Bell className="w-5 h-5 group-hover/bell:animate-bounce" />
                            </button>
                          )}
                          <Link href={`/vehicles/${v.id}`} className="px-6 py-3 bg-white text-slate-600 rounded-[18px] font-black text-xs uppercase tracking-widest border border-slate-200 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all shadow-sm">Ver Detalles</Link>
                        </div>
                      </div>
                    )) : (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-300">
                    <CheckCircle className="w-12 h-12 mb-4 text-blue-100" />
                    <p className="font-bold">
                      {filterStatus === 'active' ? 'No hay rutas activas.' :
                        filterStatus === 'finished' ? 'Todos iniciaron ruta / No hay pendientes.' :
                          '¡Flota al día! Todos iniciaron ruta.'}
                    </p>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Right Col: Quick Actions */}
          <div className="space-y-10">
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-[50px] p-10 text-white shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-12 opacity-5 scale-150 group-hover:rotate-12 transition-transform duration-1000">
                <Truck className="w-48 h-48" />
              </div>
              <h3 className="text-3xl font-black mb-1 tracking-tight leading-none">Fleet Pulse</h3>
              <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mb-10">Security Analytics</p>

              <div className="space-y-6">
                <div className="bg-white/5 border border-white/10 p-6 rounded-[32px] backdrop-blur-xl">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2 text-blue-400">System Integrity</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-bold">100% Correcto</span>
                    <CheckCircle className="w-6 h-6 text-blue-500" />
                  </div>
                </div>

                {stats.docAlerts > 0 && (
                  <Link href="/documents" className="block transform hover:scale-105 transition-transform">
                    <div className="bg-rose-500/20 border border-rose-500/40 p-6 rounded-[32px] backdrop-blur-xl animate-pulse">
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2 text-rose-300">Alerta de Seguridad</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xl font-bold">{stats.docAlerts} Docs por Vencer</span>
                        <AlertTriangle className="w-6 h-6 text-rose-400" />
                      </div>
                    </div>
                  </Link>
                )}
              </div>
            </div>

            <div className="bg-[#edf2f7] rounded-[50px] p-10 border border-white shadow-sm">
              <h3 className="font-black text-slate-800 text-xl uppercase tracking-widest mb-10">Quick Access</h3>
              <div className="grid grid-cols-2 gap-6">
                <Link href="/logs"><QuickAction icon={Activity} label="Logs" color="text-blue-600" bg="bg-white" /></Link>
                <Link href="/alerts"><QuickAction icon={AlertTriangle} label="Issues" color="text-rose-600" bg="bg-white" /></Link>
                <Link href="/vehicles"><QuickAction icon={Car} label="Fleet" color="text-blue-600" bg="bg-white" /></Link>
                <Link href="/trips"><QuickAction icon={Truck} label="Trips" color="text-amber-600" bg="bg-white" /></Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function QuickAction({ icon: Icon, label, color, bg }: any) {
  return (
    <button className={`flex flex-col items-center gap-4 p-8 rounded-[40px] ${bg} ${color} shadow-sm border border-transparent hover:border-slate-200 hover:shadow-xl transition-all active:scale-95 group`}>
      <Icon className="w-10 h-10 group-hover:scale-125 transition-transform duration-500" />
      <span className="text-[9px] font-black uppercase tracking-[0.2em]">{label}</span>
    </button>
  )
}

function StatCard({ title, value, icon: Icon, color, iconBg, active }: any) {
  return (
    <div className={`bg-white p-10 rounded-[45px] border shadow-sm relative overflow-hidden group hover:shadow-xl transition-all duration-500 ${active ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200'}`}>
      <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-125 transition-transform duration-700">
        <Icon className="w-24 h-24" />
      </div>
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-slate-400 text-xs font-black mb-2 uppercase tracking-[0.2em]">{title}</h3>
          <p className={`text-5xl font-black ${color} tracking-tight`}>{value}</p>
        </div>
        <div className={`p-5 rounded-[24px] ${iconBg} ${color} shadow-inner`}>
          <Icon className="w-8 h-8" />
        </div>
      </div>
    </div>
  )
}
