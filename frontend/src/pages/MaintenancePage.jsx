import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Wrench, Plus, AlertTriangle, Clock, CheckCircle2,
    ChevronDown, RefreshCw, Flame, X, ThumbsUp, ThumbsDown,
    Info, ClipboardList, BarChart2, ShieldAlert
} from 'lucide-react';
import {
    fetchHalls, setMyHall, submitComplaint,
    fetchMyComplaints, fetchHallQueue, fetchEscalated,
    updateComplaintStatus, confirmResolution, fetchComplaintHistory,
} from '../services/api';
import './MaintenancePage.css';

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = ['food', 'cleanliness', 'repair', 'electrical', 'plumbing', 'other'];
const PERSONAL_CATEGORIES = new Set(['repair', 'electrical', 'plumbing']);

const STATUS_LABELS = {
    open: 'Open',
    acknowledged: 'Acknowledged',
    in_progress: 'In Progress',
    pending_confirmation: 'Pending Your Confirmation',
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
    food: '🍽️',
    cleanliness: '🧹',
    repair: '🔧',
    electrical: '⚡',
    plumbing: '🚿',
    other: '📋',
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

// ─── Sub-components ────────────────────────────────────────────────────────────

const StatusBadge = ({ status }) => (
    <span
        className="maint-status-badge"
        style={{ background: STATUS_COLORS[status] + '22', color: STATUS_COLORS[status], border: `1px solid ${STATUS_COLORS[status]}55` }}
    >
        {STATUS_LABELS[status] || status}
    </span>
);

const ComplaintCard = ({ complaint, isAdmin, onStatusUpdate, onConfirm, onHistory, currentUserId }) => {
    const [expanded, setExpanded] = useState(false);
    const [statusNote, setStatusNote] = useState('');
    const [nextStatus, setNextStatus] = useState('');
    const [historyData, setHistoryData] = useState(null);
    const [loadingHist, setLoadingHist] = useState(false);

    const deadlinePast = new Date(complaint.sla_deadline) < new Date();

    const handleStatusChange = async () => {
        if (!nextStatus) return;
        await onStatusUpdate(complaint.id, nextStatus, statusNote);
        setNextStatus('');
        setStatusNote('');
    };

    const loadHistory = async () => {
        if (historyData) { setExpanded(e => !e); return; }
        setLoadingHist(true);
        const hist = await onHistory(complaint.id);
        setHistoryData(hist);
        setLoadingHist(false);
        setExpanded(true);
    };

    const transitions = VALID_TRANSITIONS[complaint.status] || [];
    const isMyTicket = complaint.reporter_id === currentUserId;
    const awaitingMyConfirmation = complaint.status === 'pending_confirmation' && isMyTicket;

    return (
        <div className={`maint-card ${deadlinePast && complaint.status !== 'resolved' ? 'maint-card--sla-breach' : ''}`}>
            <div className="maint-card__header">
                <span className="maint-card__cat-icon">{CATEGORY_ICONS[complaint.category] || '📋'}</span>
                <div className="maint-card__meta">
                    <span className="maint-card__category">{complaint.category.toUpperCase()}</span>
                    <span className="maint-card__date">{new Date(complaint.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                </div>
                <StatusBadge status={complaint.status} />
                {complaint.escalation_level > 0 && (
                    <span className="maint-card__escalated">
                        <Flame size={12} /> ESC {complaint.escalation_level}
                    </span>
                )}
                <span className="maint-card__upvotes">
                    <ThumbsUp size={12} /> {complaint.upvote_count}
                </span>
            </div>

            <p className="maint-card__desc">{complaint.description}</p>

            <div className="maint-card__sla">
                <Clock size={12} />
                <span>SLA: {new Date(complaint.sla_deadline).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                {deadlinePast && complaint.status !== 'resolved' && (
                    <span className="maint-sla-breached">BREACHED</span>
                )}
            </div>

            {/* Student: pending confirmation action */}
            {awaitingMyConfirmation && (
                <div className="maint-confirm-box">
                    <p>The maintenance team marked this as resolved. Is your issue fixed?</p>
                    <div className="maint-confirm-actions">
                        <button className="maint-btn maint-btn--confirm" onClick={() => onConfirm(complaint.id, true, '')}>
                            <CheckCircle2 size={14} /> Yes, Fixed!
                        </button>
                        <button className="maint-btn maint-btn--reject" onClick={() => onConfirm(complaint.id, false, '')}>
                            <X size={14} /> Not Fixed
                        </button>
                    </div>
                </div>
            )}

            {/* Admin: status transition controls */}
            {isAdmin && transitions.length > 0 && (
                <div className="maint-admin-actions">
                    <select
                        className="maint-select"
                        value={nextStatus}
                        onChange={e => setNextStatus(e.target.value)}
                    >
                        <option value="">Change status…</option>
                        {transitions.map(t => (
                            <option key={t} value={t}>{STATUS_LABELS[t]}</option>
                        ))}
                    </select>
                    {nextStatus && (
                        <>
                            <input
                                className="maint-input"
                                placeholder="Optional note / resolution note…"
                                value={statusNote}
                                onChange={e => setStatusNote(e.target.value)}
                            />
                            <button className="maint-btn maint-btn--primary" onClick={handleStatusChange}>
                                Update
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* History toggle */}
            <button className="maint-history-btn" onClick={loadHistory} disabled={loadingHist}>
                <Info size={12} /> {loadingHist ? 'Loading…' : 'Audit Trail'}
                <ChevronDown size={12} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
            </button>

            {expanded && historyData && (
                <div className="maint-history">
                    {historyData.map((h) => (
                        <div key={h.id} className="maint-history__item">
                            <span className="maint-history__arrow">{h.from_status || '—'} → {h.to_status}</span>
                            <span className="maint-history__time">{new Date(h.created_at).toLocaleString('en-IN')}</span>
                            {h.note && <span className="maint-history__note">{h.note}</span>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ─── Hall Selection Modal ─────────────────────────────────────────────────────

const HallSelectModal = ({ halls, onSelect }) => {
    const [selected, setSelected] = useState('');
    return (
        <div className="maint-modal-overlay">
            <div className="maint-modal">
                <div className="maint-modal__icon"><Wrench size={32} /></div>
                <h2>Which hall do you live in?</h2>
                <p className="maint-modal__sub">This lets us auto-tag your complaints and route them to the right authority.</p>
                <select className="maint-select maint-select--full" value={selected} onChange={e => setSelected(e.target.value)}>
                    <option value="">Select your hall…</option>
                    {halls.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
                <button
                    className="maint-btn maint-btn--primary maint-btn--full"
                    disabled={!selected}
                    onClick={() => onSelect(selected)}
                >
                    Confirm Hall
                </button>
            </div>
        </div>
    );
};

// ─── Submit Complaint Form ─────────────────────────────────────────────────────

const SubmitForm = ({ onClose, onSuccess }) => {
    const [category, setCategory] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await submitComplaint({ category, description });
            if (res.merged) {
                setError(`ℹ️ Similar issue already tracked — your vote was added! (Ticket #${res.complaint_id?.slice(0, 8)})`);
            } else {
                onSuccess(res);
            }
        } catch (err) {
            const detail = err.response?.data?.detail;
            if (typeof detail === 'object' && detail?.merged) {
                setError(`ℹ️ Similar issue already tracked — your vote was added!`);
            } else {
                setError(detail || 'Failed to submit complaint.');
            }
        }
        setLoading(false);
    };

    return (
        <div className="maint-modal-overlay" onClick={onClose}>
            <div className="maint-modal maint-modal--form" onClick={e => e.stopPropagation()}>
                <div className="maint-modal__header">
                    <h2>Report an Issue</h2>
                    <button className="maint-modal__close" onClick={onClose}><X size={18} /></button>
                </div>
                {error && <div className="maint-error-banner">{error}</div>}
                <form onSubmit={handleSubmit} className="maint-form">
                    <label>Category</label>
                    <select className="maint-select maint-select--full" value={category} required onChange={e => setCategory(e.target.value)}>
                        <option value="">Select category…</option>
                        {CATEGORIES.map(c => (
                            <option key={c} value={c}>{CATEGORY_ICONS[c]} {c.charAt(0).toUpperCase() + c.slice(1)}</option>
                        ))}
                    </select>
                    {PERSONAL_CATEGORIES.has(category) && (
                        <p className="maint-form__hint">
                            ⚠️ Personal issue — you'll need to confirm when the worker marks it resolved.
                        </p>
                    )}
                    <label>Description</label>
                    <textarea
                        className="maint-textarea"
                        placeholder="Describe the issue clearly…"
                        value={description}
                        required
                        minLength={10}
                        onChange={e => setDescription(e.target.value)}
                        rows={4}
                    />
                    <button className="maint-btn maint-btn--primary maint-btn--full" disabled={loading}>
                        {loading ? 'Submitting…' : 'Submit Complaint'}
                    </button>
                </form>
            </div>
        </div>
    );
};

// ─── Main Page ─────────────────────────────────────────────────────────────────

const MaintenancePage = () => {
    const navigate = useNavigate();

    // State
    const [halls, setHalls] = useState([]);
    const [myHallId, setMyHallId] = useState(() => localStorage.getItem('kgp_hall_id'));
    const [showHallModal, setShowHallModal] = useState(false);

    const [view, setView] = useState('my');   // 'my' | 'queue' | 'escalated'
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showSubmit, setShowSubmit] = useState(false);

    // Detect if user is an authority by attempting to fetch the queue
    const [isAuthority, setIsAuthority] = useState(false);

    // Current user id from token (decoded client-side — Supabase JWT)
    const [currentUserId, setCurrentUserId] = useState(null);
    useEffect(() => {
        try {
            const token = localStorage.getItem('kgp_auth_token');
            if (token) {
                const payload = JSON.parse(atob(token.split('.')[1]));
                setCurrentUserId(payload.sub);
            }
        } catch { /* ignore */ }
    }, []);

    // Load halls list
    useEffect(() => {
        fetchHalls().then(setHalls).catch(() => {});
    }, []);

    // If no hall set yet, show selector
    useEffect(() => {
        if (halls.length > 0 && !myHallId) setShowHallModal(true);
    }, [halls, myHallId]);

    const handleHallSelect = async (hallId) => {
        try {
            await setMyHall(hallId);
            localStorage.setItem('kgp_hall_id', hallId);
            setMyHallId(hallId);
            setShowHallModal(false);
        } catch (err) {
            alert(err.response?.data?.detail || 'Could not set hall');
        }
    };

    // Load complaints based on view
    const loadComplaints = useCallback(async () => {
        setLoading(true);
        try {
            let data;
            if (view === 'my') {
                data = await fetchMyComplaints();
                setIsAuthority(false);
            } else if (view === 'queue') {
                data = await fetchHallQueue();
                setIsAuthority(true);
            } else {
                data = await fetchEscalated();
                setIsAuthority(true);
            }
            setComplaints(data);
        } catch (err) {
            if (view !== 'my') setIsAuthority(false);
            setComplaints([]);
        }
        setLoading(false);
    }, [view]);

    useEffect(() => { loadComplaints(); }, [loadComplaints]);

    const handleStatusUpdate = async (id, status, note) => {
        try {
            await updateComplaintStatus(id, status, note, note);
            loadComplaints();
        } catch (err) {
            alert(err.response?.data?.detail || 'Status update failed');
        }
    };

    const handleConfirm = async (id, confirmed, note) => {
        try {
            await confirmResolution(id, confirmed, note);
            loadComplaints();
        } catch (err) {
            alert(err.response?.data?.detail || 'Confirmation failed');
        }
    };

    const handleGetHistory = async (id) => {
        return fetchComplaintHistory(id);
    };

    const pendingConfirmationCount = complaints.filter(c => c.status === 'pending_confirmation' && c.reporter_id === currentUserId).length;

    return (
        <div className="maint-page">
            {/* Header */}
            <div className="maint-header">
                <button className="maint-back-btn" onClick={() => navigate('/')}>
                    <ArrowLeft size={20} />
                </button>
                <div className="maint-header__title">
                    <Wrench size={22} />
                    <h1>Hall Maintenance</h1>
                </div>
                <button className="maint-refresh-btn" onClick={loadComplaints} title="Refresh">
                    <RefreshCw size={16} />
                </button>
            </div>

            {/* Alert banner for pending confirmation */}
            {pendingConfirmationCount > 0 && (
                <div className="maint-alert-banner">
                    <AlertTriangle size={16} />
                    You have {pendingConfirmationCount} ticket{pendingConfirmationCount > 1 ? 's' : ''} awaiting your confirmation.
                </div>
            )}

            {/* Tab navigation */}
            <div className="maint-tabs">
                <button
                    className={`maint-tab ${view === 'my' ? 'maint-tab--active' : ''}`}
                    onClick={() => setView('my')}
                    id="tab-my-complaints"
                >
                    <ClipboardList size={16} /> My Tickets
                </button>
                <button
                    className={`maint-tab ${view === 'queue' ? 'maint-tab--active' : ''}`}
                    onClick={() => setView('queue')}
                    id="tab-hall-queue"
                >
                    <BarChart2 size={16} /> Hall Queue
                </button>
                <button
                    className={`maint-tab ${view === 'escalated' ? 'maint-tab--active' : ''}`}
                    onClick={() => setView('escalated')}
                    id="tab-escalated"
                >
                    <ShieldAlert size={16} /> Escalated
                </button>
            </div>

            {/* Main content */}
            <div className="maint-content">
                {loading ? (
                    <div className="maint-loading">
                        <RefreshCw size={32} className="maint-spinner" />
                        <p>Loading…</p>
                    </div>
                ) : complaints.length === 0 ? (
                    <div className="maint-empty">
                        <CheckCircle2 size={48} />
                        <p>{view === 'my' ? 'No complaints submitted yet.' : 'No tickets in this queue.'}</p>
                        {view === 'my' && (
                            <button className="maint-btn maint-btn--primary" onClick={() => setShowSubmit(true)}>
                                Report an Issue
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="maint-list">
                        {complaints.map(c => (
                            <ComplaintCard
                                key={c.id}
                                complaint={c}
                                isAdmin={isAuthority}
                                currentUserId={currentUserId}
                                onStatusUpdate={handleStatusUpdate}
                                onConfirm={handleConfirm}
                                onHistory={handleGetHistory}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* FAB: Report issue */}
            {view === 'my' && (
                <button className="maint-fab" onClick={() => setShowSubmit(true)} id="fab-report-issue">
                    <Plus size={24} />
                </button>
            )}

            {/* Modals */}
            {showHallModal && (
                <HallSelectModal halls={halls} onSelect={handleHallSelect} />
            )}
            {showSubmit && (
                <SubmitForm
                    onClose={() => setShowSubmit(false)}
                    onSuccess={() => { setShowSubmit(false); loadComplaints(); }}
                />
            )}
        </div>
    );
};

export default MaintenancePage;
