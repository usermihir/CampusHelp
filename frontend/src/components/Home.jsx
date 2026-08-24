import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Search, Bell, Menu, Compass, BookOpen, 
    Home as HomeIcon, Map as MapIcon, Calendar, 
    MessageSquare, Package, ChevronRight, User,
    Wrench, ShieldAlert, Star
} from 'lucide-react';
import './Home.css';

const Home = ({ onLogout }) => {
    const navigate = useNavigate();

    return (
        <div className="vintage-home-wrapper">
            {/* Navbar */}
            <nav className="vintage-navbar">
                <div className="nav-left">
                    <div className="nav-brand">
                        <Compass size={24} className="brand-icon" />
                        <span className="brand-name">CAMPUS HELP</span>
                    </div>
                    <div className="nav-links desktop-only">
                        <a href="#home" className="active">Home</a>
                        <button onClick={() => navigate('/student/lost-found')} className="nav-btn">Lost & Found</button>
                        <a href="#roommate">Roommate</a>
                        <a href="#maintenance" onClick={(e) => { e.preventDefault(); navigate('/student/maintenance'); }}>Maintenance</a>
                        <a href="#reviews">Reviews</a>
                        <button onClick={() => navigate('/student/map')} className="nav-btn">Campus Map</button>
                        <a href="#events">Events</a>
                        <a href="#marketplace">Marketplace</a>
                    </div>
                </div>
                <div className="nav-right">
                    <button className="icon-btn"><Search size={20} /></button>
                    <button className="icon-btn"><Bell size={20} /></button>
                    <button className="profile-btn" onClick={onLogout}>
                        <User size={18} />
                        <span className="desktop-only">Logout</span>
                    </button>
                    <button className="mobile-menu-btn"><Menu size={24} /></button>
                </div>
            </nav>

            {/* Main Content */}
            <main className="vintage-main-content">
                
                {/* Hero Section */}
                <section className="hero-section" id="home">
                    <div className="hero-content">
                        <h1 className="hero-heading">Your Campus,<br/>Better Connected.</h1>
                        <p className="hero-subheading">
                            One place to find what you've lost, discover where you need to go, meet the right people, solve campus problems, and stay connected with everything happening around you.
                        </p>
                        <p className="hero-decorative-text">"A little help from your campus."</p>
                        <div className="hero-actions">
                            <button className="vintage-btn-primary">Explore Campus</button>
                            <button className="vintage-btn-secondary">Report an Issue</button>
                        </div>
                    </div>
                    <div className="hero-illustration">
                        <div className="illustration-placeholder">
                            {/* Placeholder for actual vintage campus sketch */}
                            <Compass size={64} className="placeholder-icon" />
                            <span>Campus Illustration Area</span>
                        </div>
                    </div>
                </section>

                <div className="section-divider"></div>

                {/* Quick Actions */}
                <section className="quick-actions-section">
                    <div className="quick-action-card" onClick={() => navigate('/student/lost-found')}>
                        <Search size={24} className="qa-icon" />
                        <div className="qa-content">
                            <h3>Lost Something?</h3>
                            <p>Find it before it's gone.</p>
                        </div>
                    </div>
                    <div className="quick-action-card" onClick={() => navigate('/student/roommate')}>
                        <HomeIcon size={24} className="qa-icon" />
                        <div className="qa-content">
                            <h3>Need a Roommate?</h3>
                            <p>Find someone who matches your habits.</p>
                        </div>
                    </div>
                    <div className="quick-action-card" onClick={() => navigate('/student/maintenance')}>
                        <Wrench size={24} className="qa-icon" />
                        <div className="qa-content">
                            <h3>Something Broken?</h3>
                            <p>Report it to the right authority.</p>
                        </div>
                    </div>
                    <div className="quick-action-card" onClick={() => navigate('/student/map')}>
                        <MapIcon size={24} className="qa-icon" />
                        <div className="qa-content">
                            <h3>Can't Find a Place?</h3>
                            <p>Search the campus map.</p>
                        </div>
                    </div>
                </section>

                <div className="section-divider"></div>

                {/* Lost & Found Summary */}
                <section className="lost-found-summary" id="lost-found">
                    <div className="section-header">
                        <h2>Lost & Found</h2>
                        <p className="section-subtitle">"Perhaps someone found what you're looking for."</p>
                    </div>
                    
                    <div className="lf-actions">
                        <button className="vintage-btn-primary">I Lost Something</button>
                        <button className="vintage-btn-secondary">I Found Something</button>
                    </div>

                    <div className="lf-recent-items">
                        <div className="lf-card">
                            <div className="lf-image-placeholder"><Search size={24} /></div>
                            <div className="lf-details">
                                <h4>Black Casio Calculator</h4>
                                <p className="lf-meta">Near Nalanda • 2 hours ago</p>
                                <span className="lf-status lost">Lost</span>
                            </div>
                            <div className="lf-match-badge">
                                <span>92% Match</span>
                            </div>
                        </div>
                        <div className="lf-card">
                            <div className="lf-image-placeholder"><Search size={24} /></div>
                            <div className="lf-details">
                                <h4>Blue Water Bottle</h4>
                                <p className="lf-meta">Main Building • Yesterday</p>
                                <span className="lf-status found">Found</span>
                            </div>
                        </div>
                        <div className="lf-card">
                            <div className="lf-image-placeholder"><Search size={24} /></div>
                            <div className="lf-details">
                                <h4>Hero Bicycle</h4>
                                <p className="lf-meta">LBS Hall • 3 days ago</p>
                                <span className="lf-status lost">Lost</span>
                            </div>
                        </div>
                    </div>
                    <div className="view-more-container">
                        <button onClick={() => navigate('/student/lost-found')} className="vintage-link">View All Items <ChevronRight size={16}/></button>
                    </div>
                </section>

                <div className="section-divider"></div>

                {/* Roommate Matching */}
                <section className="roommate-section" id="roommate">
                    <div className="section-header">
                        <h2>Find Someone You Can Actually Live With</h2>
                        <p className="section-subtitle">"Different habits don't always make good roommates."</p>
                        <div className="important-notice">
                            <span>Matching is based on lifestyle compatibility — never caste or religion.</span>
                        </div>
                    </div>

                    <div className="roommate-cards">
                        <div className="roommate-card">
                            <div className="rm-header">
                                <div className="rm-avatar"><User size={24}/></div>
                                <div>
                                    <h4>Aarav (2nd Year)</h4>
                                    <p className="rm-meta">B.Tech Computer Science</p>
                                </div>
                                <div className="rm-compatibility">
                                    <span className="score">87%</span>
                                    <span className="label">Compatible</span>
                                </div>
                            </div>
                            <div className="rm-traits">
                                <span className="trait">Night Owl</span>
                                <span className="trait">Quiet Study</span>
                                <span className="trait">Clean</span>
                                <span className="trait">Introvert</span>
                            </div>
                            <button className="vintage-btn-secondary full-width mt-1">Chat</button>
                        </div>
                        <div className="roommate-card">
                            <div className="rm-header">
                                <div className="rm-avatar"><User size={24}/></div>
                                <div>
                                    <h4>Rohan (1st Year)</h4>
                                    <p className="rm-meta">B.Tech Mechanical</p>
                                </div>
                                <div className="rm-compatibility">
                                    <span className="score">75%</span>
                                    <span className="label">Compatible</span>
                                </div>
                            </div>
                            <div className="rm-traits">
                                <span className="trait">Early Bird</span>
                                <span className="trait">Music On</span>
                                <span className="trait">Average Clean</span>
                                <span className="trait">Extrovert</span>
                            </div>
                            <button className="vintage-btn-secondary full-width mt-1">Chat</button>
                        </div>
                    </div>
                    
                    <div className="rm-actions">
                        <button className="vintage-btn-primary" onClick={() => navigate('/student/roommate')}>Find My Roommate</button>
                        <button className="vintage-btn-secondary" onClick={() => navigate('/student/roommate')}>Browse Profiles</button>
                    </div>
                </section>

                <div className="section-divider"></div>

                {/* Hall Maintenance */}
                <section className="maintenance-section" id="maintenance">
                     <div className="section-header">
                        <h2>Our Halls, Our Responsibility</h2>
                        <p className="section-subtitle">"A well-maintained hall is a second home."</p>
                    </div>
                    <div className="maintenance-stats">
                        <span>18 issues resolved this week.</span>
                    </div>

                    <div className="hall-cards">
                        <div className="hall-card">
                            <h3>Nalanda Complex</h3>
                            <ul className="hall-status-list">
                                <li><span>Cleanliness</span> <span className="status good">Good</span></li>
                                <li><span>Water</span> <span className="status good">Good</span></li>
                                <li><span>Electricity</span> <span className="status attention">Needs Attention</span></li>
                            </ul>
                        </div>
                        <div className="hall-card">
                            <h3>Azad Hall</h3>
                            <ul className="hall-status-list">
                                <li><span>Food Quality</span> <span className="status good">Good</span></li>
                                <li><span>Internet</span> <span className="status reported">Reported</span></li>
                                <li><span>Common Areas</span> <span className="status good">Good</span></li>
                            </ul>
                        </div>
                        <div className="hall-card">
                            <h3>Patel Hall</h3>
                            <ul className="hall-status-list">
                                <li><span>Cleanliness</span> <span className="status attention">Needs Attention</span></li>
                                <li><span>Maintenance</span> <span className="status reported">Reported</span></li>
                                <li><span>Water</span> <span className="status good">Good</span></li>
                            </ul>
                        </div>
                    </div>
                    <div className="mt-2" style={{textAlign: 'center'}}>
                        <button className="vintage-btn-primary">Report a Problem</button>
                    </div>
                </section>

                <div className="section-divider"></div>

                {/* Emergency Reporting */}
                <section className="emergency-section" id="emergency">
                    <div className="emergency-content">
                        <ShieldAlert size={48} className="emergency-icon" />
                        <h2>Something Needs Attention?</h2>
                        <p>Report critical issues like water leakage, electrical hazards, or unsafe areas immediately.</p>
                        <button className="vintage-btn-emergency">Report Emergency</button>
                    </div>
                </section>

                <div className="section-divider"></div>

                {/* Campus Map */}
                <section className="map-section" id="map">
                    <div className="section-header">
                        <h2>Where Is That Place?</h2>
                        <p className="section-subtitle">"Navigate the vast campus with ease."</p>
                    </div>
                    
                    <div className="map-search-container">
                        <div className="map-search-input">
                            <Search size={18} />
                            <input type="text" placeholder="Search Nalanda, CIC, JCB, EE Department..." />
                        </div>
                        
                        <div className="map-result-card">
                            <h3>CIC — Computer & Informatics Centre</h3>
                            <p className="map-landmark">Near Vikramshila Complex</p>
                            <p className="map-details">Main Building Area • 5 mins walk</p>
                            <button className="vintage-btn-secondary mt-1">Open Directions</button>
                        </div>
                    </div>
                    <div className="map-illustration-placeholder">
                        <MapIcon size={48} />
                        <span>Vintage Campus Map Illustration</span>
                    </div>
                </section>

                <div className="section-divider"></div>

                {/* Reviews (Department & Course) */}
                <section className="reviews-section" id="reviews">
                    <div className="section-header">
                        <h2>Learn From Those Who've Been There</h2>
                        <p className="section-subtitle">"Anonymous wisdom passed down."</p>
                    </div>

                    <div className="review-columns">
                        <div className="review-col">
                            <h3>Department Reviews</h3>
                            <div className="review-card">
                                <p className="review-text">"The coursework is challenging but the professors are approachable if you attend regularly. Research opportunities are great."</p>
                                <p className="review-meta">Anonymous · 4th Year</p>
                                <div className="review-tags">
                                    <span>Workload</span><span>Professors</span>
                                </div>
                            </div>
                            <button className="vintage-link mt-1">Write Anonymous Review <ChevronRight size={16}/></button>
                        </div>
                        <div className="review-col">
                            <h3>Course & Professor Reviews</h3>
                            <div className="review-search">
                                <Search size={16} />
                                <input type="text" placeholder="Search course or professor..." />
                            </div>
                            <div className="review-card mt-1">
                                <div className="course-header">
                                    <h4>CS60050 — Operating Systems</h4>
                                    <div className="rating"><Star size={14} className="filled"/><Star size={14} className="filled"/><Star size={14} className="filled"/><Star size={14} className="filled"/><Star size={14}/></div>
                                </div>
                                <ul className="course-stats">
                                    <li>Difficulty: High</li>
                                    <li>Attendance: Strict</li>
                                    <li>Notes Availability: Good</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="section-divider"></div>
                
                {/* Notes & PYQ */}
                <section className="notes-section" id="notes">
                     <div className="section-header">
                        <h2>What Seniors Left Behind</h2>
                        <p className="section-subtitle">"Knowledge preserved for the next generation."</p>
                    </div>
                    <div className="notes-grid">
                        <div className="note-card">
                            <BookOpen size={24} className="note-icon" />
                            <h4>DSP End-Sem PYQs</h4>
                            <p className="note-years">2019 · 2021 · 2023 · 2025</p>
                            <div className="note-actions">
                                <button className="vintage-btn-outline">Preview</button>
                                <button className="vintage-btn-secondary">Download</button>
                            </div>
                        </div>
                        <div className="note-card">
                            <BookOpen size={24} className="note-icon" />
                            <h4>OS Mid-Sem Notes</h4>
                            <p className="note-years">Comprehensive • 45 pages</p>
                            <div className="note-actions">
                                <button className="vintage-btn-outline">Preview</button>
                                <button className="vintage-btn-secondary">Download</button>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="section-divider"></div>

                {/* Events & Hackathons */}
                <section className="events-section" id="events">
                    <div className="events-grid">
                        <div className="events-col">
                            <div className="section-header left-align">
                                <h2>What's Happening on Campus?</h2>
                            </div>
                            <div className="event-list">
                                <div className="event-card">
                                    <div className="event-date"><span>SEPT</span><strong>14</strong></div>
                                    <div className="event-details">
                                        <h4>Spring Fest Auditions</h4>
                                        <p>Tagore Open Air Theatre</p>
                                    </div>
                                </div>
                                <div className="event-card">
                                    <div className="event-date"><span>SEPT</span><strong>18</strong></div>
                                    <div className="event-details">
                                        <h4>AI Workshop</h4>
                                        <p>CSE Department, Room 102</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="events-col">
                            <div className="section-header left-align">
                                <h2>Build Something Great</h2>
                            </div>
                            <div className="hackathon-card">
                                <h4>IIT Bombay Hackathon</h4>
                                <p className="hack-meta">Online • 12 days left</p>
                                <div className="hack-tags">
                                    <span>Web3</span><span>AI</span>
                                </div>
                                <button className="vintage-btn-secondary mt-1">View Hackathon</button>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="section-divider"></div>

                {/* Society Channels */}
                <section className="society-section" id="societies">
                    <div className="section-header">
                        <h2>One Place for Every Society</h2>
                        <p className="section-subtitle">"Stay updated without the WhatsApp clutter."</p>
                    </div>
                    <div className="society-grid">
                        <div className="society-card">
                            <div className="soc-header">
                                <div className="soc-emblem">R</div>
                                <div>
                                    <h4>Robotics Society</h4>
                                    <p className="soc-members">450 Members</p>
                                </div>
                            </div>
                            <p className="soc-announcement">"Workshop registrations open until Friday."</p>
                            <button className="vintage-btn-outline full-width">Enter Channel</button>
                        </div>
                        <div className="society-card">
                            <div className="soc-header">
                                <div className="soc-emblem">SF</div>
                                <div>
                                    <h4>Spring Fest</h4>
                                    <p className="soc-members">1.2k Members</p>
                                </div>
                            </div>
                            <p className="soc-announcement">"Core team selections starting next week!"</p>
                            <button className="vintage-btn-outline full-width">Enter Channel</button>
                        </div>
                    </div>
                </section>

                <div className="section-divider"></div>

                {/* Marketplace */}
                <section className="marketplace-section" id="marketplace">
                    <div className="section-header">
                        <h2>Give Things Another Life</h2>
                        <p className="section-subtitle">"One student's clutter is another student's solution."</p>
                    </div>
                    <div className="market-grid">
                        <div className="market-card">
                            <div className="market-img-placeholder"><Package size={24}/></div>
                            <div className="market-details">
                                <h4>Scientific Calculator</h4>
                                <p className="market-price">₹700</p>
                                <p className="market-meta">Good condition • 3rd Year Seller</p>
                                <button className="vintage-btn-secondary full-width mt-1">Buy</button>
                            </div>
                        </div>
                        <div className="market-card">
                            <div className="market-img-placeholder"><Package size={24}/></div>
                            <div className="market-details">
                                <h4>Mattress (Single)</h4>
                                <p className="market-price">₹400</p>
                                <p className="market-meta">Fair condition • Graduating Senior</p>
                                <button className="vintage-btn-secondary full-width mt-1">Buy</button>
                            </div>
                        </div>
                        <div className="market-card">
                            <div className="market-img-placeholder"><Package size={24}/></div>
                            <div className="market-details">
                                <h4>Engineering Drawing Kit</h4>
                                <p className="market-price">₹250</p>
                                <p className="market-meta">Like new • 2nd Year Seller</p>
                                <button className="vintage-btn-secondary full-width mt-1">Buy</button>
                            </div>
                        </div>
                    </div>
                </section>

            </main>

            {/* Footer */}
            <footer className="vintage-footer">
                <div className="footer-content">
                    <div className="footer-brand">
                        <Compass size={32} className="footer-icon" />
                        <h3>CAMPUSHELP</h3>
                        <p>"Built by students, for students."</p>
                    </div>
                    <div className="footer-links">
                        <a href="#">About</a>
                        <a href="#">Contact</a>
                        <a href="#">Privacy</a>
                        <a href="#">Community Guidelines</a>
                        <a href="#">Report Abuse</a>
                        <a href="#">Help</a>
                    </div>
                </div>
                <div className="footer-bottom">
                    <div className="tiny-divider"></div>
                    <p>CAMPUSHELP • IIT Kharagpur</p>
                </div>
            </footer>
        </div>
    );
};

export default Home;
