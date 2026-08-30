import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocieties } from '../services/societiesService';
import './SocietiesPage.css';
import {
  Users, Search, ChevronRight, Shield, Globe, Loader2, AlertCircle
} from 'lucide-react';

export default function SocietiesPage() {
  const navigate = useNavigate();
  const [societies, setSocieties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getSocieties()
      .then(setSocieties)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = societies.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.description || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="societies-page">
      {/* Header */}
      <div className="soc-header">
        <button className="soc-back-btn" onClick={() => navigate(-1)}>← Back</button>
        <div className="soc-header-content">
          <div className="soc-header-icon"><Users size={32} /></div>
          <div>
            <h1>Societies</h1>
            <p>Discover and join IIT KGP societies</p>
          </div>
        </div>

        {/* Search */}
        <div className="soc-search-bar">
          <Search size={18} className="soc-search-icon" />
          <input
            type="text"
            placeholder="Search societies…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Body */}
      <div className="soc-body">
        {loading && (
          <div className="soc-loading">
            <Loader2 size={36} className="soc-spinner" />
            <span>Loading societies…</span>
          </div>
        )}

        {error && (
          <div className="soc-error">
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="soc-empty">No societies found.</div>
        )}

        <div className="soc-grid">
          {filtered.map(s => (
            <div
              key={s.id}
              className="soc-card"
              onClick={() => navigate(`/student/societies/${s.id}`)}
            >
              {/* Avatar */}
              <div className="soc-avatar">
                {s.logo_url
                  ? <img src={s.logo_url} alt={s.name} />
                  : <span>{s.name.charAt(0).toUpperCase()}</span>
                }
              </div>

              <div className="soc-card-body">
                <div className="soc-card-title-row">
                  <h3>{s.name}</h3>
                  {s.is_admin && (
                    <span className="soc-admin-badge">
                      <Shield size={12} /> Admin
                    </span>
                  )}
                </div>

                {s.description && (
                  <p className="soc-card-desc">{s.description}</p>
                )}

                <div className="soc-card-meta">
                  <span className="soc-meta-item">
                    <Users size={13} /> {s.member_count ?? 0} members
                  </span>
                  <span className="soc-meta-item">
                    <Globe size={13} /> IIT KGP
                  </span>
                </div>
              </div>

              <ChevronRight size={18} className="soc-card-arrow" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
