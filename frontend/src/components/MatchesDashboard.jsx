import React, { useState, useEffect } from 'react';
import { getMatches, getItems, confirmMatch } from '../services/api';
import { CheckCircle, Tag, Gift, Compass } from 'lucide-react';

const MatchesDashboard = ({ refreshTrigger }) => {
    const [matches, setMatches] = useState([]);
    const [itemsMap, setItemsMap] = useState({});
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [matchesData, itemsData] = await Promise.all([
                getMatches(),
                getItems()
            ]);
            setMatches(matchesData);
            
            const map = {};
            itemsData.forEach(item => {
                map[item.id] = item;
            });
            setItemsMap(map);
        } catch (error) {
            console.error('Failed to fetch dashboard data', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [refreshTrigger]);

    const handleConfirm = async (matchId) => {
        try {
            await confirmMatch(matchId);
            fetchData(); // Refresh list
        } catch (error) {
            alert('Failed to confirm match');
        }
    };

    if (loading) {
        return <div className="lf-report-sheet" style={{textAlign: 'center', color: '#5c4a3d'}}>Consulting the archives...</div>;
    }

    return (
        <div className="lf-matches-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
                <div style={{ position: 'relative' }}>
                    <h2 className="font-serif" style={{ margin: 0 }}>Proposed Matches</h2>
                </div>
                <button className="lf-view-all-btn">
                    View All Matches &rarr;
                </button>
            </div>
            
            {matches.length === 0 ? (
                <div className="lf-match-card" style={{ marginTop: '2rem' }}>
                    <p style={{ color: '#5c4a3d', fontStyle: 'italic', textAlign: 'center' }}>No matches found yet. The archives are quiet.</p>
                </div>
            ) : (
                <div className="lf-matches-grid" style={{ marginTop: '2rem' }}>
                    {matches.slice(0, 3).map((match) => {
                        // Prefer lost item image, fallback to found item image
                        const lostItem = itemsMap[match.lost_item_id];
                        const foundItem = itemsMap[match.found_item_id];
                        const imageUrl = lostItem?.image_url || foundItem?.image_url;

                        return (
                            <div key={match.id} className="lf-match-card">
                                <div className={`lf-stamp ${match.status === 'confirmed' ? 'confirmed' : 'proposed'}`}>
                                    {match.status === 'confirmed' ? 'CONFIRMED' : 'PROPOSED'}
                                </div>
                                
                                <div className="lf-match-header-row">
                                    <div className="lf-item-image-placeholder" style={{ padding: imageUrl ? '0' : undefined, overflow: 'hidden' }}>
                                        {imageUrl ? (
                                            <img src={imageUrl} alt="Item" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <Tag size={24} />
                                        )}
                                    </div>
                                    <div className="lf-score-container">
                                        <span className="lf-score-label">Match Score: </span>
                                        <span className="lf-score-value">{(match.similarity_score * 100).toFixed(0)}%</span>
                                    </div>
                                </div>
                                
                                <div className="lf-match-details">
                                    <div className="lf-match-detail-row">
                                        <Tag size={14} className="lf-detail-icon" />
                                        <p><strong>Lost Item:</strong> {lostItem?.title || match.lost_item_id.substring(0, 8)}</p>
                                    </div>
                                    <div className="lf-match-detail-row">
                                        <Gift size={14} className="lf-detail-icon" />
                                        <p><strong>Found Item:</strong> {foundItem?.title || match.found_item_id.substring(0, 8)}</p>
                                    </div>
                                </div>
                                
                                {match.status === 'proposed' ? (
                                    <button className="lf-confirm-btn proposed-action" onClick={() => handleConfirm(match.id)}>
                                        <CheckCircle size={16} />
                                        CONFIRM MATCH
                                    </button>
                                ) : (
                                    <button className="lf-confirm-btn confirmed-action" disabled>
                                        <CheckCircle size={16} />
                                        CONFIRMED
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default MatchesDashboard;
