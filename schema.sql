-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: Users (Drivers and Admins)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telegram_id BIGINT UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT CHECK (role IN ('admin', 'driver')) DEFAULT 'driver',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Table: Vehicles
CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plate TEXT UNIQUE NOT NULL,
    brand TEXT,
    line TEXT,
    model TEXT,
    location TEXT,
    status TEXT DEFAULT 'Activo', -- 'Activo', 'Inactivo', 'Mantenimiento'
    main_driver TEXT,
    image_url TEXT,
    current_odometer INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Table: Driver Assignments (Who is driving what?)
CREATE TABLE driver_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID REFERENCES users(id),
    vehicle_id UUID REFERENCES vehicles(id),
    role TEXT CHECK (role IN ('principal', 'adicional')) DEFAULT 'principal',
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    is_active BOOLEAN DEFAULT TRUE
);

-- Table: Route Records (Start/End Shifts)
CREATE TABLE route_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID REFERENCES users(id),
    vehicle_id UUID REFERENCES vehicles(id),
    activity_type TEXT CHECK (activity_type IN ('start', 'end')),
    odometer INTEGER NOT NULL,
    photo_url TEXT,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Table: Fuel Records (Tanqueo)
CREATE TABLE fuel_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID REFERENCES users(id),
    vehicle_id UUID REFERENCES vehicles(id),
    gallons NUMERIC(10, 2),
    cost_total NUMERIC(12, 2),
    price_per_gallon NUMERIC(10, 2),
    mileage INTEGER, -- Odometer at refill
    station_name TEXT,
    photo_url TEXT,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Table: Verifications (Daily Checklists)
CREATE TABLE verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID REFERENCES users(id),
    vehicle_id UUID REFERENCES vehicles(id),
    passed BOOLEAN, -- True if all critical checks passed
    comments TEXT,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Table: Verification Details (Individual answers)
CREATE TABLE verification_details (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    verification_id UUID REFERENCES verifications(id),
    question_text TEXT NOT NULL,
    answer TEXT CHECK (answer IN ('BIEN', 'MAL', 'N/A')),
    is_critical BOOLEAN DEFAULT FALSE
);

-- Table: Maintenance Rules (For Alert System)
CREATE TABLE maintenance_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL, -- e.g., "Cambio de Aceite"
    interval_km INTEGER NOT NULL, -- e.g., 5000
    description TEXT
);

-- Table: Maintenance Alerts
CREATE TABLE maintenance_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicle_id UUID REFERENCES vehicles(id),
    rule_id UUID REFERENCES maintenance_rules(id),
    status TEXT CHECK (status IN ('active', 'scheduled', 'resolved')) DEFAULT 'active',
    triggered_at_km INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Table: Legal Documents (SOAT, Licencias, etc.)
CREATE TABLE legal_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type TEXT CHECK (entity_type IN ('vehicle', 'driver')) NOT NULL,
    entity_id UUID NOT NULL, -- References vehicles(id) or users(id)
    doc_type TEXT CHECK (doc_type IN ('SOAT', 'Tecno', 'Licencia', 'Otros', 'Tarjeta de Operación', 'Póliza')) NOT NULL,
    expiration_date DATE NOT NULL,
    document_number TEXT,
    issuer TEXT,
    file_url TEXT,
    metadata JSONB DEFAULT '{}',
    alert_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
