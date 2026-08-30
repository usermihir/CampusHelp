import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getChannel, getMessages, getChannelMembers,
  removeChannelMember, updateMemberRole, leaveChannel,
  addChannelMember, createChannelSocket
} from '../services/societiesService';
import './ChannelPage.css';
import {
  ArrowLeft, Send, Users, Lock, Hash,
  MoreVertical, Shield, UserMinus, Loader2,
  AlertCircle, ChevronDown, UserPlus, X, Settings
} from 'lucide-react';

const ME = () => localStorage.getItem('kgp_user_id');

function Avatar({ email, size = 32 }) {
  const letter = (email || '?').charAt(0).toUpperCase();
  const colors = ['#687053', '#A65A4B', '#732F2F', '#C4A15A', '#3A2E28', '#5D4F46'];
  const color  = colors[letter.charCodeAt(0) % colors.length];
  return (
    <div
      className="chan-avatar"
      style={{ width: size, height: size, background: color, color: '#F4F1EA', fontSize: size * 0.42 }}
    >
      {letter}
    </div>
  );
}

function MessageBubble({ msg, isMine }) {
  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div className={`chan-msg ${isMine ? 'mine' : 'theirs'}`}>
      {!isMine && <Avatar email={msg.sender_email} />}
      <div className="chan-msg-content">
        {!isMine && <span className="chan-msg-sender">{msg.sender_email}</span>}
        <div className="chan-msg-bubble">
          <p>{msg.content}</p>
          <span className="chan-msg-time">{time}</span>
        </div>
      </div>
    </div>
  );
}

export default function ChannelPage() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const myId     = ME();

  const [channel,  setChannel]  = useState(null);
  const [messages, setMessages] = useState([]);
  const [members,  setMembers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [text,     setText]     = useState('');
  const [sending,  setSending]  = useState(false);
  const [wsStatus, setWsStatus] = useState('connecting'); // connecting | open | closed
  const [showSidebar, setShowSidebar] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore]   = useState(true);
  const [addEmail, setAddEmail] = useState('');

  const wsRef       = useRef(null);
  const bottomRef   = useRef(null);
  const messagesRef = useRef(null);

  // ── Load initial data ──────────────────────────────────────
  useEffect(() => {
    Promise.all([getChannel(id), getMessages(id), getChannelMembers(id)])
      .then(([ch, msgs, mems]) => {
        setChannel(ch);
        setMessages(msgs);
        setMembers(mems);
        if (msgs.length < 50) setHasMore(false);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  // ── WebSocket ──────────────────────────────────────────────
  useEffect(() => {
    if (loading || error) return;

    const connect = () => {
      const ws = createChannelSocket(id);
      wsRef.current = ws;

      ws.onopen  = () => setWsStatus('open');
      ws.onclose = () => {
        setWsStatus('closed');
        // Auto-reconnect after 3s
        setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = e => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.error) return;
          setMessages(prev => {
            // Deduplicate by id
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        } catch { /* ignore */ }
      };
    };

    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [id, loading, error]);

  // ── Scroll to bottom on new messages ──────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send message ───────────────────────────────────────────
  const sendMessage = useCallback(() => {
    const content = text.trim();
    if (!content || wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ content }));
    setText('');
  }, [text]);

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Load older messages (cursor pagination) ────────────────
  const loadOlder = async () => {
    if (!hasMore || loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    const oldestId = messages[0].id;
    const container = messagesRef.current;
    const prevHeight = container?.scrollHeight || 0;
    try {
      const older = await getMessages(id, { beforeId: oldestId, limit: 50 });
      if (older.length < 50) setHasMore(false);
      setMessages(prev => [...older, ...prev]);
      // Preserve scroll position
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevHeight;
        }
      });
    } finally {
      setLoadingOlder(false);
    }
  };

  // ── Member management ──────────────────────────────────────
  const removeMember = async (uid) => {
    if (!window.confirm('Remove this member?')) return;
    try {
      await removeChannelMember(id, uid);
      setMembers(prev => prev.filter(m => m.user_id !== uid));
    } catch (e) { alert(e.message); }
  };

  const toggleRole = async (uid, currentRole) => {
    const newRole = currentRole === 'admin' ? 'member' : 'admin';
    try {
      await updateMemberRole(id, uid, newRole);
      setMembers(prev => prev.map(m => m.user_id === uid ? { ...m, role: newRole } : m));
    } catch (e) { alert(e.message); }
  };

  const handleLeave = async () => {
    if (!window.confirm('Leave this channel?')) return;
    try {
      await leaveChannel(id);
      navigate(-1);
    } catch (e) { alert(e.message); }
  };

  const isMine = (msg) => msg.sender_id === myId;
  const amAdmin = members.find(m => m.user_id === myId)?.role === 'admin';

  if (loading) return (
    <div className="chan-loading">
      <Loader2 size={40} className="chan-spinner" />
    </div>
  );

  if (error) return (
    <div className="chan-error">
      <AlertCircle size={20} /> {error}
    </div>
  );

  return (
    <div className="chan-page">
      {/* ── Top Bar ─────────────────────────────────────── */}
      <div className="chan-topbar">
        <button className="chan-back" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} />
        </button>
        <div className="chan-topbar-info">
          {channel.is_private ? <Lock size={16} /> : <Hash size={16} />}
          <span className="chan-topbar-name">{channel.name}</span>
          {wsStatus === 'connecting' && (
            <span className="chan-ws-status connecting">connecting…</span>
          )}
          {wsStatus === 'closed' && (
            <span className="chan-ws-status closed">reconnecting…</span>
          )}
        </div>
        <div className="chan-topbar-actions">
          <button
            className="chan-sidebar-toggle"
            onClick={() => setShowSidebar(v => !v)}
            title="Members"
          >
            <Users size={18} />
            <span className="chan-member-count">{members.length}</span>
          </button>
        </div>
      </div>

      {/* ── Main Layout ─────────────────────────────────── */}
      <div className="chan-layout">
        {/* Messages */}
        <div className="chan-messages-area" ref={messagesRef}>
          {/* Load older */}
          {hasMore && (
            <div className="chan-load-more">
              <button onClick={loadOlder} disabled={loadingOlder}>
                {loadingOlder ? <Loader2 size={14} className="chan-spinner-sm" /> : <ChevronDown size={14} />}
                {loadingOlder ? 'Loading…' : 'Load older messages'}
              </button>
            </div>
          )}

          {messages.length === 0 && (
            <div className="chan-no-messages">
              <Hash size={48} className="chan-empty-icon" />
              <p>No messages yet. Start the conversation!</p>
            </div>
          )}

          {messages.map((msg, i) => {
            const mine = isMine(msg);
            const prevMsg = messages[i - 1];
            const showDate = !prevMsg ||
              new Date(msg.created_at).toDateString() !== new Date(prevMsg.created_at).toDateString();
            return (
              <React.Fragment key={msg.id}>
                {showDate && (
                  <div className="chan-date-divider">
                    {new Date(msg.created_at).toLocaleDateString([], {
                      weekday: 'long', month: 'long', day: 'numeric'
                    })}
                  </div>
                )}
                <MessageBubble msg={msg} isMine={mine} />
              </React.Fragment>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Members Sidebar */}
        {showSidebar && (
          <div className="chan-sidebar">
            <div className="chan-sidebar-header">
              <span>Members ({members.length})</span>
              <button onClick={() => setShowSidebar(false)}><X size={16} /></button>
            </div>
            <div className="chan-sidebar-body">
              {members.map(m => (
                <div key={m.user_id} className="chan-member-item">
                  <Avatar email={m.email} size={28} />
                  <div className="chan-member-info">
                    <span className="chan-member-email">{m.email}</span>
                    {m.role === 'admin' && (
                      <span className="chan-member-role-badge">
                        <Shield size={10} /> Admin
                      </span>
                    )}
                  </div>
                  {amAdmin && m.user_id !== myId && (
                    <div className="chan-member-actions">
                      <button
                        title={m.role === 'admin' ? 'Demote to member' : 'Promote to admin'}
                        onClick={() => toggleRole(m.user_id, m.role)}
                      >
                        <Shield size={14} />
                      </button>
                      <button title="Remove" onClick={() => removeMember(m.user_id)}>
                        <UserMinus size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Leave */}
            <button className="chan-leave-btn" onClick={handleLeave}>
              Leave channel
            </button>
          </div>
        )}
      </div>

      {/* ── Input Bar ────────────────────────────────────── */}
      <div className="chan-input-bar">
        <div className="chan-input-wrapper">
          <textarea
            className="chan-input"
            placeholder={`Message #${channel.name}…`}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            maxLength={5000}
          />
          <button
            className="chan-send-btn"
            onClick={sendMessage}
            disabled={!text.trim() || wsStatus !== 'open'}
            title="Send (Enter)"
          >
            <Send size={18} />
          </button>
        </div>
        <span className="chan-input-hint">Enter to send · Shift+Enter for new line</span>
      </div>
    </div>
  );
}
