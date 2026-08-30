import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getSociety, getChannels, createChannel, archiveChannel,
  joinChannel, addSocietyMember, getSocietyMembers
} from '../services/societiesService';
import './SocietyDetailPage.css';
import {
  Hash, Lock, Users, Plus, Trash2, Settings,
  ArrowLeft, Loader2, AlertCircle, ChevronRight, Shield
} from 'lucide-react';

export default function SocietyDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [society, setSociety]   = useState(null);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [tab, setTab]           = useState('channels'); // channels | members
  const [members, setMembers]   = useState([]);
  const [membersLoaded, setMembersLoaded] = useState(false);

  // Create channel modal
  const [showCreate, setShowCreate]     = useState(false);
  const [newName, setNewName]           = useState('');
  const [newDesc, setNewDesc]           = useState('');
  const [newPrivate, setNewPrivate]     = useState(false);
  const [creating, setCreating]         = useState(false);

  useEffect(() => {
    Promise.all([getSociety(id), getChannels(id)])
      .then(([soc, chs]) => { setSociety(soc); setChannels(chs); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const loadMembers = async () => {
    if (membersLoaded) return;
    try {
      const ms = await getSocietyMembers(id);
      setMembers(ms);
      setMembersLoaded(true);
    } catch { /* not admin — ignore */ }
  };

  const handleTabChange = t => {
    setTab(t);
    if (t === 'members') loadMembers();
  };

  const handleJoin = async (chanId, e) => {
    e.stopPropagation();
    try {
      await joinChannel(chanId);
      const chs = await getChannels(id);
      setChannels(chs);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleArchive = async (chanId, e) => {
    e.stopPropagation();
    if (!window.confirm('Archive this channel? Messages will be preserved.')) return;
    try {
      await archiveChannel(chanId);
      setChannels(prev => prev.filter(c => c.id !== chanId));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCreate = async e => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const ch = await createChannel(id, {
        name: newName.trim(),
        description: newDesc.trim() || null,
        is_private: newPrivate,
      });
      setChannels(prev => [...prev, ch]);
      setShowCreate(false);
      setNewName(''); setNewDesc(''); setNewPrivate(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return (
    <div className="sdet-loading">
      <Loader2 size={40} className="sdet-spinner" />
    </div>
  );

  if (error) return (
    <div className="sdet-error">
      <AlertCircle size={20} /> {error}
    </div>
  );

  return (
    <div className="sdet-page">
      {/* Topbar */}
      <div className="sdet-topbar">
        <button className="sdet-back" onClick={() => navigate('/student/societies')}>
          <ArrowLeft size={18} /> Societies
        </button>
      </div>

      {/* Hero */}
      <div className="sdet-hero">
        <div className="sdet-hero-avatar">
          {society.logo_url
            ? <img src={society.logo_url} alt={society.name} />
            : <span>{society.name.charAt(0).toUpperCase()}</span>
          }
        </div>
        <div className="sdet-hero-info">
          <div className="sdet-hero-title-row">
            <h1>{society.name}</h1>
            {society.is_admin && (
              <span className="sdet-admin-badge"><Shield size={14} /> Admin</span>
            )}
          </div>
          {society.description && <p>{society.description}</p>}
          <span className="sdet-member-count">
            <Users size={14} /> {society.member_count ?? 0} members
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="sdet-tabs">
        <button
          className={`sdet-tab ${tab === 'channels' ? 'active' : ''}`}
          onClick={() => handleTabChange('channels')}
        >
          Channels
        </button>
        {society.is_admin && (
          <button
            className={`sdet-tab ${tab === 'members' ? 'active' : ''}`}
            onClick={() => handleTabChange('members')}
          >
            Members
          </button>
        )}
      </div>

      {/* Channel List */}
      {tab === 'channels' && (
        <div className="sdet-channels">
          {society.is_admin && (
            <button className="sdet-create-btn" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> New Channel
            </button>
          )}

          {channels.length === 0 && (
            <p className="sdet-empty">No channels yet.</p>
          )}

          {channels.map(ch => (
            <div
              key={ch.id}
              className={`sdet-channel-card ${ch.is_member ? 'joined' : ''}`}
              onClick={() => ch.is_member && navigate(`/student/channels/${ch.id}`)}
            >
              <div className="sdet-ch-icon">
                {ch.is_private ? <Lock size={16} /> : <Hash size={16} />}
              </div>
              <div className="sdet-ch-info">
                <div className="sdet-ch-name-row">
                  <span className="sdet-ch-name">{ch.name}</span>
                  {ch.is_private && <span className="sdet-private-tag">Private</span>}
                </div>
                {ch.description && <span className="sdet-ch-desc">{ch.description}</span>}
                <span className="sdet-ch-meta">
                  <Users size={12} /> {ch.member_count ?? 0} members
                </span>
              </div>
              <div className="sdet-ch-actions">
                {ch.is_member ? (
                  <span className="sdet-ch-open"><ChevronRight size={18} /></span>
                ) : !ch.is_private ? (
                  <button
                    className="sdet-join-btn"
                    onClick={e => handleJoin(ch.id, e)}
                  >Join</button>
                ) : (
                  <span className="sdet-private-label">Admin-only</span>
                )}
                {society.is_admin && (
                  <button
                    className="sdet-archive-btn"
                    title="Archive channel"
                    onClick={e => handleArchive(ch.id, e)}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Members List */}
      {tab === 'members' && (
        <div className="sdet-members">
          {members.length === 0 && <p className="sdet-empty">No members yet.</p>}
          {members.map(m => (
            <div key={m.user_id} className="sdet-member-row">
              <div className="sdet-member-avatar">{m.email?.charAt(0).toUpperCase()}</div>
              <span className="sdet-member-email">{m.email}</span>
            </div>
          ))}
        </div>
      )}

      {/* Create Channel Modal */}
      {showCreate && (
        <div className="sdet-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="sdet-modal" onClick={e => e.stopPropagation()}>
            <h3>Create Channel</h3>
            <form onSubmit={handleCreate}>
              <label>Name</label>
              <input
                type="text"
                placeholder="e.g. Recruitment 2026"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                required
                maxLength={100}
              />
              <label>Description (optional)</label>
              <textarea
                placeholder="What's this channel about?"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                rows={3}
                maxLength={500}
              />
              <label className="sdet-toggle-label">
                <input
                  type="checkbox"
                  checked={newPrivate}
                  onChange={e => setNewPrivate(e.target.checked)}
                />
                Private channel
              </label>
              <div className="sdet-modal-actions">
                <button type="button" className="sdet-modal-cancel" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="sdet-modal-submit" disabled={creating}>
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
