/**
 * societiesService.js
 * API wrapper for the Society Channel feature.
 */

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws';

function authHeaders() {
  const token = localStorage.getItem('kgp_auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: authHeaders(),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── Societies ──────────────────────────────────────────────────

export const getSocieties        = ()             => request('GET',    '/societies');
export const getSociety          = (id)           => request('GET',    `/societies/${id}`);
export const createSociety       = (data)         => request('POST',   '/societies', data);
export const updateSociety       = (id, data)     => request('PATCH',  `/societies/${id}`, data);

// ── Society Admins ─────────────────────────────────────────────

export const addSocietyAdmin     = (socId, uid)   => request('POST',   `/societies/${socId}/admins?user_id=${uid}`);
export const removeSocietyAdmin  = (socId, uid)   => request('DELETE', `/societies/${socId}/admins/${uid}`);

// ── Society Members ────────────────────────────────────────────

export const getSocietyMembers   = (id)           => request('GET',    `/societies/${id}/members`);
export const addSocietyMember    = (socId, uid)   => request('POST',   `/societies/${socId}/members/${uid}`);
export const removeSocietyMember = (socId, uid)   => request('DELETE', `/societies/${socId}/members/${uid}`);

// ── Channels ───────────────────────────────────────────────────

export const getChannels         = (socId)        => request('GET',    `/societies/${socId}/channels`);
export const getChannel          = (id)           => request('GET',    `/channels/${id}`);
export const createChannel       = (socId, data)  => request('POST',   `/societies/${socId}/channels`, data);
export const updateChannel       = (id, data)     => request('PATCH',  `/channels/${id}`, data);
export const archiveChannel      = (id)           => request('DELETE', `/channels/${id}`);

// ── Channel Membership ─────────────────────────────────────────

export const joinChannel         = (id)           => request('POST',   `/channels/${id}/join`);
export const leaveChannel        = (id)           => request('DELETE', `/channels/${id}/leave`);
export const getChannelMembers   = (id)           => request('GET',    `/channels/${id}/members`);
export const addChannelMember    = (chanId, uid)  => request('POST',   `/channels/${chanId}/members/${uid}`);
export const removeChannelMember = (chanId, uid)  => request('DELETE', `/channels/${chanId}/members/${uid}`);
export const updateMemberRole    = (chanId, uid, role) =>
  request('PATCH', `/channels/${chanId}/members/${uid}`, { role });

// ── Messages ───────────────────────────────────────────────────

export const getMessages = (channelId, { beforeId, limit = 50 } = {}) => {
  const params = new URLSearchParams({ limit });
  if (beforeId) params.set('before_id', beforeId);
  return request('GET', `/channels/${channelId}/messages?${params}`);
};

// ── WebSocket helper ───────────────────────────────────────────

export const createChannelSocket = (channelId) => {
  const token = localStorage.getItem('kgp_auth_token');
  return new WebSocket(
    `${WS_BASE}/channels/${channelId}?token=${encodeURIComponent(token)}`
  );
};
