import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, ChevronLeft, User, Users, Search, RefreshCw, Info } from 'lucide-react';
import '../components/Home.css';
import './RoommatePage.css';

const API_URL = 'http://localhost:8000/api';

const RoommatePage = () => {
    const navigate = useNavigate();
    const [profile, setProfile] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    
    // Form state
    const [formData, setFormData] = useState({
        sleep_schedule: 3,
        wake_up_time: 3,
        self_cleanliness: 3,
        self_noise_level: 3,
        self_talkativeness: 3,
        pref_cleanliness: 3,
        pref_noise_level: 3,
        pref_talkativeness: 3,
        smoking: 0,
        requires_non_smoking_roommate: 0,
        hobbies: '',
        free_text_notes: ''
    });

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('kgp_auth_token');
            const response = await fetch(`${API_URL}/roommate/profile/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setProfile(data);
                // Initialize form with existing data if editing
                setFormData(data);
                fetchSuggestions();
            } else {
                setProfile(null);
                setIsEditing(true);
            }
        } catch (error) {
            console.error("Error fetching profile:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchSuggestions = async () => {
        try {
            const token = localStorage.getItem('kgp_auth_token');
            const response = await fetch(`${API_URL}/roommate/suggestions/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setSuggestions(data);
            }
        } catch (error) {
            console.error("Error fetching suggestions:", error);
        }
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const token = localStorage.getItem('kgp_auth_token');
            const response = await fetch(`${API_URL}/roommate/profile`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });
            
            if (response.ok) {
                // After saving, fetch the profile again to get the LLM generated summary
                await fetchProfile();
                setIsEditing(false);
            }
        } catch (error) {
            console.error("Error saving profile:", error);
        } finally {
            setLoading(false);
        }
    };

    const renderSlider = (name, label, minLabel, maxLabel) => (
        <div className="rm-slider-wrapper">
            <label className="rm-slider-title">{label}</label>
            <div className="rm-slider-container">
                <span className="rm-slider-label left">{minLabel}</span>
                <input 
                    type="range" 
                    min="1" max="5" 
                    value={formData[name]}
                    onChange={(e) => setFormData({...formData, [name]: parseFloat(e.target.value)})}
                    className="rm-slider"
                />
                <span className="rm-slider-label right">{maxLabel}</span>
            </div>
        </div>
    );

    if (loading && !profile && !isEditing) {
        return (
            <div className="vintage-home-wrapper" style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                <div className="lf-loading">
                    <RefreshCw className="spinning-icon" size={32} />
                    <p>Consulting the archives...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="vintage-home-wrapper">
            <nav className="vintage-navbar">
                <div className="nav-left">
                    <div className="nav-brand" onClick={() => navigate('/')} style={{cursor: 'pointer'}}>
                        <Compass size={24} className="brand-icon" />
                        <span className="brand-name">CAMPUS HELP</span>
                    </div>
                </div>
                <div className="nav-right">
                    <button className="icon-btn" onClick={() => navigate('/')}><ChevronLeft size={20} /> Back to Home</button>
                </div>
            </nav>

            <main className="vintage-main-content">
                <div className="section-header">
                    <h2>Roommate Matching</h2>
                    <p className="section-subtitle">"Find someone you can actually live with."</p>
                </div>

                {isEditing ? (
                    <div className="rm-form">
                        <div className="rm-form-header">
                            <h2>Roommate Compatibility Profile</h2>
                            <p>Tell us about your lifestyle and what you're looking for in a roommate.</p>
                        </div>
                        <form onSubmit={handleFormSubmit}>
                            <div className="rm-grid">
                                <div className="rm-col">
                                    <h4 className="rm-col-header">About You</h4>
                                    {renderSlider('self_cleanliness', 'Cleanliness', 'Messy', 'Spotless')}
                                    {renderSlider('self_noise_level', 'Noise Tolerance', 'Library Quiet', 'Loud Music')}
                                    {renderSlider('self_talkativeness', 'Talkativeness', 'Silent', 'Chatty')}
                                    {renderSlider('sleep_schedule', 'Sleep Schedule', 'Early Bird', 'Night Owl')}
                                    {renderSlider('wake_up_time', 'Wake Up Time', '5 AM', '12 PM')}
                                </div>
                                <div className="rm-col">
                                    <h4 className="rm-col-header">Ideal Roommate</h4>
                                    {renderSlider('pref_cleanliness', 'Cleanliness', 'Messy OK', 'Must be spotless')}
                                    {renderSlider('pref_noise_level', 'Noise Level', 'Quiet Only', 'Loud OK')}
                                    {renderSlider('pref_talkativeness', 'Talkativeness', 'Silent', 'Chatty')}
                                </div>
                            </div>
                            
                            <div className="rm-checkbox-section">
                                <h4 className="rm-checkbox-section-title">Lifestyle Preferences</h4>
                                <div className="rm-checkbox-row">
                                    <label className="rm-checkbox-label">
                                        <input 
                                            type="checkbox" 
                                            checked={formData.smoking === 1}
                                            onChange={(e) => setFormData({...formData, smoking: e.target.checked ? 1 : 0})}
                                        />
                                        I am a smoker
                                    </label>
                                    <label className="rm-checkbox-label">
                                        <input 
                                            type="checkbox" 
                                            checked={formData.requires_non_smoking_roommate === 1}
                                            onChange={(e) => setFormData({...formData, requires_non_smoking_roommate: e.target.checked ? 1 : 0})}
                                        />
                                        I require a non-smoking roommate
                                    </label>
                                </div>
                            </div>
                            
                            <div className="rm-notes-section" style={{display: 'flex', gap: '2rem', flexWrap: 'wrap'}}>
                                <div style={{flex: 1, minWidth: '300px'}}>
                                    <label className="rm-notes-label">Your Hobbies</label>
                                    <input 
                                        type="text"
                                        className="rm-notes-textarea"
                                        style={{height: '56px', paddingTop: '0', paddingBottom: '0'}}
                                        placeholder="e.g. Guitar, Football, Coding, Reading"
                                        value={formData.hobbies || ''}
                                        onChange={(e) => setFormData({...formData, hobbies: e.target.value})}
                                    />
                                </div>
                                <div style={{flex: 1, minWidth: '300px'}}>
                                    <label className="rm-notes-label">Additional Notes (Optional)</label>
                                    <textarea 
                                        className="rm-notes-textarea"
                                        style={{height: '56px'}}
                                        placeholder="Specific habits, allergies, etc."
                                        value={formData.free_text_notes || ''}
                                        onChange={(e) => setFormData({...formData, free_text_notes: e.target.value})}
                                    ></textarea>
                                </div>
                            </div>
                            
                            {profile && (
                                <div style={{textAlign: 'center', marginBottom: '1rem'}}>
                                    <button type="button" className="vintage-link" onClick={() => setIsEditing(false)}>Cancel Editing</button>
                                </div>
                            )}
                            <button type="submit" className="rm-submit-btn" disabled={loading}>
                                {loading ? 'Saving...' : (profile ? 'Update Profile' : 'Find My Roommate')}
                            </button>
                        </form>
                    </div>
                ) : (
                    <div style={{display: 'flex', flexDirection: 'column', gap: '2rem'}}>
                        {/* Profile Summary Card */}
                        <div className="lf-card" style={{padding: '1.5rem', display: 'flex', gap: '1.5rem', alignItems: 'center', backgroundColor: 'var(--vintage-bg-light)'}}>
                            <div style={{padding: '1rem', backgroundColor: 'var(--vintage-accent)', borderRadius: '50%', color: 'var(--vintage-text)'}}>
                                <User size={48} />
                            </div>
                            <div style={{flex: 1}}>
                                <h3 style={{fontFamily: 'Playfair Display, serif', fontSize: '1.5rem', marginBottom: '0.5rem'}}>Your AI Generated Profile</h3>
                                <p style={{fontStyle: 'italic', color: 'var(--vintage-text-light)', lineHeight: '1.6'}}>
                                    {profile?.llm_profile || "Your profile is still being analyzed by the archives..."}
                                </p>
                            </div>
                            <div>
                                <button className="vintage-btn-secondary" onClick={() => setIsEditing(true)}>Edit Preferences</button>
                            </div>
                        </div>

                        {/* Matches */}
                        <div>
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
                                <h3>Your Top Matches</h3>
                                <button className="vintage-btn-outline" onClick={fetchSuggestions} disabled={loading}>
                                    <RefreshCw size={14} style={{marginRight: '6px'}}/> Refresh
                                </button>
                            </div>
                            
                            {suggestions.length === 0 ? (
                                <div className="lf-card" style={{textAlign: 'center', padding: '3rem'}}>
                                    <Search size={48} style={{color: 'var(--vintage-text-light)', margin: '0 auto 1rem auto'}} />
                                    <h4>No matches found yet</h4>
                                    <p style={{color: 'var(--vintage-text-light)'}}>We are searching the campus. Please check back later.</p>
                                </div>
                            ) : (
                                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem'}}>
                                    {suggestions.map(match => (
                                        <div key={match.id} className="lf-card" style={{padding: '1.5rem', display: 'flex', flexDirection: 'column', height: '100%'}}>
                                            <div style={{display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem'}}>
                                                <div style={{padding: '0.5rem', backgroundColor: 'var(--text-primary)', borderRadius: '50%'}}>
                                                    <User size={24} color="var(--bg-parchment)" />
                                                </div>
                                                <h4 style={{margin: 0, fontSize: '1.2rem'}}>Candidate</h4>
                                            </div>
                                            <div className="lf-match-badge">
                                                {Math.max(0, Math.round(100 - (match.compatibility_score * 12)))}% Match
                                            </div>
                                            
                                            <div style={{flex: 1, backgroundColor: 'rgba(255,255,255,0.4)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--vintage-border)', marginBottom: '1.5rem'}}>
                                                <h5 style={{display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.5rem'}}><Info size={14}/> Compatibility Analysis</h5>
                                                <p style={{fontSize: '0.9rem', lineHeight: '1.5', fontStyle: 'italic', margin: 0}}>
                                                    {match.llm_summary || "Analyzing compatibility..."}
                                                </p>
                                            </div>
                                            
                                            <button className="vintage-btn-primary" style={{width: '100%'}}>Send Message</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default RoommatePage;
