import React, { useState } from 'react';
import { Mail, Compass, KeyRound, Building2, ChevronRight, ArrowLeft } from 'lucide-react';
import api from '../services/api';
import './Auth.css';

const Auth = ({ onAuthSuccess }) => {
    const [mode, setMode] = useState('login'); // 'login', 'signup', 'forgot'
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    // Shared state
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    
    // Signup specific
    const [signupStep, setSignupStep] = useState(1); // 1: Email, 2: OTP, 3: Password & Hall
    const [otp, setOtp] = useState('');
    const [signupToken, setSignupToken] = useState(null);
    const [halls, setHalls] = useState([]);
    const [selectedHallId, setSelectedHallId] = useState('');
    const [hallsLoading, setHallsLoading] = useState(false);

    // Forgot password specific
    const [forgotStep, setForgotStep] = useState(1); // 1: Email, 2: OTP, 3: New Password
    const [resetToken, setResetToken] = useState(null);

    const clearMessages = () => { setMessage(''); setError(''); };

    const loadHalls = async () => {
        setHallsLoading(true);
        try {
            const hallsRes = await api.get('/complaints/halls');
            setHalls(hallsRes.data || []);
        } catch {
            console.error("Could not load halls");
        }
        setHallsLoading(false);
    };

    // ── LOGIN ──────────────────────────────────────────
    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true); clearMessages();
        try {
            const res = await api.post('/auth/login', { email, password });
            const { access_token } = res.data;
            localStorage.setItem('kgp_auth_token', access_token);
            onAuthSuccess(access_token);
        } catch (err) {
            setError(err.response?.data?.detail || 'Login failed. Please check your credentials.');
        }
        setLoading(false);
    };

    // ── SIGNUP ─────────────────────────────────────────
    const handleSignupRequestOtp = async (e) => {
        e.preventDefault();
        setLoading(true); clearMessages();
        try {
            const res = await api.post('/auth/signup/request-otp', { email });
            setMessage(res.data.message);
            setSignupStep(2);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to request OTP');
        }
        setLoading(false);
    };

    const handleSignupVerifyOtp = async (e) => {
        e.preventDefault();
        setLoading(true); clearMessages();
        try {
            const res = await api.post('/auth/signup/verify-otp', { email, token: otp });
            setSignupToken(res.data.signup_token);
            setSignupStep(3);
            loadHalls();
        } catch (err) {
            setError(err.response?.data?.detail || 'Invalid or expired OTP');
        }
        setLoading(false);
    };

    const handleSignupComplete = async (e) => {
        e.preventDefault();
        setLoading(true); clearMessages();
        try {
            const res = await api.post('/auth/signup/complete', { email, password, signup_token: signupToken });
            const { access_token } = res.data;
            if (access_token) {
                localStorage.setItem('kgp_auth_token', access_token);
                // Save hall if selected
                if (selectedHallId) {
                    try {
                        await api.patch(`/complaints/me/hall?hall_id=${selectedHallId}`);
                        localStorage.setItem('kgp_hall_id', selectedHallId);
                    } catch (err) {
                        console.error("Failed to save hall", err);
                    }
                }
                onAuthSuccess(access_token);
            } else {
                setMessage('Account created! You can now log in.');
                setMode('login');
            }
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to complete signup');
        }
        setLoading(false);
    };

    // ── FORGOT PASSWORD ────────────────────────────────
    const handleForgotRequestOtp = async (e) => {
        e.preventDefault();
        setLoading(true); clearMessages();
        try {
            const res = await api.post('/auth/password/request-otp', { email });
            setMessage(res.data.message);
            setForgotStep(2);
        } catch (err) {
            setError(err.response?.data?.detail || 'Request failed');
        }
        setLoading(false);
    };

    const handleForgotVerifyOtp = async (e) => {
        e.preventDefault();
        setLoading(true); clearMessages();
        try {
            const res = await api.post('/auth/password/verify-otp', { email, token: otp });
            setResetToken(res.data.reset_token);
            setForgotStep(3);
        } catch (err) {
            setError(err.response?.data?.detail || 'Invalid OTP');
        }
        setLoading(false);
    };

    const handleForgotReset = async (e) => {
        e.preventDefault();
        setLoading(true); clearMessages();
        try {
            const res = await api.post('/auth/password/reset', { password, reset_token: resetToken });
            setMessage(res.data.message);
            setMode('login');
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to reset password');
        }
        setLoading(false);
    };

    // ── UI RENDERING ───────────────────────────────────
    const renderModeToggle = () => (
        <div className="form-options" style={{ marginTop: '1.5rem', justifyContent: 'center', gap: '1rem' }}>
            {mode !== 'login' && <button type="button" className="forgot-password" onClick={() => {setMode('login'); clearMessages();}} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>Back to Login</button>}
            {mode !== 'signup' && <button type="button" className="forgot-password" onClick={() => {setMode('signup'); setSignupStep(1); clearMessages();}} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>Create Account</button>}
            {mode === 'login' && <button type="button" className="forgot-password" onClick={() => {setMode('forgot'); setForgotStep(1); clearMessages();}} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>Forgot Password?</button>}
        </div>
    );

    return (
        <div className="vintage-auth-wrapper">
            <div className="vintage-auth-container">
                
                {/* Left Side */}
                <div className="auth-illustration-side desktop-only">
                    <img src="/vintage-illustration.jpg" alt="Vintage Campus" className="vintage-illustration" />
                    <div className="illustration-overlay"></div>
                </div>

                {/* Right Side */}
                <div className="auth-form-side">
                    <div className="auth-form-content">
                        
                        <div className="auth-brand">
                            <Compass size={32} />
                        </div>

                        <div className="auth-header">
                            <h2>
                                {mode === 'login' && 'Welcome Back'}
                                {mode === 'signup' && 'Create Account'}
                                {mode === 'forgot' && 'Reset Password'}
                            </h2>
                            <p className="auth-subtitle">
                                {mode === 'login' && '"Access your CampusHelp portal."'}
                                {mode === 'signup' && '"Begin your journey with a simple step."'}
                                {mode === 'forgot' && '"Recover your secure access."'}
                            </p>
                        </div>

                        <div className="ornamental-divider" style={{ marginBottom: '2.5rem' }}></div>

                        {message && <div style={{ marginBottom: '1.5rem', color: '#2e7d32', fontSize: '0.9rem', padding: '1rem', backgroundColor: '#e8f5e9', borderRadius: '2px', borderLeft: '4px solid #4caf50' }}>{message}</div>}
                        {error && <div style={{ marginBottom: '1.5rem', color: '#c62828', fontSize: '0.9rem', padding: '1rem', backgroundColor: '#ffebee', borderRadius: '2px', borderLeft: '4px solid #ef5350' }}>{error}</div>}

                        {/* LOGIN MODE */}
                        {mode === 'login' && (
                            <form className="vintage-form" onSubmit={handleLogin}>
                                <div className="form-group">
                                    <label>Email Address</label>
                                    <div className="input-wrapper">
                                        <Mail size={18} className="input-icon" />
                                        <input type="email" placeholder="student@kgpian.iitkgp.ac.in" value={email} onChange={e => setEmail(e.target.value)} required />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Password</label>
                                    <div className="input-wrapper">
                                        <KeyRound size={18} className="input-icon" />
                                        <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
                                    </div>
                                </div>
                                <button type="submit" className="vintage-btn-primary" disabled={loading}>
                                    {loading ? 'Authenticating...' : 'Sign In'} 
                                </button>
                            </form>
                        )}

                        {/* SIGNUP MODE */}
                        {mode === 'signup' && (
                            <>
                                {signupStep === 1 && (
                                    <form className="vintage-form" onSubmit={handleSignupRequestOtp}>
                                        <div className="form-group">
                                            <label>KGP Email Address</label>
                                            <div className="input-wrapper">
                                                <Mail size={18} className="input-icon" />
                                                <input type="email" placeholder="student@kgpian.iitkgp.ac.in" value={email} onChange={e => setEmail(e.target.value)} required />
                                            </div>
                                        </div>
                                        <button type="submit" className="vintage-btn-primary" disabled={loading}>
                                            {loading ? 'Sending OTP...' : 'Send Verification Code'}
                                        </button>
                                    </form>
                                )}
                                {signupStep === 2 && (
                                    <form className="vintage-form" onSubmit={handleSignupVerifyOtp}>
                                        <div className="form-group">
                                            <label>Verification Code (OTP)</label>
                                            <div className="input-wrapper otp-wrapper">
                                                <input type="text" placeholder="------" maxLength={6} value={otp} onChange={e => setOtp(e.target.value)} required style={{ textAlign: 'center', letterSpacing: '0.2em' }} />
                                            </div>
                                        </div>
                                        <button type="submit" className="vintage-btn-primary" style={{ marginBottom: '1rem' }} disabled={loading}>
                                            {loading ? 'Verifying...' : 'Verify OTP'}
                                        </button>
                                        <button type="button" onClick={handleSignupRequestOtp} className="vintage-btn-primary" style={{ background: 'transparent', color: '#8c7355' }} disabled={loading}>Resend Code</button>
                                    </form>
                                )}
                                {signupStep === 3 && (
                                    <form className="vintage-form" onSubmit={handleSignupComplete}>
                                        <div className="form-group">
                                            <label>Create Password</label>
                                            <div className="input-wrapper">
                                                <KeyRound size={18} className="input-icon" />
                                                <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label>Select Hall (Optional)</label>
                                            <div className="input-wrapper">
                                                <Building2 size={18} className="input-icon" />
                                                <select value={selectedHallId} onChange={e => setSelectedHallId(e.target.value)} style={{ width: '100%', padding: '0.875rem 1rem 0.875rem 2.5rem', background: '#fffbfa', border: '1px solid #d7ccc8', fontFamily: 'Inter', color: '#4e342e' }}>
                                                    <option value="">Select a hall...</option>
                                                    {halls.map(h => (
                                                        <option key={h.id} value={h.id}>{h.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <button type="submit" className="vintage-btn-primary" disabled={loading}>
                                            {loading ? 'Creating...' : 'Complete Account'}
                                        </button>
                                    </form>
                                )}
                            </>
                        )}

                        {/* FORGOT PASSWORD MODE */}
                        {mode === 'forgot' && (
                            <>
                                {forgotStep === 1 && (
                                    <form className="vintage-form" onSubmit={handleForgotRequestOtp}>
                                        <div className="form-group">
                                            <label>Account Email</label>
                                            <div className="input-wrapper">
                                                <Mail size={18} className="input-icon" />
                                                <input type="email" placeholder="student@kgpian.iitkgp.ac.in" value={email} onChange={e => setEmail(e.target.value)} required />
                                            </div>
                                        </div>
                                        <button type="submit" className="vintage-btn-primary" disabled={loading}>
                                            {loading ? 'Sending OTP...' : 'Send Reset Code'}
                                        </button>
                                    </form>
                                )}
                                {forgotStep === 2 && (
                                    <form className="vintage-form" onSubmit={handleForgotVerifyOtp}>
                                        <div className="form-group">
                                            <label>Reset Code (OTP)</label>
                                            <div className="input-wrapper otp-wrapper">
                                                <input type="text" placeholder="------" maxLength={6} value={otp} onChange={e => setOtp(e.target.value)} required style={{ textAlign: 'center', letterSpacing: '0.2em' }} />
                                            </div>
                                        </div>
                                        <button type="submit" className="vintage-btn-primary" style={{ marginBottom: '1rem' }} disabled={loading}>
                                            {loading ? 'Verifying...' : 'Verify OTP'}
                                        </button>
                                        <button type="button" onClick={handleForgotRequestOtp} className="vintage-btn-primary" style={{ background: 'transparent', color: '#8c7355' }} disabled={loading}>Resend Code</button>
                                    </form>
                                )}
                                {forgotStep === 3 && (
                                    <form className="vintage-form" onSubmit={handleForgotReset}>
                                        <div className="form-group">
                                            <label>New Password</label>
                                            <div className="input-wrapper">
                                                <KeyRound size={18} className="input-icon" />
                                                <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
                                            </div>
                                        </div>
                                        <button type="submit" className="vintage-btn-primary" disabled={loading}>
                                            {loading ? 'Updating...' : 'Update Password'}
                                        </button>
                                    </form>
                                )}
                            </>
                        )}

                        {renderModeToggle()}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Auth;
