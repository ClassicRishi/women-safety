import { useState, useEffect, useCallback, useRef } from "react";
import {
  Shield,
  MapPin,
  Navigation,
  Phone,
  Plus,
  Trash2,
  AlertTriangle,
  Clock,
  Route,
  ShieldCheck,
  X,
  Menu,
  Radio,
  UserPlus,
  History,
  Map,
} from "lucide-react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Circle,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Fix leaflet default marker icons
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const sosIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const safeIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const policeIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const hospitalIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface Contact {
  id: string;
  name: string;
  phone: string;
  relationship: string | null;
}

interface SOSAlert {
  id: string;
  latitude: number;
  longitude: number;
  message: string;
  timestamp: string;
  contacts_notified: string[];
}

interface Location {
  latitude: number;
  longitude: number;
  timestamp?: string;
}

interface TrackingSession {
  session_id: string;
  is_active: boolean;
  started_at: string;
  locations: Location[];
}

interface SafetyZone {
  name: string;
  latitude: number;
  longitude: number;
  type: string;
  distance_km?: number;
  distance_from_route_km?: number;
}

interface RouteResult {
  direct_route: {
    waypoints: Location[];
    distance_km: number;
    estimated_time_min: number;
  };
  safety_route: {
    waypoints: Location[];
    distance_km: number;
    estimated_time_min: number;
    safety_zones_on_route: SafetyZone[];
  };
  nearby_safety_zones: SafetyZone[];
}

type Tab = "sos" | "tracking" | "routes" | "contacts" | "history";

function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

function getZoneIcon(type: string) {
  switch (type) {
    case "police_station":
      return policeIcon;
    case "hospital":
      return hospitalIcon;
    case "fire_station":
      return sosIcon;
    default:
      return safeIcon;
  }
}

function getZoneLabel(type: string) {
  switch (type) {
    case "police_station":
      return "Police";
    case "hospital":
      return "Hospital";
    case "fire_station":
      return "Fire Station";
    default:
      return "Safe Zone";
  }
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("sos");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [sosAlerts, setSosAlerts] = useState<SOSAlert[]>([]);
  const [trackingSession, setTrackingSession] =
    useState<TrackingSession | null>(null);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [safetyZones, setSafetyZones] = useState<SafetyZone[]>([]);
  const [sosTriggered, setSosTriggered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Contact form
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRelationship, setNewRelationship] = useState("");

  // Route form
  const [destLat, setDestLat] = useState("");
  const [destLng, setDestLng] = useState("");
  const [showSafetyRoute, setShowSafetyRoute] = useState(true);

  const trackingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  const showNotification = useCallback((msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // Get current location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCurrentLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        },
        () => {
          setCurrentLocation({ latitude: 28.6139, longitude: 77.209 });
        }
      );
    } else {
      setCurrentLocation({ latitude: 28.6139, longitude: 77.209 });
    }
  }, []);

  // Fetch contacts and safety zones on load
  useEffect(() => {
    fetch(`${API_URL}/api/contacts`)
      .then((r) => r.json())
      .then(setContacts)
      .catch(console.error);
    fetch(`${API_URL}/api/safety-zones`)
      .then((r) => r.json())
      .then(setSafetyZones)
      .catch(console.error);
    fetch(`${API_URL}/api/sos/history`)
      .then((r) => r.json())
      .then(setSosAlerts)
      .catch(console.error);
  }, []);

  // SOS trigger
  const triggerSOS = async () => {
    if (!currentLocation) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/sos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          message: "Emergency! I need help!",
        }),
      });
      const data = await res.json();
      setSosAlerts((prev) => [...prev, data]);
      setSosTriggered(true);
      showNotification(
        `SOS Alert sent! ${data.contacts_notified.length} contacts notified.`
      );
      setTimeout(() => setSosTriggered(false), 3000);
    } catch {
      showNotification("Failed to send SOS. Try again!");
    }
    setLoading(false);
  };

  // Add contact
  const addContact = async () => {
    if (!newName || !newPhone) return;
    try {
      const res = await fetch(`${API_URL}/api/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          phone: newPhone,
          relationship: newRelationship || null,
        }),
      });
      const data = await res.json();
      setContacts((prev) => [...prev, data]);
      setNewName("");
      setNewPhone("");
      setNewRelationship("");
      showNotification("Contact added successfully!");
    } catch {
      showNotification("Failed to add contact.");
    }
  };

  // Delete contact
  const deleteContact = async (id: string) => {
    try {
      await fetch(`${API_URL}/api/contacts/${id}`, { method: "DELETE" });
      setContacts((prev) => prev.filter((c) => c.id !== id));
      showNotification("Contact removed.");
    } catch {
      showNotification("Failed to remove contact.");
    }
  };

  // Start tracking
  const startTracking = async () => {
    if (!currentLocation) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/tracking/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        }),
      });
      const data = await res.json();
      setTrackingSession(data);
      showNotification("Live tracking started!");

      trackingIntervalRef.current = setInterval(async () => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(async (pos) => {
            try {
              const updateRes = await fetch(
                `${API_URL}/api/tracking/update`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    session_id: data.session_id,
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                  }),
                }
              );
              const updated = await updateRes.json();
              setTrackingSession(updated);
              setCurrentLocation({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              });
            } catch {
              /* ignore update errors */
            }
          });
        }
      }, 5000);
    } catch {
      showNotification("Failed to start tracking.");
    }
    setLoading(false);
  };

  // Stop tracking
  const stopTracking = async () => {
    if (!trackingSession) return;
    try {
      await fetch(
        `${API_URL}/api/tracking/stop?session_id=${trackingSession.session_id}`,
        { method: "POST" }
      );
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current);
        trackingIntervalRef.current = null;
      }
      setTrackingSession(null);
      showNotification("Tracking stopped.");
    } catch {
      showNotification("Failed to stop tracking.");
    }
  };

  // Find route
  const findRoute = async () => {
    if (!currentLocation || !destLat || !destLng) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/routes/find`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_lat: currentLocation.latitude,
          start_lng: currentLocation.longitude,
          end_lat: parseFloat(destLat),
          end_lng: parseFloat(destLng),
        }),
      });
      const data = await res.json();
      setRouteResult(data);
      showNotification("Routes found! Safety route highlighted in green.");
    } catch {
      showNotification("Failed to find route.");
    }
    setLoading(false);
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "sos", label: "SOS", icon: <Shield size={20} /> },
    { id: "tracking", label: "Tracking", icon: <Radio size={20} /> },
    { id: "routes", label: "Routes", icon: <Route size={20} /> },
    { id: "contacts", label: "Contacts", icon: <Phone size={20} /> },
    { id: "history", label: "History", icon: <History size={20} /> },
  ];

  if (!currentLocation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-100 flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-16 h-16 text-pink-600 mx-auto animate-pulse" />
          <p className="mt-4 text-lg text-gray-600">
            Getting your location...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-100">
      {/* Notification */}
      {notification && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-pink-600 text-white px-6 py-3 rounded-full shadow-lg animate-bounce">
          {notification}
        </div>
      )}

      {/* Header */}
      <header className="bg-gradient-to-r from-pink-600 to-purple-700 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-8 h-8" />
            <div>
              <h1 className="text-xl font-bold">SafeHer</h1>
              <p className="text-xs text-pink-200">Women Safety SOS System</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-sm bg-white/20 px-3 py-1 rounded-full">
              <MapPin size={14} className="inline mr-1" />
              {currentLocation.latitude.toFixed(4)},{" "}
              {currentLocation.longitude.toFixed(4)}
            </span>
            <button
              className="sm:hidden p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav
          className={`${mobileMenuOpen ? "block" : "hidden"} sm:block border-t border-white/20`}
        >
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? "border-b-2 border-white text-white"
                      : "text-pink-200 hover:text-white"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* SOS TAB */}
        {activeTab === "sos" && (
          <div className="space-y-6">
            <div className="flex flex-col items-center justify-center py-8">
              <button
                onClick={triggerSOS}
                disabled={loading}
                className={`relative w-48 h-48 rounded-full shadow-2xl transition-all duration-300 flex flex-col items-center justify-center ${
                  sosTriggered
                    ? "bg-green-500 scale-95"
                    : "bg-gradient-to-br from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 hover:scale-105 active:scale-95"
                }`}
              >
                {sosTriggered ? (
                  <>
                    <ShieldCheck className="w-16 h-16 text-white" />
                    <span className="text-white font-bold mt-2">ALERT SENT!</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-16 h-16 text-white" />
                    <span className="text-white font-bold text-xl mt-2">SOS</span>
                    <span className="text-red-100 text-xs mt-1">TAP FOR HELP</span>
                  </>
                )}
                {!sosTriggered && (
                  <span className="absolute inset-0 rounded-full animate-ping bg-red-400 opacity-20" />
                )}
              </button>
              <p className="mt-6 text-gray-600 text-center max-w-md">
                One tap to send your location to all emergency contacts and alert nearby safety zones.
              </p>
              {contacts.length === 0 && (
                <p className="mt-2 text-amber-600 text-sm flex items-center gap-1">
                  <AlertTriangle size={14} />
                  Add emergency contacts first for best protection
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-pink-100">
                <div className="flex items-center gap-3">
                  <div className="bg-pink-100 p-2 rounded-lg">
                    <Phone className="w-5 h-5 text-pink-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-800">{contacts.length}</p>
                    <p className="text-xs text-gray-500">Emergency Contacts</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-purple-100">
                <div className="flex items-center gap-3">
                  <div className="bg-purple-100 p-2 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-800">{sosAlerts.length}</p>
                    <p className="text-xs text-gray-500">Alerts Sent</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-green-100">
                <div className="flex items-center gap-3">
                  <div className="bg-green-100 p-2 rounded-lg">
                    <ShieldCheck className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-800">{safetyZones.length}</p>
                    <p className="text-xs text-gray-500">Nearby Safe Zones</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
              <div className="p-3 bg-gray-50 border-b flex items-center gap-2">
                <Map size={16} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Your Location & Nearby Safety Zones</span>
              </div>
              <div className="h-80">
                <MapContainer
                  center={[currentLocation.latitude, currentLocation.longitude]}
                  zoom={14}
                  style={{ height: "100%", width: "100%" }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <RecenterMap lat={currentLocation.latitude} lng={currentLocation.longitude} />
                  <Marker position={[currentLocation.latitude, currentLocation.longitude]}>
                    <Popup><strong>You are here</strong></Popup>
                  </Marker>
                  <Circle
                    center={[currentLocation.latitude, currentLocation.longitude]}
                    radius={500}
                    pathOptions={{ color: "#ec4899", fillColor: "#ec4899", fillOpacity: 0.1 }}
                  />
                  {safetyZones.map((zone, idx) => (
                    <Marker key={idx} position={[zone.latitude, zone.longitude]} icon={getZoneIcon(zone.type)}>
                      <Popup>
                        <strong>{zone.name}</strong><br />{getZoneLabel(zone.type)}
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border border-red-100">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Phone size={16} className="text-red-500" />
                Emergency Helpline Numbers
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { name: "Women Helpline", number: "1091" },
                  { name: "Police", number: "100" },
                  { name: "Ambulance", number: "102" },
                  { name: "National Emergency", number: "112" },
                ].map((item) => (
                  <a
                    key={item.number}
                    href={`tel:${item.number}`}
                    className="bg-red-50 rounded-lg p-3 text-center hover:bg-red-100 transition-colors"
                  >
                    <p className="text-lg font-bold text-red-600">{item.number}</p>
                    <p className="text-xs text-gray-600">{item.name}</p>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TRACKING TAB */}
        {activeTab === "tracking" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Radio size={20} className="text-purple-600" />
                Live Location Tracking
              </h2>
              <p className="text-gray-500 text-sm mb-4">
                Share your real-time location with your emergency contacts. Your path will be tracked and can be shared.
              </p>
              {!trackingSession ? (
                <button
                  onClick={startTracking}
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 rounded-lg font-medium hover:from-purple-700 hover:to-pink-700 transition-all flex items-center justify-center gap-2"
                >
                  <Navigation size={18} />
                  Start Live Tracking
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-green-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-green-700 font-medium text-sm">Tracking Active</span>
                    </div>
                    <span className="text-xs text-green-600">{trackingSession.locations.length} points recorded</span>
                  </div>
                  <button
                    onClick={stopTracking}
                    className="w-full bg-red-500 text-white py-3 rounded-lg font-medium hover:bg-red-600 transition-colors"
                  >
                    Stop Tracking
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
              <div className="p-3 bg-gray-50 border-b flex items-center gap-2">
                <Map size={16} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-700">
                  {trackingSession ? "Live Tracking Map" : "Current Location"}
                </span>
              </div>
              <div className="h-96">
                <MapContainer
                  center={[currentLocation.latitude, currentLocation.longitude]}
                  zoom={15}
                  style={{ height: "100%", width: "100%" }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <RecenterMap lat={currentLocation.latitude} lng={currentLocation.longitude} />
                  <Marker position={[currentLocation.latitude, currentLocation.longitude]}>
                    <Popup>Your current location</Popup>
                  </Marker>
                  {trackingSession && trackingSession.locations.length > 1 && (
                    <Polyline
                      positions={trackingSession.locations.map((l) => [l.latitude, l.longitude])}
                      pathOptions={{ color: "#9333ea", weight: 4 }}
                    />
                  )}
                  {safetyZones.map((zone, idx) => (
                    <Marker key={idx} position={[zone.latitude, zone.longitude]} icon={getZoneIcon(zone.type)}>
                      <Popup>
                        <strong>{zone.name}</strong><br />{getZoneLabel(zone.type)}
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            </div>

            {trackingSession && (
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                <h3 className="font-medium text-gray-700 mb-2">Session Details</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Session ID</p>
                    <p className="font-mono text-xs text-gray-800 truncate">{trackingSession.session_id}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Started</p>
                    <p className="text-gray-800">{new Date(trackingSession.started_at).toLocaleTimeString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Points Tracked</p>
                    <p className="text-gray-800">{trackingSession.locations.length}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Status</p>
                    <p className="text-green-600 font-medium">Active</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ROUTES TAB */}
        {activeTab === "routes" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Route size={20} className="text-blue-600" />
                Route Finder & Safety Routes
              </h2>
              <p className="text-gray-500 text-sm mb-4">
                Enter your destination to find the safest route with nearby police stations, hospitals, and safe zones.
              </p>
              <div className="space-y-3">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">From (Current Location)</p>
                  <p className="text-sm font-medium text-gray-800">
                    {currentLocation.latitude.toFixed(4)}, {currentLocation.longitude.toFixed(4)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Destination Latitude</label>
                    <input
                      type="number"
                      step="any"
                      value={destLat}
                      onChange={(e) => setDestLat(e.target.value)}
                      placeholder="e.g. 28.6250"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pink-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Destination Longitude</label>
                    <input
                      type="number"
                      step="any"
                      value={destLng}
                      onChange={(e) => setDestLng(e.target.value)}
                      placeholder="e.g. 77.2200"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pink-500 focus:border-transparent outline-none"
                    />
                  </div>
                </div>
                <button
                  onClick={findRoute}
                  disabled={loading || !destLat || !destLng}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Navigation size={18} />
                  Find Safe Route
                </button>
              </div>
            </div>

            {routeResult && (
              <>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowSafetyRoute(true)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      showSafetyRoute ? "bg-green-600 text-white" : "bg-white text-gray-600 border border-gray-200"
                    }`}
                  >
                    <ShieldCheck size={16} className="inline mr-1" />
                    Safety Route
                  </button>
                  <button
                    onClick={() => setShowSafetyRoute(false)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      !showSafetyRoute ? "bg-blue-600 text-white" : "bg-white text-gray-600 border border-gray-200"
                    }`}
                  >
                    <Navigation size={16} className="inline mr-1" />
                    Direct Route
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl p-4 shadow-sm border border-green-100">
                    <p className="text-xs text-gray-500 mb-1">Safety Route</p>
                    <p className="text-lg font-bold text-green-600">{routeResult.safety_route.distance_km} km</p>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock size={12} />~{routeResult.safety_route.estimated_time_min} min walk
                    </p>
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-sm border border-blue-100">
                    <p className="text-xs text-gray-500 mb-1">Direct Route</p>
                    <p className="text-lg font-bold text-blue-600">{routeResult.direct_route.distance_km} km</p>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock size={12} />~{routeResult.direct_route.estimated_time_min} min walk
                    </p>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
                  <div className="p-3 bg-gray-50 border-b flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                      <Map size={16} className="text-gray-500" />
                      {showSafetyRoute ? "Safety Route (Green)" : "Direct Route (Blue)"}
                    </span>
                  </div>
                  <div className="h-96">
                    <MapContainer
                      center={[currentLocation.latitude, currentLocation.longitude]}
                      zoom={14}
                      style={{ height: "100%", width: "100%" }}
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <Polyline
                        positions={routeResult.direct_route.waypoints.map((w) => [w.latitude, w.longitude])}
                        pathOptions={{
                          color: showSafetyRoute ? "#93c5fd" : "#2563eb",
                          weight: showSafetyRoute ? 2 : 4,
                          dashArray: showSafetyRoute ? "5, 10" : undefined,
                        }}
                      />
                      {showSafetyRoute && (
                        <Polyline
                          positions={routeResult.safety_route.waypoints.map((w) => [w.latitude, w.longitude])}
                          pathOptions={{ color: "#16a34a", weight: 4 }}
                        />
                      )}
                      <Marker position={[currentLocation.latitude, currentLocation.longitude]}>
                        <Popup>Start: Your location</Popup>
                      </Marker>
                      <Marker position={[parseFloat(destLat), parseFloat(destLng)]} icon={sosIcon}>
                        <Popup>Destination</Popup>
                      </Marker>
                      {showSafetyRoute &&
                        routeResult.safety_route.safety_zones_on_route.map((zone, idx) => (
                          <Marker key={idx} position={[zone.latitude, zone.longitude]} icon={getZoneIcon(zone.type)}>
                            <Popup>
                              <strong>{zone.name}</strong><br />
                              {getZoneLabel(zone.type)}<br />
                              <span className="text-xs">{zone.distance_from_route_km} km from route</span>
                            </Popup>
                          </Marker>
                        ))}
                    </MapContainer>
                  </div>
                </div>

                {showSafetyRoute && routeResult.safety_route.safety_zones_on_route.length > 0 && (
                  <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                    <h3 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                      <ShieldCheck size={16} className="text-green-600" />
                      Safety Zones Along Your Route
                    </h3>
                    <div className="space-y-2">
                      {routeResult.safety_route.safety_zones_on_route.map((zone, idx) => (
                        <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${
                              zone.type === "police_station" ? "bg-blue-500"
                              : zone.type === "hospital" ? "bg-orange-500"
                              : zone.type === "fire_station" ? "bg-red-500"
                              : "bg-green-500"
                            }`} />
                            <div>
                              <p className="text-sm font-medium text-gray-800">{zone.name}</p>
                              <p className="text-xs text-gray-500">{getZoneLabel(zone.type)}</p>
                            </div>
                          </div>
                          <span className="text-xs text-gray-500">{zone.distance_from_route_km} km</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* CONTACTS TAB */}
        {activeTab === "contacts" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <UserPlus size={20} className="text-pink-600" />
                Add Emergency Contact
              </h2>
              <div className="space-y-3">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Contact Name"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pink-500 focus:border-transparent outline-none"
                />
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="Phone Number"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pink-500 focus:border-transparent outline-none"
                />
                <input
                  type="text"
                  value={newRelationship}
                  onChange={(e) => setNewRelationship(e.target.value)}
                  placeholder="Relationship (e.g. Mother, Friend)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pink-500 focus:border-transparent outline-none"
                />
                <button
                  onClick={addContact}
                  disabled={!newName || !newPhone}
                  className="w-full bg-gradient-to-r from-pink-600 to-purple-600 text-white py-3 rounded-lg font-medium hover:from-pink-700 hover:to-purple-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Plus size={18} />
                  Add Contact
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Phone size={16} className="text-gray-500" />
                Your Emergency Contacts ({contacts.length})
              </h3>
              {contacts.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Phone className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>No emergency contacts added yet.</p>
                  <p className="text-sm">Add contacts above to get notified during SOS.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {contacts.map((contact) => (
                    <div key={contact.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-800">{contact.name}</p>
                        <p className="text-sm text-gray-500">
                          {contact.phone}{contact.relationship && ` - ${contact.relationship}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <a href={`tel:${contact.phone}`} className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition-colors">
                          <Phone size={16} />
                        </a>
                        <button onClick={() => deleteContact(contact.id)} className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* HISTORY TAB */}
        {activeTab === "history" && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <History size={20} className="text-gray-600" />
                SOS Alert History
              </h2>
              {sosAlerts.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>No SOS alerts sent yet.</p>
                  <p className="text-sm">Your alert history will appear here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sosAlerts.slice().reverse().map((alert) => (
                    <div key={alert.id} className="p-4 bg-red-50 rounded-lg border border-red-100">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-red-700 flex items-center gap-1">
                            <AlertTriangle size={14} />{alert.message}
                          </p>
                          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                            <MapPin size={12} />{alert.latitude.toFixed(4)}, {alert.longitude.toFixed(4)}
                          </p>
                          <p className="text-xs text-gray-500 flex items-center gap-1">
                            <Clock size={12} />{new Date(alert.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      {alert.contacts_notified.length > 0 && (
                        <p className="text-xs text-gray-600 mt-2">Notified: {alert.contacts_notified.join(", ")}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {sosAlerts.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
                <div className="p-3 bg-gray-50 border-b flex items-center gap-2">
                  <Map size={16} className="text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Alert Locations</span>
                </div>
                <div className="h-80">
                  <MapContainer
                    center={[sosAlerts[sosAlerts.length - 1].latitude, sosAlerts[sosAlerts.length - 1].longitude]}
                    zoom={13}
                    style={{ height: "100%", width: "100%" }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {sosAlerts.map((alert, idx) => (
                      <Marker key={idx} position={[alert.latitude, alert.longitude]} icon={sosIcon}>
                        <Popup>
                          <strong>{alert.message}</strong><br />
                          {new Date(alert.timestamp).toLocaleString()}
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-gray-200 mt-8 py-4">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-500">
          <p className="flex items-center justify-center gap-1">
            <ShieldCheck size={14} className="text-pink-600" />
            SafeHer - Women Safety SOS System
          </p>
          <p className="text-xs mt-1">Stay safe. Stay connected.</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
