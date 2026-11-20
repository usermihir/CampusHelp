import React, { useState, useEffect, useRef } from 'react';
import { Mail, Compass } from 'lucide-react';
import api from '../services/api';
import './Auth.css';

const RESEND_COOLDOWN = 60; // seconds

const Auth = ({ onAuthSuccess }) => {
    const [step, setStep] = useState(1); // 1 = Enter email, 2 = Enter OTP
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    // Resend countdown
    const [resendCooldown, setResendCooldown] = useState(0);
    const cooldownRef = useRef(null);

    const startCooldown = () => {
        setResendCooldown(RESEND_COOLDOWN);
        cooldownRef.current = setInterval(() => {
            setResendCooldown(prev => {
                if (prev <= 1) {
                    clearInterval(cooldownRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    useEffect(() => () => clearInterval(cooldownRef.current), []);

    const clearMessages = () => { setError(''); setMessage(''); };

    // ── Step 1: Request OTP ──────────────────────────────────────
    const handleRequestOTP = async (e) => {
        if (e) e.preventDefault();
        const normalizedEmail = email.trim().toLowerCase();

        // Frontend guard — real enforcement is on the backend
        const domain = normalizedEmail.rsplit
            ? normalizedEmail.split('@').pop()
            : normalizedEmail.split('@').slice(-1)[0];
        if (domain !== 'kgpian.iitkgp.ac.in') {
            setError('Only @kgpian.iitkgp.ac.in email addresses are allowed.');
            return;
        }

        setLoading(true);
        clearMessages();
        try {
            const res = await api.post('/auth/request-otp', { email: normalizedEmail });
            setEmail(normalizedEmail);
            setMessage(res.data.message);
            setStep(2);
            startCooldown();
        } catch (err) {
            setError(
                err.response?.data?.detail ||
                err.message ||
                'Failed to send OTP. Please try again.'
            );
        } finally {
            setLoading(false);
        }
    };

    // ── Resend OTP ───────────────────────────────────────────────
    const handleResend = async () => {
        if (resendCooldown > 0 || loading) return;
        setOtp('');
        clearMessages();
        await handleRequestOTP(null);
    };

    // ── Step 2: Verify OTP ───────────────────────────────────────
    const handleVerifyOTP = async (e) => {
        e.preventDefault();
        setLoading(true);
        clearMessages();
        try {
            const res = await api.post('/auth/verify-otp', { email, token: otp });
            const { access_token, refresh_token } = res.data;
            localStorage.setItem('kgp_auth_token', access_token);
            if (refresh_token) {
                localStorage.setItem('kgp_refresh_token', refresh_token);
            }
            onAuthSuccess(access_token);
        } catch (err) {
            setError(
                err.response?.data?.detail ||
                'OTP verification failed. Please check the code and try again.'
            );
        } finally {
            setLoading(false);
        }
    };

    // ── UI ───────────────────────────────────────────────────────
    return (
        <div className="vintage-auth-wrapper">
            <div className="vintage-auth-container">

                {/* Left Side — illustration */}
                <div className="auth-illustration-side desktop-only">
                    <img src="/vintage-illustration.jpg" alt="Vintage Campus" className="vintage-illustration" />
                    <div className="illustration-overlay"></div>
                </div>

                {/* Right Side — form */}
                <div className="auth-form-side">
                    <div className="auth-form-content">

                        <div className="auth-brand">
                            <Compass size={32} />
                        </div>

                        {/* Step indicator */}
                        <div className="auth-step-indicator">
                            <div className={`auth-step-dot ${step >= 1 ? (step > 1 ? 'done' : 'active') : ''}`} />
                            <div className={`auth-step-dot ${step === 2 ? 'active' : ''}`} />
                        </div>

                        <div className="auth-header">
                            <h2>
                                {step === 1 ? 'Welcome to CampusHelp' : 'Verify your email'}
                            </h2>
                            <p className="auth-subtitle">
                                {step === 1
                                    ? '"Sign in or create an account."'
                                    : `"Enter the code sent to ${email}"`}
                            </p>
                        </div>

                        <div className="ornamental-divider" style={{ marginBottom: '2.5rem' }}></div>

                        {message && (
                            <div style={{ marginBottom: '1.5rem', color: '#2e7d32', fontSize: '0.9rem', padding: '1rem', backgroundColor: '#e8f5e9', borderRadius: '2px', borderLeft: '4px solid #4caf50' }}>
                                {message}
                            </div>
                        )}
                        {error && (
                            <div style={{ marginBottom: '1.5rem', color: '#c62828', fontSize: '0.9rem', padding: '1rem', backgroundColor: '#ffebee', borderRadius: '2px', borderLeft: '4px solid #ef5350' }}>
                                {error}
                            </div>
                        )}

                        {/* STEP 1 — Email input */}
                        {step === 1 && (
                            <form className="vintage-form" onSubmit={handleRequestOTP}>
                                <div className="form-group">
                                    <label>KGPian Email Address</label>
                                    <div className="input-wrapper">
                                        <Mail size={18} className="input-icon" />
                                        <input
                                            type="email"
                                            placeholder="student@kgpian.iitkgp.ac.in"
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            required
                                            autoFocus
                                        />
                                    </div>
                                </div>
                                <button type="submit" className="vintage-btn-primary" disabled={loading}>
                                    {loading ? 'Sending...' : 'Send OTP'}
                                </button>
                            </form>
                        )}

                        {/* STEP 2 — OTP input */}
                        {step === 2 && (
                            <form className="vintage-form" onSubmit={handleVerifyOTP}>
                                <div className="form-group">
                                    <label>Verification Code</label>
                                    <div className="input-wrapper otp-wrapper">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            placeholder="——————"
                                            maxLength={6}
                                            pattern="[0-9]{6}"
                                            value={otp}
                                            onChange={e =>
                                                setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                                            }
                                            required
                                            autoFocus
                                            style={{ textAlign: 'center', letterSpacing: '0.3em', paddingLeft: '1rem' }}
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    className="vintage-btn-primary"
                                    disabled={loading || otp.length < 6}
                                    style={{ marginBottom: '1rem' }}
                                >
                                    {loading ? 'Verifying...' : 'Verify & Continue'}
                                </button>

                                {/* Resend + change email */}
                                <div className="form-options" style={{ marginTop: '1rem', justifyContent: 'center', gap: '1rem' }}>
                                    <button
                                        type="button"
                                        className="forgot-password"
                                        onClick={handleResend}
                                        disabled={resendCooldown > 0 || loading}
                                        style={{ background: 'none', border: 'none', cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer', opacity: resendCooldown > 0 ? 0.5 : 1 }}
                                    >
                                        {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
                                    </button>
                                    <span style={{ color: '#d7ccc8' }}>|</span>
                                    <button
                                        type="button"
                                        className="forgot-password"
                                        onClick={() => { setStep(1); setOtp(''); clearMessages(); }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                                    >
                                        Change email
                                    </button>
                                </div>
                            </form>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
};

export default Auth;
