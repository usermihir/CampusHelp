import axios from 'axios';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
    baseURL: API_URL
});

// Add a request interceptor to attach the JWT token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('kgp_auth_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default api;

export const createItem = async (itemData) => {
    const formData = new FormData();
    
    for (const key in itemData) {
        if (itemData[key] !== null && itemData[key] !== undefined && itemData[key] !== '') {
            formData.append(key, itemData[key]);
        }
    }

    const response = await api.post('/items', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

export const getItems = async () => {
    const response = await api.get('/items');
    return response.data;
};

export const getMatches = async () => {
    const response = await api.get('/matches');
    return response.data;
};

export const confirmMatch = async (matchId) => {
    const response = await api.post(`/matches/${matchId}/confirm`);
    return response.data;
};

// =============================================================
// Hall Maintenance API
// =============================================================

export const fetchHalls = async () => {
    const response = await api.get('/complaints/halls');
    return response.data;
};

export const setMyHall = async (hallId) => {
    const response = await api.patch(`/complaints/me/hall?hall_id=${hallId}`);
    return response.data;
};

export const submitComplaint = async ({ category, description, photo_url }) => {
    const response = await api.post('/complaints', { category, description, photo_url });
    return response.data;
};

export const fetchMyComplaints = async () => {
    const response = await api.get('/complaints/me');
    return response.data;
};

export const fetchHallQueue = async () => {
    const response = await api.get('/complaints/hall-queue');
    return response.data;
};

export const fetchEscalated = async () => {
    const response = await api.get('/complaints/escalated');
    return response.data;
};

export const updateComplaintStatus = async (complaintId, status, note, resolution_note) => {
    const response = await api.patch(`/complaints/${complaintId}/status`, {
        status,
        note,
        resolution_note,
    });
    return response.data;
};

export const confirmResolution = async (complaintId, confirmed, note) => {
    const response = await api.post(`/complaints/${complaintId}/confirm`, { confirmed, note });
    return response.data;
};

export const fetchComplaintHistory = async (complaintId) => {
    const response = await api.get(`/complaints/${complaintId}/history`);
    return response.data;
};

export const fetchHallAnalytics = async (hallId) => {
    const response = await api.get(`/admin/analytics/hall/${hallId}`);
    return response.data;
};

export const fetchSLAPolicies = async () => {
    const response = await api.get('/admin/sla-policies');
    return response.data;
};

export const updateSLAPolicy = async (category, max_hours) => {
    const response = await api.patch(`/admin/sla-policies/${category}`, { max_hours });
    return response.data;
};
