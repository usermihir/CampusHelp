import React from 'react';
import ReportItemForm from '../components/ReportItemForm';
import { Bell, Home } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import './LostFound.css';

const LostFoundPage = () => {
    const navigate = useNavigate();

    return (
        <div className="lf-vintage-wrapper" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div className="bg-decoration-bottom-right"></div>
            
            {/* Vintage Navbar */}
            <nav className="lf-navbar">
                <div className="lf-nav-brand" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
                    <div className="lf-brand-top">
                        <Home size={28} color="#2b1f16" />
                        <span className="lf-brand-title font-serif">CampusHelp</span>
                    </div>
                    <span className="lf-brand-subtitle">Lost & Found</span>
                    <span className="lf-tagline font-hand">Helping each other, one step at a time. ♡</span>
                </div>
                
                <div className="lf-nav-links">
                    <Link to="/lost-found" className="active font-serif">Lost & Found</Link>
                    <Link to="/matches" className="font-serif">Matches</Link>
                </div>
                
                <div className="lf-nav-right">
                    <Bell size={20} color="#5c4a3d" style={{ cursor: 'pointer' }} />
                    <div className="lf-avatar">M</div>
                </div>
            </nav>

            {/* Main Centered Layout */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                <ReportItemForm />
            </div>
        </div>
    );
};

export default LostFoundPage;
