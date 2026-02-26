-- ================================================================
-- MIGRACIÓN MULTI-TENANT — Floti / BrainProject
-- Ejecutar completo en Supabase SQL Editor
-- ================================================================

-- 1. Tabla de empresas (tenants)
CREATE TABLE IF NOT EXISTS public.companies (
    id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Tabla de miembros del dashboard (vincula auth.users → companies)
CREATE TABLE IF NOT EXISTS public.company_members (
    auth_user_id UUID NOT NULL,
    company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    role         TEXT CHECK (role IN ('admin', 'viewer')) DEFAULT 'admin',
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT now(),
    PRIMARY KEY (auth_user_id, company_id)
);

-- 3. Empresa default para datos existentes
INSERT INTO public.companies (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Empresa Inicial')
ON CONFLICT DO NOTHING;

-- 4. Agregar company_id a todas las tablas de datos
ALTER TABLE public.users                ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.vehicles             ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.driver_assignments   ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.route_records        ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.fuel_records         ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.verifications        ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.verification_details ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.maintenance_rules    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.maintenance_alerts   ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.legal_documents      ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);

-- Tablas opcionales (si existen en tu instancia)
DO $$ BEGIN
    ALTER TABLE public.maintenance_logs ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- 5. Migrar todos los datos existentes a la empresa default
UPDATE public.users                SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.vehicles             SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.driver_assignments   SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.route_records        SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.fuel_records         SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.verifications        SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.verification_details SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.maintenance_rules    SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.maintenance_alerts   SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.legal_documents      SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;

-- 6. Hacer company_id NOT NULL en tablas principales
ALTER TABLE public.users              ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.vehicles           ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.driver_assignments ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.route_records      ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.fuel_records       ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.verifications      ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.maintenance_alerts ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.legal_documents    ALTER COLUMN company_id SET NOT NULL;

-- 7. RLS en nuevas tablas
ALTER TABLE public.companies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- 8. Función helper: obtener company_id del usuario autenticado del dashboard
CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT company_id
  FROM public.company_members
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$;

-- 9. Reemplazar políticas permisivas por aislamiento real

-- Companies
DROP POLICY IF EXISTS "companies_select"  ON public.companies;
DROP POLICY IF EXISTS "companies_insert"  ON public.companies;
CREATE POLICY "companies_select" ON public.companies FOR SELECT TO authenticated USING (id = get_my_company_id());
CREATE POLICY "companies_insert" ON public.companies FOR INSERT TO authenticated WITH CHECK (true);

-- Company members
DROP POLICY IF EXISTS "company_members_select" ON public.company_members;
DROP POLICY IF EXISTS "company_members_insert" ON public.company_members;
CREATE POLICY "company_members_select" ON public.company_members FOR SELECT TO authenticated USING (company_id = get_my_company_id() OR auth_user_id = auth.uid());
CREATE POLICY "company_members_insert" ON public.company_members FOR INSERT TO authenticated WITH CHECK (auth_user_id = auth.uid());

-- Users (conductores del bot)
DROP POLICY IF EXISTS "Authenticated users can read all users" ON public.users;
DROP POLICY IF EXISTS "Full access on users"                   ON public.users;
DROP POLICY IF EXISTS "users_company_isolation"               ON public.users;
CREATE POLICY "users_company_isolation" ON public.users FOR ALL TO authenticated
USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());

-- Vehicles
DROP POLICY IF EXISTS "Authenticated users can read all vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Full access on vehicles"                   ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_company_isolation"               ON public.vehicles;
CREATE POLICY "vehicles_company_isolation" ON public.vehicles FOR ALL TO authenticated
USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());

-- Driver assignments
DROP POLICY IF EXISTS "Authenticated users can read all assignments" ON public.driver_assignments;
DROP POLICY IF EXISTS "Full access on driver_assignments"           ON public.driver_assignments;
DROP POLICY IF EXISTS "driver_assignments_company_isolation"        ON public.driver_assignments;
CREATE POLICY "driver_assignments_company_isolation" ON public.driver_assignments FOR ALL TO authenticated
USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());

-- Route records
DROP POLICY IF EXISTS "Authenticated users can read all routes" ON public.route_records;
DROP POLICY IF EXISTS "Full access on route_records"           ON public.route_records;
DROP POLICY IF EXISTS "route_records_company_isolation"        ON public.route_records;
CREATE POLICY "route_records_company_isolation" ON public.route_records FOR ALL TO authenticated
USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());

-- Fuel records
DROP POLICY IF EXISTS "Authenticated users can read all fuel" ON public.fuel_records;
DROP POLICY IF EXISTS "Full access on fuel_records"          ON public.fuel_records;
DROP POLICY IF EXISTS "fuel_records_company_isolation"       ON public.fuel_records;
CREATE POLICY "fuel_records_company_isolation" ON public.fuel_records FOR ALL TO authenticated
USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());

-- Verifications
DROP POLICY IF EXISTS "Authenticated users can read all verifications" ON public.verifications;
DROP POLICY IF EXISTS "Full access on verifications"                   ON public.verifications;
DROP POLICY IF EXISTS "verifications_company_isolation"               ON public.verifications;
CREATE POLICY "verifications_company_isolation" ON public.verifications FOR ALL TO authenticated
USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());

-- Verification details (usa JOIN para no requerir company_id en bot)
DROP POLICY IF EXISTS "Authenticated users can read all details"  ON public.verification_details;
DROP POLICY IF EXISTS "Full access on verification_details"       ON public.verification_details;
DROP POLICY IF EXISTS "verification_details_company_isolation"    ON public.verification_details;
CREATE POLICY "verification_details_company_isolation" ON public.verification_details FOR ALL TO authenticated
USING (
    verification_id IN (
        SELECT id FROM public.verifications WHERE company_id = get_my_company_id()
    )
);

-- Maintenance rules (pueden ser globales o por empresa)
DROP POLICY IF EXISTS "Authenticated users can read all rules" ON public.maintenance_rules;
DROP POLICY IF EXISTS "maintenance_rules_company_isolation"   ON public.maintenance_rules;
CREATE POLICY "maintenance_rules_company_isolation" ON public.maintenance_rules FOR ALL TO authenticated
USING (company_id IS NULL OR company_id = get_my_company_id())
WITH CHECK (company_id = get_my_company_id());

-- Maintenance alerts
DROP POLICY IF EXISTS "Authenticated users can read all alerts" ON public.maintenance_alerts;
DROP POLICY IF EXISTS "maintenance_alerts_company_isolation"   ON public.maintenance_alerts;
CREATE POLICY "maintenance_alerts_company_isolation" ON public.maintenance_alerts FOR ALL TO authenticated
USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());

-- Legal documents
DROP POLICY IF EXISTS "Authenticated users can read all docs" ON public.legal_documents;
DROP POLICY IF EXISTS "Full access on legal_documents"        ON public.legal_documents;
DROP POLICY IF EXISTS "legal_documents_company_isolation"     ON public.legal_documents;
CREATE POLICY "legal_documents_company_isolation" ON public.legal_documents FOR ALL TO authenticated
USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());

-- ================================================================
-- PASO MANUAL DESPUÉS DE EJECUTAR ESTE SCRIPT
--
-- Vincula tu usuario administrador a la empresa default.
-- Primero obtén tu UUID de auth:
--
--   SELECT id, email FROM auth.users;
--
-- Luego ejecuta (reemplaza el UUID):
--
--   INSERT INTO company_members (auth_user_id, company_id, role)
--   VALUES ('TU-UUID-AQUI', '00000000-0000-0000-0000-000000000001', 'admin')
--   ON CONFLICT DO NOTHING;
--
-- Si tienes más admins, repite el INSERT para cada uno.
-- ================================================================
