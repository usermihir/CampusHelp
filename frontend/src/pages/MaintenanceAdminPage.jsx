import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Wrench, RefreshCw, Flame, Clock, CheckCircle2,
    AlertTriangle, ChevronDown, BarChart2, ShieldAlert, Inbox,
    Filter, ThumbsUp, X, Info
} from 'lucide-react';
import {
    fetchHallQueue, fetchEscalated, updateComplaintStatus,
    fetchComplaintHistory, fetchSLAPolicies, updateSLAPolicy,
} from '../services/api';
import './MaintenanceAdminPage.css';

// ─── Constants ─────────────────────────────────────────────────────────────────
const STATUS_LABELS = {
    open: 'Open',
    acknowledged: 'Acknowledged',
    in_progress: 'In Progress',
    pending_confirmation: 'Pending Confirmation',
    resolved: 'Resolved',
    reopened: 'Reopened',
    rejected: 'Rejected',
};

const STATUS_COLORS = {
    open: '#f59e0b',
    acknowledged: '#3b82f6',
    in_progress: '#8b5cf6',
    pending_confirmation: '#ec4899',
    resolved: '#10b981',
    reopened: '#f97316',
    rejected: '#ef4444',
};

const CATEGORY_ICONS = {
    food: '🍽️', cleanliness: '🧹', repair: '🔧',
    electrical: '⚡', plumbing: '🚿', other: '📋',
};

const ROLE_LABELS = {
    warden: 'Warden', mess: 'Mess Committee',
    estate: 'Estate Office', cleanliness: 'Cleanliness Staff',
    chief_warden: 'Chief Warden', institute_admin: 'Institute Admin',
};

const VALID_TRANSITIONS = {
    open: ['acknowledged', 'rejected'],
    acknowledged: ['in_progress', 'rejected'],
    in_progress: ['pending_confirmation', 'resolved', 'rejected'],
    pending_confirmation: [],
    reopened: ['acknowledged', 'in_progress'],
    resolved: [],
    rejected: [],
};

// ─── StatusBadge ───────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => (
    <span className="adm-badge" style={{
        background: STATUS_COLORS[status] + '20',
        color: STATUS_COLORS[status],
        border: `1px solid ${STATUS_COLORS[status]}44`,
    }}>
        {STATUS_LABELS[status] || status}
    </span>
);

// ─── Stats strip ───────────────────────────────────────────────────────────────
const StatsStrip = ({ complaints }) => {
    const counts = complaints.reduce((acc, c) => {
        acc[c.status] = (acc[c.status] || 0) + 1;
        if (c.escalation_level > 0) acc._escalated = (acc._escalated || 0) + 1;
        if (new Date(c.sla_deadline) < new Date() && c.status !== 'resolved') {
            acc._breached = (acc._breached || 0) + 1;
        }
        return acc;
    }, {});

    const stats = [
        { label: 'Open',        value: counts.open || 0,        color: '#f59e0b' },
        { label: 'In Progress', value: counts.in_progress || 0, color: '#8b5cf6' },
        { label: 'Escalated',   value: counts._escalated || 0,  color: '#ef4444' },
        { label: 'SLA Breach',  value: counts._breached || 0,   color: '#dc2626' },
        { label: 'Resolved',    value: counts.resolved || 0,    color: '#10b981' },
    ];

    return (
        <div className="adm-stats">
            {stats.map(s => (
                <div key={s.label} className="adm-stat-card">
                    <span className="adm-stat-value" style={{ color: s.color }}>{s.value}</span>
                    <span className="adm-stat-label">{s.label}</span>
                </div>
            ))}
        </div>
    );
};

// ─── Ticket Row ────────────────────────────────────────────────────────────────
const TicketRow = ({ complaint, onStatusUpdate, onHistory }) => {
    const [open, setOpen] = useState(false);
    const [nextStatus, setNextStatus] = useState('');
    const [note, setNote] = useState('');
    const [historyData, setHistoryData] = useState(null);
    const [loadingHist, setLoadingHist] = useState(false);

    const deadlinePast = new Date(complaint.sla_deadline) < new Date();
    const transitions = VALID_TRANSITIONS[complaint.status] || [];

    const handleUpdate = async () => {
        if (!nextStatus) return;
        await onStatusUpdate(complaint.id, nextStatus, note, note);
        setNextStatus('');
        setNote('');
    };

    const loadHistory = async () => {
        if (!historyData) {
            setLoadingHist(true);
            const h = await onHistory(complaint.id);
            setHistoryData(h);
            setLoadingHist(false);
        }
        setOpen(o => !o);
    };

    return (
        <div className={`adm-ticket ${deadlinePast && complaint.status !== 'resolved' ? 'adm-ticket--breached' : ''}`}>
            {/* ── Top row ── */}
            <div className="adm-ticket__top">
                <span className="adm-ticket__icon">{CATEGORY_ICONS[complaint.category] || '📋'}</span>

                <div className="adm-ticket__info">
                    <div className="adm-ticket__title-row">
                        <span className="adm-ticket__cat">{complaint.category.toUpperCase()}</span>
                        {complaint.escalation_level > 0 && (
                            <span className="adm-ticket__esc">
                                <Flame size={11} /> ESC {complaint.escalation_level}
                            </span>
                        )}
                        <span className="adm-ticket__upvotes">
                            <ThumbsUp size={11} /> {complaint.upvote_count}
                        </span>
                    </div>
                    <p className="adm-ticket__desc">{complaint.description}</p>
                </div>

                <div className="adm-ticket__right">
                    <StatusBadge status={complaint.status} />
                    <div className="adm-ticket__sla" style={{ color: deadlinePast ? '#ef4444' : '#a89080' }}>
                        <Clock size={11} />
                        {deadlinePast && complaint.status !== 'resolved'
                            ? 'SLA BREACHED'
                            : new Date(complaint.sla_deadline).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                        }
                    </div>
                    <span className="adm-ticket__date">
                        {new Date(complaint.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </span>
                </div>
            </div>

            {/* ── Admin action bar ── */}
            {transitions.length > 0 && (
                <div className="adm-ticket__actions">
                    <select
                        className="adm-select"
                        value={nextStatus}
                        onChange={e => setNextStatus(e.target.value)}
                    >
                        <option value="">Move to…</option>
                        {transitions.map(t => (
                            <option key={t} value={t}>{STATUS_LABELS[t]}</option>
                        ))}
                    </select>
                    {nextStatus && (
                        <>
                            <input
                                className="adm-input"
                                placeholder="Note / resolution detail (optional)"
                                value={note}
                                onChange={e => setNote(e.target.value)}
                            />
                            <button className="adm-btn adm-btn--primary" onClick={handleUpdate}>
                                Update
                            </button>
                            <button className="adm-btn adm-btn--ghost" onClick={() => { setNextStatus(''); setNote(''); }}>
                                <X size={14} />
                            </button>
                        </>
                    )}
                    <button className="adm-history-btn" onClick={loadHistory} disabled={loadingHist}>
                        <Info size={12} /> {loadingHist ? 'Loading…' : 'Audit'}
                        <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
                    </button>
                </div>
            )}

            {/* ── History ── */}
            {open && historyData && (
                <div className="adm-history">
                    {historyData.length === 0 ? (
                        <span className="adm-history__empty">No history yet.</span>
                    ) : historyData.map(h => (
                        <div key={h.id} className="adm-history__item">
                            <span className="adm-history__transition">{h.from_status || '—'} → {h.to_status}</span>
                            <span className="adm-history__time">{new Date(h.created_at).toLocaleString('en-IN')}</span>
                            {h.note && <span className="adm-history__note">"{h.note}"</span>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ─── SLA Policy Manager ────────────────────────────────────────────────────────
const SLAPoliciesPanel = () => {
    const [policies, setPolicies] = useState([]);
    const [editingCat, setEditingCat] = useState(null);
    const [editHours, setEditHours] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchSLAPolicies().then(setPolicies).catch(() => {});
    }, []);

    const handleSave = async (cat) => {
        setSaving(true);
        try {
            await updateSLAPolicy(cat, parseInt(editHours));
            setPolicies(p => p.map(x => x.category === cat ? { ...x, max_hours: parseInt(editHours) } : x));
            setEditingCat(null);
        } catch (e) {
            alert('Failed to update SLA policy');
        }
        setSaving(false);
    };

    return (
        <div className="adm-sla-panel">
            <h3 className="adm-section-title">SLA Policies</h3>
            <p className="adm-section-sub">Configure maximum resolution time per category. Changes apply to new tickets immediately.</p>
            <div className="adm-sla-grid">
                {policies.map(p => (
                    <div key={p.category} className="adm-sla-card">
                        <div className="adm-sla-cat">
                            {CATEGORY_ICONS[p.category]} {p.category.toUpperCase()}
                        </div>
                        <div className="adm-sla-role">→ {ROLE_LABELS[p.assigned_role] || p.assigned_role}</div>
                        {editingCat === p.category ? (
                            <div className="adm-sla-edit">
                                <input
                                    type="number"
                                    className="adm-input adm-input--sm"
                                    value={editHours}
                                    min={1}
                                    onChange={e => setEditHours(e.target.value)}
                                />
                                <span>hours</span>
                                <button className="adm-btn adm-btn--primary adm-btn--sm" onClick={() => handleSave(p.category)} disabled={saving}>
                                    Save
                                </button>
                                <button className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => setEditingCat(null)}>
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <div className="adm-sla-value">
                                <span className="adm-sla-hours">{p.max_hours}h</span>
                                <button className="adm-sla-edit-btn" onClick={() => { setEditingCat(p.category); setEditHours(p.max_hours); }}>
                                    Edit
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

// ─── Main Admin Page ───────────────────────────────────────────────────────────
const MaintenanceAdminPage = () => {
    const navigate = useNavigate();

    const [tab, setTab] = useState('queue');           // 'queue' | 'escalated' | 'sla'
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filterCat, setFilterCat] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [accessDenied, setAccessDenied] = useState(false);

    const loadComplaints = useCallback(async () => {
        setLoading(true);
        setAccessDenied(false);
        try {
            const data = tab === 'escalated'
                ? await fetchEscalated()
                : await fetchHallQueue();
            setComplaints(data);
        } catch (err) {
            if (err.response?.status === 403) setAccessDenied(true);
            setComplaints([]);
        }
        setLoading(false);
    }, [tab]);

    useEffect(() => { if (tab !== 'sla') loadComplaints(); }, [loadComplaints, tab]);

    const handleStatusUpdate = async (id, status, note, resNote) => {
        try {
            await updateComplaintStatus(id, status, note, resNote);
            loadComplaints();
        } catch (err) {
            alert(err.response?.data?.detail || 'Update failed');
        }
    };

    const handleHistory = async (id) => {
        const { fetchComplaintHistory } = await import('../services/api');
        return fetchComplaintHistory(id);
    };

    // Filter complaints client-side
    const filtered = complaints.filter(c =>
        (!filterCat || c.category === filterCat) &&
        (!filterStatus || c.status === filterStatus)
    );

    const slaBreachedCount = complaints.filter(
        c => new Date(c.sla_deadline) < new Date() && c.status !== 'resolved'
    ).length;

    return (
        <div className="adm-page">

            {/* ── Header ── */}
            <div className="adm-header">
                <button className="adm-back-btn" onClick={() => navigate('/')}>
                    <ArrowLeft size={20} />
                </button>
                <div className="adm-header__title">
                    <ShieldAlert size={22} />
                    <div>
                        <h1>Maintenance Admin</h1>
                        <span className="adm-header__sub">Hall Authority Dashboard</span>
                    </div>
                </div>
                <button className="adm-refresh-btn" onClick={loadComplaints} title="Refresh">
                    <RefreshCw size={16} />
                </button>
            </div>

            {/* ── SLA breach warning ── */}
            {slaBreachedCount > 0 && tab !== 'sla' && (
                <div className="adm-warning-bar">
                    <AlertTriangle size={15} />
                    {slaBreachedCount} ticket{slaBreachedCount > 1 ? 's have' : ' has'} breached SLA and {slaBreachedCount > 1 ? 'are' : 'is'} awaiting action.
                </div>
            )}

            {/* ── Tabs ── */}
            <div className="adm-tabs">
                <button className={`adm-tab ${tab === 'queue' ? 'adm-tab--active' : ''}`} onClick={() => setTab('queue')} id="adm-tab-queue">
                    <Inbox size={15} /> Hall Queue
                </button>
                <button className={`adm-tab ${tab === 'escalated' ? 'adm-tab--active' : ''}`} onClick={() => setTab('escalated')} id="adm-tab-escalated">
                    <Flame size={15} /> Escalated
                </button>
                <button className={`adm-tab ${tab === 'sla' ? 'adm-tab--active' : ''}`} onClick={() => setTab('sla')} id="adm-tab-sla">
                    <BarChart2 size={15} /> SLA Policies
                </button>
            </div>

            <div className="adm-content">

                {/* ── Access denied ── */}
                {accessDenied && (
                    <div className="adm-access-denied">
                        <ShieldAlert size={40} />
                        <h3>Access Restricted</h3>
                        <p>Your account doesn't have a hall authority role assigned.<br />
                        Contact your institute admin to get access.</p>
                    </div>
                )}

                {/* ── SLA tab ── */}
                {tab === 'sla' && !accessDenied && <SLAPoliciesPanel />}

                {/* ── Queue / Escalated tabs ── */}
                {tab !== 'sla' && !accessDenied && (
                    <>
                        {/* Stats strip */}
                        {complaints.length > 0 && <StatsStrip complaints={complaints} />}

                        {/* Filter bar */}
                        {complaints.length > 0 && (
                            <div className="adm-filter-bar">
                                <Filter size={14} className="adm-filter-icon" />
                                <select className="adm-select adm-select--sm" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
                                    <option value="">All Categories</option>
                                    {['food','cleanliness','repair','electrical','plumbing','other'].map(c => (
                                        <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>
                                    ))}
                                </select>
                                <select className="adm-select adm-select--sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                                    <option value="">All Statuses</option>
                                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                                        <option key={k} value={k}>{v}</option>
                                    ))}
                                </select>
                                {(filterCat || filterStatus) && (
                                    <button className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => { setFilterCat(''); setFilterStatus(''); }}>
                                        Clear
                                    </button>
                                )}
                                <span className="adm-filter-count">{filtered.length} ticket{filtered.length !== 1 ? 's' : ''}</span>
                            </div>
                        )}

                        {/* Loading */}
                        {loading && (
                            <div className="adm-loading">
                                <RefreshCw size={28} className="adm-spinner" />
                                <p>Loading…</p>
                            </div>
                        )}

                        {/* Empty */}
                        {!loading && filtered.length === 0 && (
                            <div className="adm-empty">
                                <CheckCircle2 size={44} />
                                <p>{tab === 'escalated' ? 'No escalated tickets — all good!' : 'No open tickets in your queue.'}</p>
                            </div>
                        )}

                        {/* Ticket list */}
                        {!loading && filtered.length > 0 && (
                            <div className="adm-list">
                                {filtered.map(c => (
                                    <TicketRow
                                        key={c.id}
                                        complaint={c}
                                        onStatusUpdate={handleStatusUpdate}
                                        onHistory={handleHistory}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default MaintenanceAdminPage;
