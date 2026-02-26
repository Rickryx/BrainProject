'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { supabase } from '@/lib/supabase';
import { FileText, AlertTriangle, CheckCircle, Car, User, Search, ExternalLink, Calendar, Plus, X, Upload, Trash2, Edit2 } from 'lucide-react';

export default function DocumentsPage() {
    const [documents, setDocuments] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [analyzingDoc, setAnalyzingDoc] = useState(false);
    const [newDoc, setNewDoc] = useState({
        entity_type: 'vehicle',
        entity_id: '',
        doc_type: 'SOAT',
        expiration_date: '',
        document_number: '',
        issuer: '',
        file: null as File | null
    });

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        setLoading(true);
        const { data: dData } = await supabase.from('legal_documents').select('*').order('expiration_date', { ascending: true });
        const { data: uData } = await supabase.from('users').select('id, full_name');
        const { data: vData } = await supabase.from('vehicles').select('id, plate, brand, line');

        setDocuments(dData || []);
        setUsers(uData || []);
        setVehicles(vData || []);
        setLoading(false);
    }

    async function handleFileChange(file: File) {
        if (!file) return;
        setNewDoc(prev => ({ ...prev, file }));
        setAnalyzingDoc(true);

        try {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64 = (reader.result as string).split(',')[1];
                const res = await fetch('/api/analyze-doc', {
                    method: 'POST',
                    body: JSON.stringify({ image: base64, docType: newDoc.doc_type })
                });
                const data = await res.json();
                if (data.expiration_date) {
                    setNewDoc(prev => ({
                        ...prev,
                        expiration_date: data.expiration_date,
                        document_number: data.document_number || '',
                        issuer: data.issuer || ''
                    }));
                }
            };
        } catch (error) {
            console.error('Error analyzing document:', error);
        } finally {
            setAnalyzingDoc(false);
        }
    }

    const [editingDoc, setEditingDoc] = useState<any>(null);

    async function handleDeleteDocument(doc: any) {
        if (!confirm(`¿Estás seguro de eliminar el documento "${doc.doc_type}"? Esta acción no se puede deshacer.`)) return;

        try {
            // 1. Delete from Storage if it's a manual upload
            if (doc.file_url) {
                const pathParts = doc.file_url.split('/storage/v1/object/public/fleet_photos/');
                if (pathParts.length > 1) {
                    const filePath = decodeURIComponent(pathParts[1]);
                    console.log('Deleting from storage:', filePath);
                    await supabase.storage.from('fleet_photos').remove([filePath]);
                }
            }

            // 2. Delete from Database
            const { error } = await supabase.from('legal_documents').delete().eq('id', doc.id);
            if (error) throw error;

            alert('✅ Documento eliminado correctamente.');
            fetchData();
        } catch (err: any) {
            alert(`Error al eliminar: ${err.message}`);
        }
    }

    async function handleEditDate(e: React.FormEvent) {
        e.preventDefault();
        if (!editingDoc) return;

        try {
            const { error } = await supabase
                .from('legal_documents')
                .update({ expiration_date: editingDoc.expiration_date })
                .eq('id', editingDoc.id);

            if (error) throw error;

            alert('✅ Fecha actualizada correctamente.');
            setEditingDoc(null);
            fetchData();
        } catch (err: any) {
            alert(`Error al actualizar: ${err.message}`);
        }
    }

    async function handleGlobalUpload(e: React.FormEvent) {
        e.preventDefault();
        if (!newDoc.entity_id || !newDoc.expiration_date || !newDoc.file) {
            alert('Por favor completa todos los campos.');
            return;
        }

        setUploading(true);
        try {
            const file = newDoc.file;
            const fileExt = file.name.split('.').pop();
            // Normalize doc type for filename
            const safeDocType = newDoc.doc_type.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '_');
            const fileName = `${newDoc.entity_id}_${safeDocType}_${Date.now()}.${fileExt}`;
            const filePath = `manual_docs/${fileName}`;

            console.log('--- GLOBAL UPLOAD DEBUG ---');
            console.log('Entity Type:', newDoc.entity_type);
            console.log('Entity ID:', newDoc.entity_id);
            console.log('Doc Type (Category):', newDoc.doc_type);
            console.log('---------------------------');

            const { error: uploadError } = await supabase.storage
                .from('fleet_photos')
                .upload(filePath, file, {
                    upsert: true,
                    contentType: file.type
                });

            if (uploadError) {
                console.error('Global Storage Upload Error:', uploadError);
                throw new Error(`Error de Storage: ${uploadError.message}`);
            }

            const { data: { publicUrl } } = supabase.storage
                .from('fleet_photos')
                .getPublicUrl(filePath);

            const { error: dbError } = await supabase.from('legal_documents').insert({
                entity_type: newDoc.entity_type,
                entity_id: newDoc.entity_id,
                doc_type: newDoc.doc_type,
                expiration_date: newDoc.expiration_date,
                document_number: newDoc.document_number,
                issuer: newDoc.issuer,
                file_url: publicUrl,
                metadata: {
                    source: 'dashboard_global_upload',
                    uploaded_at: new Date().toISOString(),
                    original_name: file.name
                }
            });

            if (dbError) {
                console.error('Global Database Document Error:', dbError);
                throw new Error(`Error de Base de Datos: ${dbError.message}`);
            }

            alert('✅ Documento cargado correctamente.');
            setIsUploadModalOpen(false);
            setNewDoc({ entity_type: 'vehicle', entity_id: '', doc_type: 'SOAT', expiration_date: '', document_number: '', issuer: '', file: null });
            fetchData();
        } catch (err: any) {
            console.error('Detailed Global Upload Error:', err);
            alert(`Error: ${err.message}`);
        } finally {
            setUploading(false);
        }
    }

    const getEntityName = (doc: any) => {
        if (doc.entity_type === 'vehicle') {
            const v = vehicles.find(v => v.id === doc.entity_id);
            return v ? `${v.plate} - ${v.brand} ${v.line}` : 'Vehículo no encontrado';
        } else {
            const u = users.find(u => u.id === doc.entity_id);
            return u ? u.full_name : 'Conductor no encontrado';
        }
    };

    const getStatus = (expirationDate: string) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const exp = new Date(expirationDate);
        const diffTime = exp.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return { label: 'Vencido', color: 'bg-rose-100 text-rose-700 border-rose-200', icon: AlertTriangle };
        if (diffDays <= 30) return { label: 'Próximo a Vencer', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: AlertTriangle };
        return { label: 'Al día', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle };
    };

    const filteredDocs = documents.filter(doc => {
        const entityName = getEntityName(doc).toLowerCase();
        return entityName.includes(searchTerm.toLowerCase()) || doc.doc_type.toLowerCase().includes(searchTerm.toLowerCase());
    });

    return (
        <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-4 md:p-12">
                <header className="mb-12 flex justify-between items-center">
                    <div>
                        <h2 className="text-4xl font-black text-slate-900 tracking-tight leading-none mb-3">Documentación Legal</h2>
                        <p className="text-slate-500 font-bold text-lg">Control de vencimientos de SOAT, Tecnomecánica y Licencias</p>
                    </div>
                    <button
                        onClick={() => setIsUploadModalOpen(true)}
                        className="flex items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-[24px] font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95"
                    >
                        <Plus className="w-5 h-5" />
                        Nuevo Documento
                    </button>
                </header>

                <div className="mb-12 relative max-w-xl">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 w-6 h-6" />
                    <input
                        type="text"
                        placeholder="Buscar por placa, conductor o tipo de documento..."
                        className="w-full pl-16 pr-8 py-5 bg-white border border-slate-200 rounded-[28px] shadow-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-slate-700 placeholder:text-slate-300"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 grayscale opacity-50">
                        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="font-black uppercase tracking-widest text-xs">Cargando Documentos...</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left font-sans">
                                <thead className="bg-[#fbfeff] text-slate-400 text-[10px] font-black uppercase tracking-[2px]">
                                    <tr>
                                        <th className="px-10 py-6 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Documento</th>
                                        <th className="px-10 py-6 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Nro / Entidad</th>
                                        <th className="px-10 py-6 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Asociado</th>
                                        <th className="px-10 py-6 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Vencimiento</th>
                                        <th className="px-10 py-6 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Estado</th>
                                        <th className="px-10 py-6 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {filteredDocs.length > 0 ? filteredDocs.map((doc) => {
                                        const status = getStatus(doc.expiration_date);
                                        const StatusIcon = status.icon;
                                        return (
                                            <tr key={doc.id} className="group hover:bg-slate-50/50 transition-all">
                                                <td className="px-10 py-8">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${doc.entity_type === 'vehicle' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                                                            <FileText className="w-6 h-6" />
                                                        </div>
                                                        <div>
                                                            <p className="font-black text-slate-900 uppercase tracking-tight text-sm">{doc.doc_type}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-10 py-6">
                                                    <div className="space-y-1">
                                                        <p className="font-bold text-slate-700 text-sm whitespace-nowrap">{doc.document_number || '---'}</p>
                                                        <p className="text-[10px] text-slate-400 font-medium truncate max-w-[150px]">{doc.issuer || '---'}</p>
                                                    </div>
                                                </td>
                                                <td className="px-10 py-6">
                                                    <div className="flex items-center gap-2">
                                                        {doc.entity_type === 'vehicle' ? <Car className="w-4 h-4 text-slate-400" /> : <User className="w-4 h-4 text-slate-400" />}
                                                        <span className="font-bold text-slate-600">{getEntityName(doc)}</span>
                                                    </div>
                                                </td>
                                                <td className="px-10 py-6">
                                                    <div className="flex items-center gap-2 font-black text-slate-700">
                                                        <Calendar className="w-4 h-4 text-slate-300" />
                                                        {doc.expiration_date}
                                                    </div>
                                                </td>
                                                <td className="px-10 py-6">
                                                    <span className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${status.color}`}>
                                                        <StatusIcon className="w-3.5 h-3.5" />
                                                        {status.label}
                                                    </span>
                                                </td>
                                                <td className="px-10 py-6 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        {doc.file_url && (
                                                            <a
                                                                href={doc.file_url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-900 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                                                            >
                                                                <ExternalLink className="w-4 h-4" />
                                                                Ver
                                                            </a>
                                                        )}
                                                        <button
                                                            onClick={() => setEditingDoc(doc)}
                                                            className="p-3 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                                        >
                                                            <Edit2 className="w-5 h-5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteDocument(doc)}
                                                            className="p-3 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                                                        >
                                                            <Trash2 className="w-5 h-5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    }) : (
                                        <tr>
                                            <td colSpan={5} className="px-10 py-20 text-center text-slate-300">
                                                <FileText className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                                <p className="font-bold">No se encontraron documentos registrados.</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>
            {/* Upload Modal */}
            {isUploadModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-[40px] w-full max-w-xl shadow-2xl border border-white p-10 space-y-8">
                        <div className="flex justify-between items-center">
                            <h3 className="text-3xl font-black text-slate-900 tracking-tight">Cargar Documento</h3>
                            <button onClick={() => setIsUploadModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-all">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <form onSubmit={handleGlobalUpload} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Tipo de Asociado</label>
                                <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                                    <button
                                        type="button"
                                        onClick={() => setNewDoc({ ...newDoc, entity_type: 'vehicle', entity_id: '', doc_type: 'SOAT' })}
                                        className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${newDoc.entity_type === 'vehicle' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
                                    >
                                        Vehículo
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setNewDoc({ ...newDoc, entity_type: 'driver', entity_id: '', doc_type: 'Licencia' })}
                                        className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${newDoc.entity_type === 'driver' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
                                    >
                                        Conductor
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                                    {newDoc.entity_type === 'vehicle' ? 'Seleccionar Vehículo' : 'Seleccionar Conductor'}
                                </label>
                                <select
                                    required
                                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-700 outline-none appearance-none"
                                    value={newDoc.entity_id}
                                    onChange={e => setNewDoc({ ...newDoc, entity_id: e.target.value })}
                                >
                                    <option value="">Seleccionar...</option>
                                    {newDoc.entity_type === 'vehicle'
                                        ? vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} - {v.line}</option>)
                                        : users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)
                                    }
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Tipo Doc</label>
                                    <select
                                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-700 outline-none appearance-none"
                                        value={newDoc.doc_type}
                                        onChange={e => setNewDoc({ ...newDoc, doc_type: e.target.value })}
                                    >
                                        {newDoc.entity_type === 'vehicle' ? (
                                            <>
                                                <option value="SOAT">SOAT</option>
                                                <option value="Tecno">Tecno</option>
                                                <option value="Tarjeta de Operación">Tarjeta Operación</option>
                                                <option value="Póliza">Póliza</option>
                                            </>
                                        ) : (
                                            <>
                                                <option value="Licencia">Licencia</option>
                                                <option value="Otros">Otros</option>
                                            </>
                                        )}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Vencimiento</label>
                                    <input
                                        required
                                        type="date"
                                        className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                                        value={newDoc.expiration_date}
                                        onChange={e => setNewDoc({ ...newDoc, expiration_date: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                                    Archivo (Imagen o PDF)
                                    {analyzingDoc && <span className="ml-2 text-blue-500 animate-pulse">Analizando con IA...</span>}
                                </label>
                                <label className="flex items-center justify-center gap-3 px-6 py-8 bg-slate-50 border-2 border-dashed border-slate-200 text-slate-400 rounded-3xl font-bold cursor-pointer hover:bg-blue-50 hover:border-blue-200 transition-all">
                                    <Upload className="w-6 h-6" />
                                    <span>{newDoc.file ? newDoc.file.name : 'Click para subir archivo'}</span>
                                    <input
                                        type="file"
                                        className="hidden"
                                        accept="image/*,application/pdf"
                                        onChange={e => {
                                            const file = e.target.files?.[0];
                                            if (file) handleFileChange(file);
                                        }}
                                    />
                                </label>
                            </div>

                            <button
                                type="submit"
                                disabled={uploading}
                                className="w-full py-5 bg-blue-600 text-white rounded-[22px] font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 disabled:opacity-50"
                            >
                                {uploading ? 'Cargando...' : 'Cargar Documento'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
            {/* Edit Modal */}
            {editingDoc && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-[40px] w-full max-w-md shadow-2xl border border-white p-10 space-y-8">
                        <div className="flex justify-between items-center">
                            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Editar Vencimiento</h3>
                            <button onClick={() => setEditingDoc(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <form onSubmit={handleEditDate} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">{editingDoc.doc_type} - {getEntityName(editingDoc)}</label>
                                <input
                                    required
                                    type="date"
                                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                                    value={editingDoc.expiration_date}
                                    onChange={e => setEditingDoc({ ...editingDoc, expiration_date: e.target.value })}
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full py-5 bg-slate-900 text-white rounded-[22px] font-black uppercase text-xs tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
                            >
                                Guardar Cambios
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
