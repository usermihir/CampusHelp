import React, { useState } from 'react';
import { createItem, getUploadUrl } from '../services/api';
import { supabaseClient } from '../services/supabaseClient';
import { Send, Tag, PenTool, Book, MapPin, Paperclip } from 'lucide-react';

const ReportItemForm = ({ onReportSuccess }) => {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        type: 'lost',
        title: '',
        description: '',
        category: 'electronics',
        location: '',
        image: null,
    });

    const handleChange = (e) => {
        if (e.target.name === 'image') {
            setFormData({ ...formData, image: e.target.files[0] });
        } else {
            setFormData({ ...formData, [e.target.name]: e.target.value });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            let submitData = { ...formData };

            if (formData.image) {
                // Step 1: Get presigned URL
                const { path, token, publicUrl } = await getUploadUrl(formData.image.name);
                
                // Step 2: Upload directly to Supabase
                const { error } = await supabaseClient.storage
                    .from('items')
                    .uploadToSignedUrl(path, token, formData.image);
                    
                if (error) {
                    throw new Error(`Upload failed: ${error.message}`);
                }
                
                // Set the public URL to be sent to backend
                submitData.image_url = publicUrl;
            }
            
            // Remove the raw File object before sending to backend
            delete submitData.image;

            await createItem(submitData);
            alert('Item reported successfully!');
            setFormData({ type: 'lost', title: '', description: '', category: 'electronics', location: '', image: null });
            if (onReportSuccess) onReportSuccess();
        } catch (error) {
            console.error('Failed to report item:', error);
            alert('Failed to report item. Is the backend running?');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '3rem', width: '100%', maxWidth: '1000px', flexWrap: 'wrap', justifyContent: 'center' }}>
            
            {/* Left Card */}
            <div className="lf-report-sheet" style={{ flex: '1 1 400px' }}>
                <div className="sheet-corner-decoration">🌿</div>
                <h2 className="font-serif">Report Lost/Found Item 🍃</h2>
                <div className="vintage-ornament"></div>
                
                <div className="lf-form-group">
                    <label>Type</label>
                    <div className="lf-input-wrapper">
                        <Tag size={16} className="lf-input-icon" />
                        <select name="type" value={formData.type} onChange={handleChange} className="lf-input">
                            <option value="lost">Lost Item</option>
                            <option value="found">Found Item</option>
                        </select>
                    </div>
                </div>
                
                <div className="lf-form-group">
                    <label>Title</label>
                    <div className="lf-input-wrapper">
                        <PenTool size={16} className="lf-input-icon" />
                        <input 
                            type="text" 
                            name="title" 
                            value={formData.title} 
                            onChange={handleChange} 
                            placeholder="e.g. Blue Milton Bottle"
                            className="lf-input"
                            required 
                        />
                    </div>
                </div>
                
                <div className="lf-form-group">
                    <label>Description (Optional)</label>
                    <div className="lf-input-wrapper">
                        <PenTool size={16} className="lf-input-icon" />
                        <textarea 
                            name="description" 
                            value={formData.description} 
                            onChange={handleChange} 
                            placeholder="Distinctive marks, contents, etc."
                            className="lf-input"
                            rows="3"
                        />
                    </div>
                </div>
            </div>

            {/* Right Card */}
            <div className="lf-report-sheet" style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column' }}>
                <div className="sheet-corner-decoration" style={{ right: '-15px', left: 'auto', transform: 'rotate(15deg) scaleX(-1)' }}>🌿</div>
                <h2 className="font-serif">Additional Details 🍂</h2>
                <div className="vintage-ornament"></div>

                <div className="lf-form-group">
                    <label>Category</label>
                    <div className="lf-input-wrapper">
                        <Book size={16} className="lf-input-icon" />
                        <select name="category" value={formData.category} onChange={handleChange} className="lf-input">
                            <option value="electronics">Electronics</option>
                            <option value="id_card">ID Card / Wallet</option>
                            <option value="bottle">Bottle / Mug</option>
                            <option value="bag">Bag / Backpack</option>
                            <option value="keys">Keys</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                </div>
                
                <div className="lf-form-group">
                    <label>Location (Optional)</label>
                    <div className="lf-input-wrapper">
                        <MapPin size={16} className="lf-input-icon" />
                        <input 
                            type="text" 
                            name="location" 
                            value={formData.location} 
                            onChange={handleChange} 
                            placeholder="e.g. Nalanda Classroom Complex"
                            className="lf-input"
                        />
                    </div>
                </div>

                <div className="lf-form-group">
                    <label>Image (Optional)</label>
                    <div className="lf-file-upload-wrapper">
                        <Paperclip size={16} className="lf-input-icon" />
                        <div className="lf-file-upload-btn">Choose file</div>
                        <span className="lf-file-upload-text">
                            {formData.image ? formData.image.name : 'No file chosen'}
                        </span>
                        <input 
                            type="file" 
                            name="image" 
                            accept="image/*"
                            onChange={handleChange} 
                            className="lf-file-input-hidden"
                        />
                    </div>
                </div>
                
                <div style={{ flex: 1 }}></div> {/* Pushes button to bottom */}
                
                <button type="submit" disabled={loading} className="lf-submit-btn" style={{ alignSelf: 'flex-end', marginTop: '2rem', padding: '0.75rem 2rem', width: 'auto' }}>
                    <Send size={18} />
                    {loading ? 'Submitting...' : 'Submit Report'}
                </button>
            </div>
        </form>
    );
};

export default ReportItemForm;
