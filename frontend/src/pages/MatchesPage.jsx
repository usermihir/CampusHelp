import React, { useState } from 'react';
import MatchesDashboard from '../components/MatchesDashboard';
import { Bell, Home } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import './LostFound.css';

const MatchesPage = () => {
    const [refreshMatches, setRefreshMatches] = useState(0);
    const navigate = useNavigate();

    return (
        <div className="lf-vintage-wrapper">
            <div className="bg-decoration-bottom-right"></div>
            
            {/* Vintage Navbar */}
            <nav className="lf-navbar">
                <div className="lf-nav-brand" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
                    <div className="lf-brand-top">
                        <Home size={28} color="#2b1f16" />
                        <span className="lf-brand-title font-serif">CampusHelp</span>
                    </div>
                    <span className="lf-brand-subtitle">Matches</span>
                    <span className="lf-tagline font-hand">Helping each other, one step at a time. ♡</span>
                </div>
                
                <div className="lf-nav-links">
                    <Link to="/lost-found" className="font-serif">Lost & Found</Link>
                    <Link to="/matches" className="active font-serif">Matches</Link>
                </div>
                
                <div className="lf-nav-right">
                    <Bell size={20} color="#5c4a3d" style={{ cursor: 'pointer' }} />
                    <div className="lf-avatar">M</div>
                </div>
            </nav>

            {/* Main Matches Layout */}
            <div style={{ maxWidth: '1200px', margin: '4rem auto', padding: '0 2rem', position: 'relative', zIndex: 10 }}>
                <MatchesDashboard refreshTrigger={refreshMatches} />
            </div>

            {/* How Our Matching Works Section */}
            <div style={{ maxWidth: '1000px', margin: '4rem auto 0 auto', padding: '0 2rem', position: 'relative', zIndex: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2rem', gap: '1rem' }}>
                    <div style={{ height: '1px', backgroundColor: '#a89178', flex: 1, maxWidth: '100px' }}></div>
                    <h3 className="font-serif" style={{ color: '#2b1f16', margin: 0, fontSize: '1.5rem' }}>How Our Matching Works</h3>
                    <div style={{ height: '1px', backgroundColor: '#a89178', flex: 1, maxWidth: '100px' }}></div>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: '1 1 200px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1px solid #a89178', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#8c7a66' }}>
                            <span className="font-serif" style={{ fontSize: '1.2rem' }}>✍</span>
                        </div>
                        <div>
                            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: '#433324' }}>Description</p>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#5c4a3d' }}>We analyze the details you provide.</p>
                        </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: '1 1 200px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1px solid #a89178', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#8c7a66' }}>
                            <span className="font-serif" style={{ fontSize: '1.2rem' }}>🗂</span>
                        </div>
                        <div>
                            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: '#433324' }}>Category</p>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#5c4a3d' }}>Matching similar categories.</p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: '1 1 200px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1px solid #a89178', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#8c7a66' }}>
                            <span className="font-serif" style={{ fontSize: '1.2rem' }}>📍</span>
                        </div>
                        <div>
                            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: '#433324' }}>Location</p>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#5c4a3d' }}>Items found nearby get priority.</p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: '1 1 200px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1px solid #a89178', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#8c7a66' }}>
                            <span className="font-serif" style={{ fontSize: '1.2rem' }}>🕒</span>
                        </div>
                        <div>
                            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: '#433324' }}>Time</p>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#5c4a3d' }}>Closer in time, higher chance.</p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: '1 1 200px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1px solid #a89178', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#8c7a66' }}>
                            <span className="font-serif" style={{ fontSize: '1.2rem' }}>🖼</span>
                        </div>
                        <div>
                            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: '#433324' }}>Image</p>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#5c4a3d' }}>Visual similarity makes it stronger.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MatchesPage;
