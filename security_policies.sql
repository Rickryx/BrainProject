
-- 1. Habilitar RLS en todas las tablas
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;

-- 2. Políticas de Acceso para producción
CREATE POLICY "Authenticated users can read all vehicles" ON vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all users" ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all assignments" ON driver_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all routes" ON route_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all fuel" ON fuel_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all verifications" ON verifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all details" ON verification_details FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all rules" ON maintenance_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all alerts" ON maintenance_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read all docs" ON legal_documents FOR SELECT TO authenticated USING (true);

-- 3. Permisos de Escritura (Insert/Update/Delete)
CREATE POLICY "Full access on route_records" ON route_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Full access on fuel_records" ON fuel_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Full access on verifications" ON verifications FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Full access on verification_details" ON verification_details FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Full access on legal_documents" ON legal_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Full access on vehicles" ON vehicles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Full access on users" ON users FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Full access on driver_assignments" ON driver_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);
