from datetime import datetime
from typing import Optional, Literal
from uuid import UUID
from pydantic import BaseModel, Field

class User(BaseModel):
    id: Optional[UUID] = None
    telegram_id: int
    full_name: str
    role: Literal['admin', 'driver'] = 'driver'
    company_id: Optional[UUID] = None
    created_at: Optional[datetime] = None

class Vehicle(BaseModel):
    id: Optional[UUID] = None
    plate: str
    brand: Optional[str] = None
    line: Optional[str] = None
    model: Optional[str] = None
    location: Optional[str] = None
    status: str = 'Activo' # 'Activo', 'Inactivo', 'Mantenimiento'
    main_driver: Optional[str] = None
    current_odometer: int = 0
    created_at: Optional[datetime] = None

class FuelRecord(BaseModel):
    id: Optional[UUID] = None
    driver_id: UUID
    vehicle_id: UUID
    gallons: float
    cost_total: float
    price_per_gallon: float
    mileage: int
    station_name: Optional[str] = None
    photo_url: Optional[str] = None
    recorded_at: Optional[datetime] = None

class RouteRecord(BaseModel):
    id: Optional[UUID] = None
    driver_id: UUID
    vehicle_id: UUID
    activity_type: Literal['start', 'end']
    odometer: int
    photo_url: Optional[str] = None
    recorded_at: Optional[datetime] = None

class Verification(BaseModel):
    id: Optional[UUID] = None
    driver_id: UUID
    vehicle_id: UUID
    passed: bool
    comments: Optional[str] = None
    recorded_at: Optional[datetime] = None
