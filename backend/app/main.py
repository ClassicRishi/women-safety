from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid
import math
import httpx

app = FastAPI(title="Women Safety SOS API")

# Disable CORS. Do not remove this for full-stack development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# ── In-memory data stores ──────────────────────────────────────────────
contacts_db: dict[str, dict] = {}
sos_alerts_db: dict[str, dict] = {}
tracking_sessions_db: dict[str, dict] = {}

# ── Pydantic models ────────────────────────────────────────────────────

class ContactCreate(BaseModel):
    name: str
    phone: str
    relationship: Optional[str] = None

class ContactOut(ContactCreate):
    id: str

class SOSRequest(BaseModel):
    latitude: float
    longitude: float
    message: Optional[str] = "Emergency! I need help!"

class SOSOut(BaseModel):
    id: str
    latitude: float
    longitude: float
    message: str
    timestamp: str
    contacts_notified: list[str]

class TrackingUpdate(BaseModel):
    session_id: str
    latitude: float
    longitude: float

class TrackingStartRequest(BaseModel):
    latitude: float
    longitude: float

class TrackingSession(BaseModel):
    session_id: str
    is_active: bool
    started_at: str
    locations: list[dict]

class RouteRequest(BaseModel):
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float

class SafetyZone(BaseModel):
    name: str
    latitude: float
    longitude: float
    type: str

# ── Pre-populated safety zones (sample data for demo) ──────────────────
safety_zones: list[dict] = [
    {"name": "Central Police Station", "latitude": 28.6139, "longitude": 77.2090, "type": "police_station"},
    {"name": "City Hospital", "latitude": 28.6200, "longitude": 77.2150, "type": "hospital"},
    {"name": "Fire Station No. 1", "latitude": 28.6100, "longitude": 77.2000, "type": "fire_station"},
    {"name": "Women's Help Center", "latitude": 28.6180, "longitude": 77.2050, "type": "safe_zone"},
    {"name": "24/7 Pharmacy", "latitude": 28.6155, "longitude": 77.2120, "type": "safe_zone"},
    {"name": "Metro Station Security", "latitude": 28.6170, "longitude": 77.2080, "type": "safe_zone"},
    {"name": "Community Center", "latitude": 28.6220, "longitude": 77.2030, "type": "safe_zone"},
    {"name": "District Hospital", "latitude": 28.6085, "longitude": 77.2180, "type": "hospital"},
    {"name": "Police Booth - Market", "latitude": 28.6250, "longitude": 77.2100, "type": "police_station"},
    {"name": "Women's Shelter Home", "latitude": 28.6130, "longitude": 77.2200, "type": "safe_zone"},
]


# ── Health check ────────────────────────────────────────────────────────

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


# ── Emergency Contacts ──────────────────────────────────────────────────

@app.get("/api/contacts", response_model=list[ContactOut])
async def list_contacts():
    return list(contacts_db.values())

@app.post("/api/contacts", response_model=ContactOut, status_code=201)
async def add_contact(contact: ContactCreate):
    contact_id = str(uuid.uuid4())
    record = {
        "id": contact_id,
        "name": contact.name,
        "phone": contact.phone,
        "relationship": contact.relationship,
    }
    contacts_db[contact_id] = record
    return record

@app.delete("/api/contacts/{contact_id}")
async def delete_contact(contact_id: str):
    if contact_id not in contacts_db:
        raise HTTPException(status_code=404, detail="Contact not found")
    del contacts_db[contact_id]
    return {"message": "Contact deleted"}


# ── SOS Alerts ──────────────────────────────────────────────────────────

@app.post("/api/sos", response_model=SOSOut, status_code=201)
async def trigger_sos(sos: SOSRequest):
    alert_id = str(uuid.uuid4())
    notified = [c["name"] for c in contacts_db.values()]
    record = {
        "id": alert_id,
        "latitude": sos.latitude,
        "longitude": sos.longitude,
        "message": sos.message or "Emergency! I need help!",
        "timestamp": datetime.utcnow().isoformat(),
        "contacts_notified": notified,
    }
    sos_alerts_db[alert_id] = record
    return record

@app.get("/api/sos/history", response_model=list[SOSOut])
async def sos_history():
    return list(sos_alerts_db.values())


# ── Live Tracking ───────────────────────────────────────────────────────

@app.post("/api/tracking/start", response_model=TrackingSession, status_code=201)
async def start_tracking(req: TrackingStartRequest):
    session_id = str(uuid.uuid4())
    session = {
        "session_id": session_id,
        "is_active": True,
        "started_at": datetime.utcnow().isoformat(),
        "locations": [
            {
                "latitude": req.latitude,
                "longitude": req.longitude,
                "timestamp": datetime.utcnow().isoformat(),
            }
        ],
    }
    tracking_sessions_db[session_id] = session
    return session

@app.post("/api/tracking/update", response_model=TrackingSession)
async def update_tracking(update: TrackingUpdate):
    session = tracking_sessions_db.get(update.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Tracking session not found")
    if not session["is_active"]:
        raise HTTPException(status_code=400, detail="Tracking session is no longer active")
    session["locations"].append(
        {
            "latitude": update.latitude,
            "longitude": update.longitude,
            "timestamp": datetime.utcnow().isoformat(),
        }
    )
    return session

@app.post("/api/tracking/stop")
async def stop_tracking(session_id: str):
    session = tracking_sessions_db.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Tracking session not found")
    session["is_active"] = False
    return {"message": "Tracking stopped", "session_id": session_id}

@app.get("/api/tracking/{session_id}", response_model=TrackingSession)
async def get_tracking(session_id: str):
    session = tracking_sessions_db.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Tracking session not found")
    return session


# ── Route Finding & Safety Routes ───────────────────────────────────────

def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in km between two points."""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def generate_waypoints(
    start_lat: float, start_lng: float, end_lat: float, end_lng: float, num_points: int = 5
) -> list[dict]:
    """Generate intermediate waypoints along a route."""
    waypoints = []
    for i in range(num_points + 1):
        fraction = i / num_points
        lat = start_lat + fraction * (end_lat - start_lat)
        lng = start_lng + fraction * (end_lng - start_lng)
        waypoints.append({"latitude": round(lat, 6), "longitude": round(lng, 6)})
    return waypoints


@app.post("/api/routes/find")
async def find_route(route: RouteRequest):
    distance = haversine(route.start_lat, route.start_lng, route.end_lat, route.end_lng)

    direct_waypoints = generate_waypoints(
        route.start_lat, route.start_lng, route.end_lat, route.end_lng, 8
    )

    nearby_safety = []
    for zone in safety_zones:
        for wp in direct_waypoints:
            d = haversine(wp["latitude"], wp["longitude"], zone["latitude"], zone["longitude"])
            if d < 2.0:
                nearby_safety.append({**zone, "distance_from_route_km": round(d, 2)})
                break

    safety_waypoints = list(direct_waypoints)
    for zone in nearby_safety[:3]:
        mid_idx = len(safety_waypoints) // 2
        safety_waypoints.insert(
            mid_idx,
            {"latitude": zone["latitude"], "longitude": zone["longitude"]},
        )

    return {
        "direct_route": {
            "waypoints": direct_waypoints,
            "distance_km": round(distance, 2),
            "estimated_time_min": round(distance / 0.5 * 10, 1),
        },
        "safety_route": {
            "waypoints": safety_waypoints,
            "distance_km": round(distance * 1.15, 2),
            "estimated_time_min": round(distance * 1.15 / 0.5 * 10, 1),
            "safety_zones_on_route": nearby_safety,
        },
        "nearby_safety_zones": nearby_safety,
    }


@app.get("/api/geocode")
async def geocode_place(query: str):
    """Convert a place name to latitude/longitude using OpenStreetMap Nominatim."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": query, "format": "json", "limit": 5},
            headers={"User-Agent": "SafeHer-WomenSOS/1.0"},
        )
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail="Geocoding service unavailable")
        results = response.json()
        if not results:
            raise HTTPException(status_code=404, detail="Place not found")
        return [
            {
                "display_name": r.get("display_name", ""),
                "latitude": float(r["lat"]),
                "longitude": float(r["lon"]),
            }
            for r in results
        ]


@app.get("/api/safety-zones")
async def get_safety_zones():
    return safety_zones


@app.get("/api/safety-zones/nearby")
async def get_nearby_safety_zones(latitude: float, longitude: float, radius_km: float = 5.0):
    nearby = []
    for zone in safety_zones:
        d = haversine(latitude, longitude, zone["latitude"], zone["longitude"])
        if d <= radius_km:
            nearby.append({**zone, "distance_km": round(d, 2)})
    nearby.sort(key=lambda x: x["distance_km"])
    return nearby
