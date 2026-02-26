
-- 1. Tabla de Historial de Mantenimiento Detallado
CREATE TABLE IF NOT EXISTS public.maintenance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE,
    manager_id UUID REFERENCES public.users(id), -- Admin que registra
    status_change_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
    mileage_at_event NUMERIC NOT NULL,
    activity_performed TEXT NOT NULL,
    workshop_name TEXT NOT NULL,
    observations TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Tabla de Incidentes y Accidentes
CREATE TABLE IF NOT EXISTS public.incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES public.users(id),
    event_date DATE NOT NULL,
    event_time TIME NOT NULL,
    event_type TEXT NOT NULL, -- 'Accidente', 'Incidente', 'Falla Técnica'
    component_affected TEXT, -- 'Motor', 'Chapa', 'Llantas', etc.
    observations TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Habilitar RLS
ALTER TABLE public.maintenance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de Acceso Total para Usuarios Autenticados
CREATE POLICY "Full access on maintenance_logs" ON public.maintenance_logs 
FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Full access on incidents" ON public.incidents 
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Comentario de documentación
COMMENT ON TABLE public.maintenance_logs IS 'Historial detallado de mantenimiento cuando un vehículo entra a taller.';
COMMENT ON TABLE public.incidents IS 'Registro de accidentes e incidentes operativos de la flota.';
