import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Map, { Marker, NavigationControl, GeolocateControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Compass, ChevronLeft, Search, Navigation, Info, MapPin, X, RefreshCw, AlertCircle } from 'lucide-react';
import '../components/Home.css';
import './MapPage.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const MapPage = () => {
    const navigate = useNavigate();
    const mapRef = useRef();

    const [buildings, setBuildings] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [selectedBuilding, setSelectedBuilding] = useState(null);
    const [userLocation, setUserLocation] = useState(null);
    const [distance, setDistance] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [retryCount, setRetryCount] = useState(0);

    const initialViewState = {
        longitude: 87.3105,
        latitude: 22.3190,
        zoom: 15
    };

    const fetchBuildings = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const res = await fetch(`${API_URL}/buildings`);
            if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
            const data = await res.json();
            setBuildings(data);
        } catch (err) {
            console.error("Failed to fetch buildings:", err);
            setLoadError(err.message || "Network error");
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial load + auto-retry up to 3 times with a 2s delay
    useEffect(() => {
        let timer;
        const attempt = async () => {
            try {
                const res = await fetch(`${API_URL}/buildings`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                setBuildings(data);
                setLoadError(null);
                setLoading(false);
            } catch (err) {
                if (retryCount < 3) {
                    // Wait 2s and retry automatically
                    timer = setTimeout(() => {
                        setRetryCount(c => c + 1);
                    }, 2000);
                } else {
                    setLoadError("Backend unreachable. Click retry to try again.");
                    setLoading(false);
                }
            }
        };
        attempt();
        return () => clearTimeout(timer);
    }, [retryCount]);

    useEffect(() => {
        if (selectedBuilding && userLocation) {
            setDistance(calculateDistance(
                userLocation.latitude, userLocation.longitude,
                selectedBuilding.latitude, selectedBuilding.longitude
            ));
        } else {
            setDistance(null);
        }
    }, [selectedBuilding, userLocation]);

    const handleSearchChange = async (e) => {
        const query = e.target.value;
        setSearchQuery(query);
        if (query.trim().length < 1) {
            setSearchResults([]);
            return;
        }
        try {
            const res = await fetch(`${API_URL}/buildings/search?q=${encodeURIComponent(query.trim())}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setSearchResults(data);
            // If buildings failed to load earlier but search works, populate buildings from results
            if (buildings.length === 0 && data.length > 0) {
                // Trigger a full reload now that backend is reachable
                fetchBuildings();
            }
        } catch (err) {
            console.error("Search failed:", err);
        }
    };

    const clearSearch = () => {
        setSearchQuery('');
        setSearchResults([]);
    };

    const selectBuilding = (building) => {
        setSelectedBuilding(building);
        clearSearch();
        if (mapRef.current) {
            mapRef.current.flyTo({
                center: [building.longitude, building.latitude],
                zoom: 17,
                duration: 1200
            });
        }
    };

    const formatDistance = (meters) => {
        if (!meters) return '';
        return meters < 1000
            ? `${Math.round(meters)} m`
            : `${(meters / 1000).toFixed(2)} km`;
    };

    const googleMapsUrl = selectedBuilding
        ? `https://www.google.com/maps/dir/?api=1&destination=${selectedBuilding.latitude},${selectedBuilding.longitude}`
        : '#';

    return (
        <div className="vintage-home-wrapper" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <nav className="vintage-navbar">
                <div className="nav-left">
                    <div className="nav-brand" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
                        <Compass size={24} className="brand-icon" />
                        <span className="brand-name">CAMPUS HELP</span>
                    </div>
                </div>
                <div className="nav-right">
                    <button className="icon-btn" onClick={() => navigate('/')}>
                        <ChevronLeft size={20} /> Back to Home
                    </button>
                </div>
            </nav>

            <main className="map-container" style={{ flex: 1, position: 'relative', display: 'flex', overflow: 'hidden' }}>
                {/* Sidebar */}
                <div className="map-sidebar">
                    <div className="map-sidebar-header">
                        <h2>Campus Navigator</h2>
                        <p>Find your way around IIT Kharagpur.</p>
                    </div>

                    {/* Backend error banner — non-blocking */}
                    {loadError && (
                        <div className="map-error-banner">
                            <AlertCircle size={14} />
                            <span>{loadError}</span>
                            <button onClick={() => { setRetryCount(0); setLoading(true); }} className="map-retry-btn">
                                <RefreshCw size={13} /> Retry
                            </button>
                        </div>
                    )}

                    {/* Status line */}
                    {!loadError && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                            {loading
                                ? `Connecting to backend${retryCount > 0 ? ` (attempt ${retryCount + 1})` : ''}…`
                                : `${buildings.length} buildings loaded`
                            }
                        </div>
                    )}

                    {/* Search */}
                    <div className="map-search-wrapper">
                        <div className="map-search-input">
                            <Search size={18} color="var(--text-secondary)" />
                            <input
                                type="text"
                                placeholder="Search (e.g., CIC, Nalanda, Library)"
                                value={searchQuery}
                                onChange={handleSearchChange}
                                autoComplete="off"
                            />
                            {searchQuery && (
                                <button onClick={clearSearch} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                    <X size={16} color="var(--text-secondary)" />
                                </button>
                            )}
                        </div>

                        {searchResults.length > 0 && (
                            <div className="map-search-results">
                                {searchResults.map(b => (
                                    <div
                                        key={b.id}
                                        className="map-search-item"
                                        onMouseDown={() => selectBuilding(b)}
                                    >
                                        <strong>{b.name}</strong>
                                        {b.short_name && b.short_name !== b.name && (
                                            <span className="map-search-short"> ({b.short_name})</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Detail Panel */}
                    {selectedBuilding ? (
                        <div className="map-selected-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h3 style={{ marginBottom: '0.25rem' }}>{selectedBuilding.name}</h3>
                                    <p className="map-selected-cat">{selectedBuilding.category?.toUpperCase()}</p>
                                </div>
                                <button
                                    onClick={() => setSelectedBuilding(null)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                >
                                    <X size={18} color="var(--text-secondary)" />
                                </button>
                            </div>

                            {selectedBuilding.description && (
                                <p style={{ margin: '1rem 0 0', fontSize: '0.9rem', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                                    {selectedBuilding.description}
                                </p>
                            )}

                            <div style={{ margin: '0.75rem 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                📍 {selectedBuilding.latitude.toFixed(5)}, {selectedBuilding.longitude.toFixed(5)}
                            </div>

                            {distance && (
                                <div className="map-distance">
                                    <Compass size={16} />
                                    <span>Distance: <strong>{formatDistance(distance)}</strong> (straight-line)</span>
                                </div>
                            )}

                            <a
                                href={googleMapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="vintage-btn-primary full-width"
                                style={{
                                    marginTop: '1.5rem',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    textDecoration: 'none'
                                }}
                            >
                                <Navigation size={18} /> Open in Google Maps
                            </a>
                        </div>
                    ) : (
                        <div className="map-empty-state">
                            <Info size={32} style={{ margin: '0 auto 1rem auto', color: 'var(--border-ink)' }} />
                            <p>Search for a building above, or click any <strong>pin</strong> on the map.</p>
                        </div>
                    )}
                </div>

                {/* Map */}
                <div style={{ flex: 1, position: 'relative' }}>
                    <Map
                        ref={mapRef}
                        initialViewState={initialViewState}
                        mapStyle={{
                            version: 8,
                            sources: {
                                'osm-tiles': {
                                    type: 'raster',
                                    tiles: [
                                        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                                        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
                                        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
                                    ],
                                    tileSize: 256,
                                    attribution: '© OpenStreetMap contributors'
                                }
                            },
                            layers: [
                                {
                                    id: 'osm-tiles-layer',
                                    type: 'raster',
                                    source: 'osm-tiles',
                                    minzoom: 0,
                                    maxzoom: 19
                                }
                            ]
                        }}
                        style={{ width: '100%', height: '100%' }}
                    >
                        <NavigationControl position="top-right" />
                        <GeolocateControl
                            position="top-right"
                            trackUserLocation={true}
                            onGeolocate={(e) => {
                                setUserLocation({
                                    latitude: e.coords.latitude,
                                    longitude: e.coords.longitude
                                });
                            }}
                        />

                        {buildings.map(b => (
                            <Marker
                                key={b.id}
                                longitude={b.longitude}
                                latitude={b.latitude}
                                anchor="bottom"
                                onClick={() => selectBuilding(b)}
                            >
                                <div
                                    className={`map-marker ${selectedBuilding?.id === b.id ? 'selected' : ''}`}
                                    title={b.name}
                                >
                                    <MapPin size={selectedBuilding?.id === b.id ? 32 : 24} />
                                </div>
                            </Marker>
                        ))}
                    </Map>
                </div>
            </main>
        </div>
    );
};

export default MapPage;
