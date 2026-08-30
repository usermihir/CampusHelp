import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Search,
  Globe,
  MapPin,
  Calendar,
  ExternalLink,
  AlertTriangle,
  Trophy,
} from 'lucide-react';
import {
  fetchHackathons,
  getPlatformColor,
  getPlatformLabel,
  PLATFORM_META,
  daysUntil,
  formatDate,
} from '../services/hackathonsService';
import './HackathonsPage.css';

/* ─── Constants ──────────────────────────────────────── */
const MODES = [
  { label: 'All', value: '' },
  { label: '🌐 Online', value: 'online' },
  { label: '📍 Offline', value: 'offline' },
];

const ALL_PLATFORMS = Object.keys(PLATFORM_META);

/* ─── Skeleton Card ──────────────────────────────────── */
const SkeletonCard = () => (
  <div className="hack-skeleton-card">
    <div className="hack-skeleton-line short" />
    <div className="hack-skeleton-line medium" />
    <div className="hack-skeleton-line long" />
    <div className="hack-skeleton-line medium" />
    <div className="hack-skeleton-line full" />
  </div>
);

/* ─── Main Page ───────────────────────────────────────── */
const HackathonsPage = () => {
  const navigate = useNavigate();

  // ── State ──
  const [hackathons, setHackathons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [mode, setMode] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState([]); // empty = all
  const [search, setSearch] = useState('');

  // ── Fetch ──
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await fetchHackathons({ mode });
      setHackathons(data ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // ── Client-side filters (platform + search applied in-memory) ──
  const filtered = useMemo(() => {
    let result = hackathons;
    if (selectedPlatforms.length > 0) {
      result = result.filter((h) =>
        selectedPlatforms.includes(h.platform?.toLowerCase())
      );
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (h) =>
          h.title?.toLowerCase().includes(q) ||
          h.platform?.toLowerCase().includes(q) ||
          h.location?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [hackathons, selectedPlatforms, search]);

  // ── Platform pill toggle ──
  const togglePlatform = (p) => {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  // ── Render ──
  return (
    <div className="hackathons-page">
      {/* Sticky Nav */}
      <nav className="hack-nav">
        <button
          id="hack-back-btn"
          className="hack-nav-back"
          onClick={() => navigate('/student/home')}
        >
          <ArrowLeft size={16} />
          Home
        </button>
        <span className="hack-nav-title">
          <Trophy size={18} style={{ display: 'inline', marginRight: '0.4rem', verticalAlign: 'middle' }} />
          Hackathon Explorer
        </span>
        {!loading && !error && (
          <span className="hack-nav-count">
            {filtered.length} of {hackathons.length} hackathons
          </span>
        )}
      </nav>

      {/* Hero */}
      <div className="hack-hero">
        <h1>Build Something Great</h1>
        <p>"Every great project starts with a single hackathon."</p>
      </div>

      {/* Filter Bar */}
      <div className="hack-filter-bar">
        {/* Search */}
        <div className="hack-search-wrap">
          <Search size={16} />
          <input
            id="hack-search-input"
            type="text"
            className="hack-search-input"
            placeholder="Search hackathons…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Mode toggle */}
        <div className="hack-mode-toggle">
          {MODES.map(({ label, value }) => (
            <button
              key={value}
              id={`hack-mode-${value || 'all'}`}
              className={`hack-mode-btn${mode === value ? ' active' : ''}`}
              onClick={() => setMode(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Platform pills */}
        <div className="hack-platform-pills">
          {ALL_PLATFORMS.map((p) => {
            const color = getPlatformColor(p);
            const isActive = selectedPlatforms.includes(p);
            return (
              <button
                key={p}
                id={`hack-platform-${p}`}
                className={`hack-platform-pill${isActive ? ' active' : ''}`}
                style={{
                  borderColor: color,
                  color: isActive ? '#fff' : color,
                  backgroundColor: isActive ? color : 'transparent',
                }}
                onClick={() => togglePlatform(p)}
              >
                {getPlatformLabel(p)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <main className="hack-content">
        {/* Loading */}
        {loading && (
          <div className="hack-skeleton-grid">
            {Array.from({ length: 9 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="hack-error">
            <div className="hack-error-icon">
              <AlertTriangle size={48} />
            </div>
            <h3>Couldn't load hackathons</h3>
            <p>{error}</p>
            <button id="hack-retry-btn" className="hack-retry-btn" onClick={load}>
              Try Again
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && filtered.length === 0 && (
          <div className="hack-empty">
            <div className="hack-empty-icon">🔍</div>
            <h3>No hackathons found</h3>
            <p>Try adjusting your filters or search query.</p>
          </div>
        )}

        {/* Card Grid */}
        {!loading && !error && filtered.length > 0 && (
          <div className="hack-grid">
            {filtered.map((h) => (
              <HackathonCard key={h.id + h.title} hackathon={h} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

/* ─── Hackathon Card ─────────────────────────────────── */
const HackathonCard = ({ hackathon }) => {
  const {
    title,
    platform,
    mode,
    location,
    start_date,
    end_date,
    registration_end,
    url,
  } = hackathon;

  const platformColor = getPlatformColor(platform);
  const platformLabel = getPlatformLabel(platform);
  const regDaysLeft = daysUntil(registration_end);
  const closingSoon = regDaysLeft !== null && regDaysLeft >= 0 && regDaysLeft <= 7;
  const showLocation = location && location.toLowerCase() !== 'tba';

  return (
    <div
      className="hack-card"
      style={{ '--card-accent': platformColor }}
    >
      {/* Header: platform + mode badges */}
      <div className="hack-card-header">
        <span
          className="hack-platform-badge"
          style={{ backgroundColor: platformColor }}
        >
          {platformLabel}
        </span>
        <span className={`hack-mode-badge ${mode?.toLowerCase() === 'online' ? 'online' : 'offline'}`}>
          {mode?.toLowerCase() === 'online' ? <Globe size={12} /> : <MapPin size={12} />}
          {mode ? mode.charAt(0).toUpperCase() + mode.slice(1) : 'TBA'}
        </span>
      </div>

      {/* Title */}
      <h3 className="hack-card-title">{title}</h3>

      {/* Dates */}
      <div className="hack-card-dates">
        {start_date && (
          <div className="hack-card-date-row">
            <Calendar size={13} />
            <span className="hack-card-date-label">Dates:</span>
            <span>{formatDate(start_date)} — {formatDate(end_date)}</span>
          </div>
        )}
        {registration_end && (
          <div className="hack-card-date-row">
            <span className="hack-card-date-label">Register by:</span>
            <span>{formatDate(registration_end)}</span>
            {closingSoon && (
              <span className="hack-closing-soon">
                ⚠ {regDaysLeft === 0 ? 'Today!' : `${regDaysLeft}d left`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Location */}
      {showLocation && (
        <div className="hack-card-location">
          <MapPin size={13} />
          <span>{location}</span>
        </div>
      )}

      <div className="hack-card-spacer" />

      {/* Register button */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="hack-register-btn"
        id={`hack-register-${hackathon.id}`}
      >
        Register Now
        <ExternalLink size={14} />
      </a>
    </div>
  );
};

export default HackathonsPage;
