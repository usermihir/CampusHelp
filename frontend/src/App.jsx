import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Auth from './components/Auth';
import Home from './components/Home';
import LostFoundPage from './pages/LostFoundPage';

import MatchesPage from './pages/MatchesPage';

import RoommatePage from './pages/RoommatePage';
import MapPage from './pages/MapPage';
import MaintenancePage from './pages/MaintenancePage';
import MaintenanceAdminPage from './pages/MaintenanceAdminPage';
import HackathonsPage from './pages/HackathonsPage';
import SocietiesPage from './pages/SocietiesPage';
import SocietyDetailPage from './pages/SocietyDetailPage';
import ChannelPage from './pages/ChannelPage';

function App() {
  const [session, setSession] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('kgp_auth_token');
    if (token) {
      setSession({ access_token: token });
      fetchUserProfile(token);
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUserProfile = async (token) => {
    try {
      const res = await fetch('http://localhost:8000/api/users/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUserProfile(data);
      } else {
        handleLogout();
      }
    } catch (e) {
      console.error(e);
      handleLogout();
    }
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('kgp_auth_token');
    localStorage.removeItem('kgp_hall_id');
    setSession(null);
    setUserProfile(null);
  };

  if (loading) {
    return <div style={{display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center'}}>Loading...</div>;
  }

  if (!session || !userProfile) {
    return <Auth onAuthSuccess={(token) => {
      localStorage.setItem('kgp_auth_token', token);
      setSession({ access_token: token });
      fetchUserProfile(token);
    }} />;
  }

  // RBAC Routing Logic
  // Check highest privilege role
  const isHallAdmin = userProfile.roles.some(r => r.role === 'HALL_ADMIN' || r.role === 'SUPER_ADMIN');
  const isElectrician = userProfile.roles.some(r => r.role === 'ELECTRICIAN');

// Role Selector Component
const RoleSelector = ({ roles, onLogout }) => {
  const navigate = useNavigate();

  const handleRoleSelect = (role) => {
    if (role === 'HALL_ADMIN' || role === 'SUPER_ADMIN') {
      navigate('/hall-admin/issues');
    } else if (role === 'ELECTRICIAN') {
      navigate('/electrician');
    } else {
      navigate('/student/home');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0ebd8' }}>
      <h1 style={{ marginBottom: '2rem', fontFamily: 'serif' }}>Select Dashboard</h1>
      <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column', width: '300px' }}>
        {roles.some(r => r.role === 'SUPER_ADMIN' || r.role === 'HALL_ADMIN') && (
          <button 
            onClick={() => handleRoleSelect('HALL_ADMIN')}
            style={{ padding: '15px', fontSize: '1.1rem', backgroundColor: '#3e5c76', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
          >
            Admin Dashboard
          </button>
        )}
        {roles.some(r => r.role === 'ELECTRICIAN') && (
          <button 
            onClick={() => handleRoleSelect('ELECTRICIAN')}
            style={{ padding: '15px', fontSize: '1.1rem', backgroundColor: '#748cab', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
          >
            Electrician Dashboard
          </button>
        )}
        <button 
          onClick={() => handleRoleSelect('STUDENT')}
          style={{ padding: '15px', fontSize: '1.1rem', backgroundColor: '#1d2d44', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
        >
          Student Dashboard
        </button>
      </div>
      <button onClick={onLogout} style={{ marginTop: '2rem', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' }}>
        Logout
      </button>
    </div>
  );
};

  return (
    <BrowserRouter>
      <Routes>
        {/* Hall Admin Routes */}
        {isHallAdmin && (
          <>
            <Route path="/hall-admin/issues" element={<MaintenanceAdminPage />} />
            <Route path="/hall-admin/*" element={<Navigate to="/hall-admin/issues" replace />} />
          </>
        )}

        {/* Electrician Routes (Placeholder for now) */}
        {isElectrician && (
          <Route path="/electrician/*" element={<div>Electrician Dashboard</div>} />
        )}

        {/* Student Routes (Default for all users, admins can also view student UI) */}
        <Route path="/student/home" element={<Home onLogout={handleLogout} />} />
        <Route path="/student/lost-found" element={<LostFoundPage />} />
        <Route path="/student/matches" element={<MatchesPage />} />
        <Route path="/student/roommate" element={<RoommatePage />} />
        <Route path="/student/map" element={<MapPage />} />
        <Route path="/student/maintenance" element={<MaintenancePage />} />
        <Route path="/student/hackathons" element={<HackathonsPage />} />
        <Route path="/student/societies" element={<SocietiesPage />} />
        <Route path="/student/societies/:id" element={<SocietyDetailPage />} />
        <Route path="/student/channels/:id" element={<ChannelPage />} />
        

        {/* Route root to the correct dashboard */}
        <Route path="/" element={
          userProfile.roles.length > 1 
            ? <RoleSelector roles={userProfile.roles} onLogout={handleLogout} /> 
            : <Navigate to="/student/home" replace />
        } />
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
