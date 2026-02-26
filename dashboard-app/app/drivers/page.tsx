'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { supabase } from '@/lib/supabase';
import { User, Plus, Search, Car, Trash2, Edit2, X, Check, Shield, AlertCircle, Calendar, Upload, ExternalLink, AlertTriangle, CheckCircle, Download } from 'lucide-react';
import { useCompany, exportToCsv } from '@/lib/company';

export default function DriversPage() {
    const { companyId, loading: companyLoading } = useCompany();
    const [users, setUsers] = useState<any[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [assignments, setAssignments] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [driverDocs, setDriverDocs] = useState<any[]>([]);
    const [fetchingDocs, setFetchingDocs] = useState(false);

    const [formData, setFormData] = useState({
        full_name: '',
        phone_number: '',
        role: 'driver',
    });

    // Sub-form for NEW assignment
    const [newAssignment, setNewAssignment] = useState({
        vehicle_id: '',
        role: 'principal'
    });

    useEffect(() => {
        if (companyId) fetchData();
    }, [companyId]);

    async function fetchData() {
        if (!companyId) return;
        setLoading(true);
        const { data: uData } = await supabase.from('users').select('*').eq('company_id', companyId).order('full_name');
        const { data: vData } = await supabase.from('vehicles').select('*').eq('company_id', companyId);
        const { data: aData } = await supabase.from('driver_assignments').select('*, vehicles(plate, line)').eq('company_id', companyId);

        if (uData) setUsers(uData);
        if (vData) setVehicles(vData);
        if (aData) setAssignments(aData);
        setLoading(false);
    }

    const filteredUsers = users.filter(u =>
        u.full_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        try {
            let userId = editingUser?.id;

            // Normalize name to Title Case
            const normalizedName = formData.full_name
                .toLowerCase()
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');

            if (editingUser) {
                const { error } = await supabase.from('users').update({
                    full_name: normalizedName,
                    phone_number: formData.phone_number || null,
                    role: formData.role
                }).eq('id', userId);
                if (error) throw error;

                // If name changed, update vehicles.main_driver if this driver is principal somewhere
                const driverPrincipals = assignments.filter(a => a.driver_id === userId && a.role === 'principal');
                for (const a of driverPrincipals) {
                    await supabase.from('vehicles').update({ main_driver: normalizedName }).eq('id', a.vehicle_id);
                }

            } else {
                const { data: existing } = await supabase.from('users')
                    .select('id')
                    .ilike('full_name', normalizedName)
                    .maybeSingle();

                if (existing) {
                    alert('Este conductor ya existe.');
                    return;
                }

                const { data, error } = await supabase.from('users').insert({
                    full_name: normalizedName,
                    phone_number: formData.phone_number || null,
                    role: formData.role,
                    company_id: companyId
                }).select();
                if (error) throw error;
                userId = data?.[0].id;
            }

            // Create assignment if selected
            if (userId && newAssignment.vehicle_id) {
                await addAssignment(userId, newAssignment.vehicle_id, newAssignment.role, normalizedName);
            }

            setIsModalOpen(false);
            setEditingUser(null);
            setFormData({ full_name: '', phone_number: '', role: 'driver' });
            setNewAssignment({ vehicle_id: '', role: 'principal' });
            fetchData();
        } catch (err: any) {
            console.error("Error saving driver:", err);
            alert(`Error: ${err.message}`);
        }
    }

    async function addAssignment(userId: string, vehicleId: string, role: string, driverName: string) {
        // If principal, check for existing principal
        if (role === 'principal') {
            const { data: existingPrincipal } = await supabase
                .from('driver_assignments')
                .select('*, users(full_name)')
                .eq('vehicle_id', vehicleId)
                .eq('role', 'principal')
                .eq('is_active', true)
                .maybeSingle();

            if (existingPrincipal && existingPrincipal.driver_id !== userId) {
                const confirmReplace = confirm(
                    `⚠️ Este vehículo ya tiene un conductor principal: ${existingPrincipal.users?.full_name}.\n\n` +
                    `¿Deseas reemplazarlo por ${driverName}?\n` +
                    `(El conductor anterior pasará a ser Adicional)`
                );

                if (!confirmReplace) return;

                // 1. Demote old principal to adicional
                await supabase.from('driver_assignments')
                    .update({ role: 'adicional' })
                    .eq('id', existingPrincipal.id);
            }

            // 2. Ensure NO OTHER assignment for THIS driver is principal (just in case)
            await supabase.from('driver_assignments')
                .update({ is_active: false })
                .eq('vehicle_id', vehicleId)
                .eq('role', 'principal');

            // 3. Sync vehicles table
            await supabase.from('vehicles').update({ main_driver: driverName }).eq('id', vehicleId);
        }

        const { error } = await supabase.from('driver_assignments').upsert({
            driver_id: userId,
            vehicle_id: vehicleId,
            role: role,
            is_active: true
        }, { onConflict: 'driver_id, vehicle_id' });

        if (error) throw error;
    }

    async function removeAssignment(assignmentId: string, vehicleId: string, role: string) {
        if (!confirm('¿Quitar esta asignación?')) return;

        const { error } = await supabase.from('driver_assignments').delete().eq('id', assignmentId);
        if (error) {
            alert("Error al quitar: " + error.message);
            return;
        }

        if (role === 'principal') {
            await supabase.from('vehicles').update({ main_driver: '' }).eq('id', vehicleId);
        }

        fetchData();
        // Keep modal open if editing
    }

    async function handleDeleteUser(userId: string) {
        if (!confirm('¿Eliminar conductor y todas sus asignaciones?')) return;

        try {
            // 1. Limpiar main_driver en vehículos donde era principal
            const userPrincipals = assignments.filter(a => a.driver_id === userId && a.role === 'principal');
            for (const a of userPrincipals) {
                const { error: vehicleError } = await supabase
                    .from('vehicles')
                    .update({ main_driver: '' })
                    .eq('id', a.vehicle_id);
                if (vehicleError) throw new Error(`Error actualizando vehículo ${a.vehicles?.plate}: ${vehicleError.message}`);
            }

            // 2. Desvincular registros de ruta
            const { error: routesError } = await supabase
                .from('route_records')
                .update({ driver_id: null })
                .eq('driver_id', userId);
            if (routesError) throw new Error(`Error desvinculando reportes de ruta: ${routesError.message}`);

            // 3a. Obtener IDs de verificaciones del conductor
            const { data: verifications, error: fetchVerifError } = await supabase
                .from('verifications')
                .select('id')
                .eq('driver_id', userId);
            if (fetchVerifError) throw new Error(`Error obteniendo verificaciones: ${fetchVerifError.message}`);

            // 3b. Eliminar detalles de verificación primero
            if (verifications && verifications.length > 0) {
                const verificationIds = verifications.map((v: any) => v.id);
                const { error: detailsError } = await supabase
                    .from('verification_details')
                    .delete()
                    .in('verification_id', verificationIds);
                if (detailsError) throw new Error(`Error eliminando detalles de verificación: ${detailsError.message}`);
            }

            // 3c. Eliminar verificaciones del conductor
            const { error: verificationsError } = await supabase
                .from('verifications')
                .delete()
                .eq('driver_id', userId);
            if (verificationsError) throw new Error(`Error eliminando verificaciones: ${verificationsError.message}`);

            // 4. Eliminar asignaciones
            const { error: assignmentsError } = await supabase
                .from('driver_assignments')
                .delete()
                .eq('driver_id', userId);
            if (assignmentsError) throw new Error(`Error eliminando asignaciones: ${assignmentsError.message}`);

            // 5. Eliminar usuario (al final, cuando ya no tiene dependencias)
            const { error: userError } = await supabase
                .from('users')
                .delete()
                .eq('id', userId);
            if (userError) throw new Error(`Error eliminando usuario: ${userError.message}`);

            alert('✅ Conductor eliminado correctamente.');
            fetchData();
        } catch (err: any) {
            console.error("Error deleting driver:", err);
            alert(`Error al eliminar: ${err.message}`);
        }
    }

    async function fetchDriverDocs(userId: string) {
        setFetchingDocs(true);
        const { data } = await supabase
            .from('legal_documents')
            .select('*')
            .eq('entity_id', userId)
            .eq('entity_type', 'driver')
            .order('expiration_date', { ascending: false });
        setDriverDocs(data || []);
        setFetchingDocs(false);
    }

    return (
        <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-8 md:p-12">
                <header className="mb-12 flex justify-between items-center">
                    <div>
                        <h2 className="text-4xl font-black text-slate-900 tracking-tight">Gestión de Personal</h2>
                        <p className="text-slate-500 font-bold text-lg">Conductores y Asignaciones de Flota</p>
                    </div>
                    <button
                        onClick={() => exportToCsv('conductores', users.map(u => ({
                            nombre: u.full_name,
                            rol: u.role,
                            telefono: u.phone_number || '',
                            telegram_vinculado: u.telegram_id ? 'Sí' : 'No',
                            creado: u.created_at?.slice(0, 10) || ''
                        })))}
                        className="flex items-center gap-2 px-6 py-4 bg-white border border-slate-200 text-slate-600 rounded-[24px] font-black uppercase text-xs tracking-widest hover:bg-slate-50 transition-all shadow-sm"
                    >
                        <Download className="w-4 h-4" />
                        Exportar CSV
                    </button>
                    <button
                        onClick={() => {
                            setIsModalOpen(true);
                            setEditingUser(null);
                            setFormData({ full_name: '', phone_number: '', role: 'driver' });
                            setNewAssignment({ vehicle_id: '', role: 'principal' });
                        }}
                        className="flex items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-[24px] font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95"
                    >
                        <Plus className="w-5 h-5" />
                        Nuevo Conductor
                    </button>
                </header>

                <div className="mb-12 relative max-w-xl">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 w-6 h-6" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre..."
                        className="w-full pl-16 pr-8 py-5 bg-white border border-slate-200 rounded-[28px] shadow-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-slate-700 placeholder:text-slate-300"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 grayscale opacity-50">
                        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="font-black uppercase tracking-widest text-xs">Cargando Personal...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6">
                        {filteredUsers.map((user) => {
                            const userAssignments = assignments.filter(a => a.driver_id === user.id && a.is_active);
                            return (
                                <div key={user.id} className="bg-white border border-slate-200 rounded-[32px] p-8 flex flex-col md:flex-row items-center justify-between gap-8 hover:shadow-xl transition-all group">
                                    <div className="flex items-center gap-6">
                                        <div className={`w-16 h-16 rounded-[22px] flex items-center justify-center font-black text-xl shadow-inner ${user.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                            {user.full_name.charAt(0)}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-3 mb-1">
                                                <h4 className="font-black text-slate-900 text-xl tracking-tight">{user.full_name}</h4>
                                                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${user.role === 'admin' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                                                    {user.role}
                                                </span>
                                            </div>
                                            <p className="text-slate-400 font-bold text-sm tracking-tight flex items-center gap-2">
                                                {user.phone_number ? (
                                                    <><Check className="w-3 h-3 text-blue-500" /> {user.phone_number}</>
                                                ) : (
                                                    <span className="flex items-center gap-1.5 text-amber-500 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-100 italic">
                                                        Sin número registrado
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-3">
                                        {userAssignments.length > 0 ? userAssignments.map(a => (
                                            <div key={a.id} className="bg-slate-50 border border-slate-100 px-4 py-3 rounded-2xl flex items-center gap-3">
                                                <div className="bg-yellow-400 px-2 py-0.5 rounded text-[9px] font-black border border-slate-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] uppercase">
                                                    {a.vehicles?.plate}
                                                </div>
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{a.role}</span>
                                            </div>
                                        )) : (
                                            <span className="text-slate-300 text-xs font-bold italic">Sin asignación</span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                setEditingUser(user);
                                                setFormData({
                                                    full_name: user.full_name,
                                                    phone_number: user.phone_number || '',
                                                    role: user.role,
                                                });
                                                setNewAssignment({ vehicle_id: '', role: 'principal' });
                                                setIsModalOpen(true);
                                                fetchDriverDocs(user.id);
                                            }}
                                            className="p-4 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all"
                                        >
                                            <Edit2 className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteUser(user.id)}
                                            className="p-4 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Modal Form */}
                {isModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-[40px] w-full max-w-3xl shadow-2xl border border-white relative overflow-hidden h-[90vh] flex flex-col">
                            <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                                <h3 className="text-3xl font-black text-slate-900 tracking-tight">
                                    {editingUser ? 'Detalles del Conductor' : 'Nuevo Conductor'}
                                </h3>
                                <button onClick={() => setIsModalOpen(false)} className="p-3 text-slate-400 hover:bg-slate-100 rounded-2xl transition-all">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-10 md:p-14 space-y-12">
                                <form id="driver-form" onSubmit={handleSubmit} className="space-y-8">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Nombre Completo</label>
                                            <input
                                                required
                                                type="text"
                                                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                                                value={formData.full_name}
                                                onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Número de Celular</label>
                                            <input
                                                type="tel"
                                                placeholder="Ej: +57 300 123 4567"
                                                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                                                value={formData.phone_number}
                                                onChange={e => setFormData({ ...formData, phone_number: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Rol en el Sistema</label>
                                        <select
                                            className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-700 outline-none appearance-none"
                                            value={formData.role}
                                            onChange={e => setFormData({ ...formData, role: e.target.value })}
                                        >
                                            <option value="driver">Conductor</option>
                                            <option value="admin">Administrador</option>
                                        </select>
                                    </div>
                                </form>

                                {editingUser && (
                                    <div className="pt-10 border-t border-slate-100 space-y-8">
                                        <div className="flex items-center gap-3">
                                            <Car className="w-5 h-5 text-blue-600" />
                                            <h4 className="font-black text-slate-900 uppercase tracking-tight">Vehículos Asignados</h4>
                                        </div>

                                        <div className="grid grid-cols-1 gap-4">
                                            {assignments.filter(a => a.driver_id === editingUser.id).map(a => (
                                                <div key={a.id} className="flex items-center justify-between bg-slate-50 p-6 rounded-3xl border border-slate-100">
                                                    <div className="flex items-center gap-4">
                                                        <div className="bg-yellow-400 px-3 py-1 rounded-lg border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] font-black text-xs">
                                                            {a.vehicles?.plate}
                                                        </div>
                                                        <div>
                                                            <p className="font-black text-slate-800 text-sm tracking-tight">{a.vehicles?.line}</p>
                                                            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-0.5">{a.role}</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => removeAssignment(a.id, a.vehicle_id, a.role)}
                                                        className="p-3 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}

                                            <div className="mt-4 p-8 bg-slate-900 rounded-[35px] space-y-6">
                                                <p className="text-white font-black text-xs uppercase tracking-widest">Añadir Nueva Asignación</p>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <select
                                                        className="px-6 py-4 bg-slate-800 border border-slate-700 rounded-2xl font-bold text-white outline-none appearance-none"
                                                        value={newAssignment.vehicle_id}
                                                        onChange={e => setNewAssignment({ ...newAssignment, vehicle_id: e.target.value })}
                                                    >
                                                        <option value="">Seleccionar Vehículo</option>
                                                        {vehicles.map(v => (
                                                            <option key={v.id} value={v.id}>{v.plate} - {v.line}</option>
                                                        ))}
                                                    </select>
                                                    <div className="flex bg-slate-800 p-1.5 rounded-2xl border border-slate-700">
                                                        <button
                                                            type="button"
                                                            onClick={() => setNewAssignment({ ...newAssignment, role: 'principal' })}
                                                            className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${newAssignment.role === 'principal' ? 'bg-white text-slate-900' : 'text-slate-400'}`}
                                                        >
                                                            Principal
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setNewAssignment({ ...newAssignment, role: 'adicional' })}
                                                            className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${newAssignment.role === 'adicional' ? 'bg-white text-slate-900' : 'text-slate-400'}`}
                                                        >
                                                            Adicional
                                                        </button>
                                                    </div>
                                                </div>
                                                {newAssignment.vehicle_id && (
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                await addAssignment(editingUser.id, newAssignment.vehicle_id, newAssignment.role, formData.full_name);
                                                                setNewAssignment({ vehicle_id: '', role: 'principal' });
                                                                fetchData();
                                                            } catch (err: any) {
                                                                alert(err.message);
                                                            }
                                                        }}
                                                        className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all"
                                                    >
                                                        Vincular Ahora
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {editingUser && (
                                    <div className="pt-10 border-t border-slate-100 space-y-8">
                                        <div className="flex items-center gap-3">
                                            <Shield className="w-5 h-5 text-blue-600" />
                                            <h4 className="font-black text-slate-900 uppercase tracking-tight">Documentación Legal</h4>
                                        </div>

                                        <DocManager
                                            label="Licencia de Conducción"
                                            docType="Licencia"
                                            docs={driverDocs.filter(d => d.doc_type === 'Licencia')}
                                            entityId={editingUser.id}
                                            entityType="driver"
                                            onRefresh={() => fetchDriverDocs(editingUser.id)}
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="p-8 md:p-10 border-t border-slate-100 flex gap-4 bg-slate-50/30">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 py-5 bg-white border border-slate-200 text-slate-500 rounded-[22px] font-black uppercase text-xs tracking-widest hover:bg-slate-50 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    form="driver-form"
                                    type="submit"
                                    className="flex-[2] py-5 bg-blue-600 text-white rounded-[22px] font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100"
                                >
                                    {editingUser ? 'Actualizar Información' : 'Registrar Conductor'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
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
        const file = e.target.files[0];
        if (!file) return;

        setSelectedFile(file);
        setAnalyzing(true);
        setExpDate('');

        try {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64 = (reader.result as string).split(',')[1];
                const res = await fetch('/api/analyze-doc', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: base64, docType })
                });
                const data = await res.json();
                if (data.expiration_date) {
                    setExpDate(data.expiration_date);
                } else {
                    alert('No se pudo extraer la fecha de vencimiento automáticamente.');
                }
            };
        } catch (err) {
            console.error('Error analyzing file:', err);
        } finally {
            setAnalyzing(false);
        }
    };

    const handleUpload = async () => {
        if (!selectedFile || !expDate) {
            alert('Por favor selecciona un archivo y define la fecha de vencimiento.');
            return;
        }

        setUploading(true);
        try {
            const file = selectedFile;
            const fileExt = file.name.split('.').pop();
            const safeDocType = docType.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '_');
            const fileName = `${entityId}_${safeDocType}_${Date.now()}.${fileExt}`;
            const filePath = `manual_docs/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('fleet_photos')
                .upload(filePath, file, {
                    upsert: true,
                    contentType: file.type
                });

            if (uploadError) {
                console.error('Driver Storage Upload Error:', uploadError);
                throw new Error(`Error de Storage: ${uploadError.message}`);
            }

            const { data: { publicUrl } } = supabase.storage
                .from('fleet_photos')
                .getPublicUrl(filePath);

            const { error: dbError } = await supabase.from('legal_documents').insert({
                entity_type: entityType,
                entity_id: entityId,
                doc_type: docType,
                expiration_date: expDate,
                file_url: publicUrl,
                metadata: {
                    source: 'dashboard_driver_upload',
                    uploaded_at: new Date().toISOString(),
                    original_name: file.name
                }
            });

            if (dbError) {
                console.error('Driver Database Document Error:', dbError);
                throw new Error(`Error de Base de Datos: ${dbError.message}`);
            }

            alert('✅ Documento cargado correctamente.');
            setExpDate('');
            onRefresh();
        } catch (err: any) {
            console.error('Detailed Driver Upload Error:', err);
            alert(`Error: ${err.message}`);
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (docId: string, fileUrl?: string) => {
        if (!confirm('¿Estás seguro de eliminar este documento?')) return;
        try {
            if (fileUrl) {
                const pathParts = fileUrl.split('/storage/v1/object/public/fleet_photos/');
                if (pathParts.length > 1) {
                    await supabase.storage.from('fleet_photos').remove([decodeURIComponent(pathParts[1])]);
                }
            }
            const { error } = await supabase.from('legal_documents').delete().eq('id', docId);
            if (error) throw error;
            alert('✅ Documento eliminado.');
            onRefresh();
        } catch (err: any) { alert(`Error al eliminar: ${err.message}`); }
    };

    const getStatus = (date: string) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const exp = new Date(date);
        const diff = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diff < 0) return { label: 'Vencido', color: 'text-rose-600 bg-rose-50 border-rose-100', icon: AlertTriangle };
        if (diff <= 30) return { label: 'Vence Pronto', color: 'text-amber-600 bg-amber-50 border-amber-100', icon: AlertTriangle };
        return { label: 'Al día', color: 'text-emerald-600 bg-emerald-50 border-emerald-100', icon: CheckCircle };
    };

    return (
        <div className="bg-slate-50 border border-slate-100 rounded-[32px] p-8 flex flex-col gap-6">
            <div className="flex justify-between items-center">
                <h4 className="font-black text-slate-900 uppercase tracking-tight text-sm">{label}</h4>
                {latestDoc && (
                    <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border flex items-center gap-1.5 ${getStatus(latestDoc.expiration_date).color}`}>
                        {getStatus(latestDoc.expiration_date).label}
                    </span>
                )}
            </div>

            {latestDoc ? (
                <div className="bg-white p-5 rounded-2xl border border-slate-100 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Vencimiento</p>
                        <p className="font-black text-slate-800 flex items-center gap-2 text-sm">
                            <Calendar className="w-4 h-4 text-blue-500" />
                            {latestDoc.expiration_date}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <a href={latestDoc.file_url} target="_blank" rel="noopener noreferrer" className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                            <ExternalLink className="w-5 h-5" />
                        </a>
                        <button
                            onClick={() => handleDelete(latestDoc.id, latestDoc.file_url)}
                            className="p-3 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            ) : (
                <div className="bg-white/50 p-6 rounded-2xl border border-dashed border-slate-200 text-center">
                    <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                    <p className="text-[10px] font-bold text-slate-400 italic">No hay licencia registrada</p>
                </div>
            )}

            <div className="space-y-4 pt-4 border-t border-slate-200/50">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                    Carga Manual {analyzing && <span className="ml-2 text-blue-500 animate-pulse tracking-normal">Analizando con IA...</span>}
                </p>
                <div className="flex flex-col gap-3">
                    <input
                        type="date"
                        value={expDate}
                        onChange={(e) => setExpDate(e.target.value)}
                        className="px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/10"
                    />
                    <div className="flex gap-2">
                        <label className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-slate-50 cursor-pointer transition-all shadow-sm">
                            <Upload className="w-4 h-4" />
                            Seleccionar
                            <input type="file" className="hidden" onChange={handleFileSelect} accept="image/*,application/pdf" />
                        </label>
                        <button
                            onClick={handleUpload}
                            disabled={uploading || !expDate || !selectedFile}
                            className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-slate-800 disabled:opacity-50 transition-all shadow-md"
                        >
                            {uploading ? 'Cargando...' : 'Subir Documento'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}