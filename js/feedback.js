// ============================================
// Judge feedback management
// ============================================
// IMPORT FILES
import { state, save } from './state.js';
import { escapeHTML, showNotification, closeAllModals } from './utils.js';

// ─── helpers ────────────────────────────────────────────────────────────────
function _isAdmin() {
    return state.auth?.isAuthenticated && state.auth?.currentUser?.role === 'admin';
}
function _isJudge() {
    return state.auth?.isAuthenticated && state.auth?.currentUser?.role === 'judge';
}
function _myJudgeId() {
    return state.auth?.currentUser?.associatedId ?? null;
}

// ============================================================================
// ENTRY POINT — routes to admin view or judge view
// ============================================================================
function renderFeedback() {
    if (_isAdmin()) {
        _renderAdminFeedback();
    } else if (_isJudge()) {
        _renderJudgeFeedbackPortal();
    } else {
        const container = document.getElementById('feedback');
        if (container) container.innerHTML = `
            <div style="text-align:center;padding:80px 20px;color:#64748b">
                <div style="font-size:56px;margin-bottom:12px">🔒</div>
                <h2 style="color:#1e293b">Access Restricted</h2>
                <p>Feedback is only available to judges and admins.</p>
            </div>`;
    }
}

// ============================================================================
// ADMIN VIEW — full overview of all feedback grouped by judge
// ============================================================================
function _renderAdminFeedback() {
    const container = document.getElementById('feedback');
    if (!container) return;

    const feedbackByJudge = {};
    (state.feedback || []).forEach(fb => {
        if (!feedbackByJudge[fb.toJudgeId]) feedbackByJudge[fb.toJudgeId] = [];
        feedbackByJudge[fb.toJudgeId].push(fb);
    });

    const judgeStats = {};
    Object.entries(feedbackByJudge).forEach(([judgeId, feedbacks]) => {
        const avgRating = feedbacks.reduce((sum, fb) => sum + fb.rating, 0) / feedbacks.length;
        judgeStats[judgeId] = { count: feedbacks.length, avgRating, feedbacks };
    });

    container.innerHTML = `
        <div class="section">
            <div style="background:#f1f5f9;padding:20px;border-radius:8px;margin-bottom:20px">
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px">
                    <div style="background:white;padding:15px;border-radius:8px;text-align:center">
                        <div style="font-size:32px;font-weight:600;color:#1a73e8">${(state.feedback || []).length}</div>
                        <div style="color:#64748b;margin-top:5px">Total Feedback</div>
                    </div>
                    <div style="background:white;padding:15px;border-radius:8px;text-align:center">
                        <div style="font-size:32px;font-weight:600;color:#2e7d32">${Object.keys(feedbackByJudge).length}</div>
                        <div style="color:#64748b;margin-top:5px">Judges Reviewed</div>
                    </div>
                    <div style="background:white;padding:15px;border-radius:8px;text-align:center">
                        <div style="font-size:32px;font-weight:600;color:#f59e0b">
                            ${(state.feedback || []).length > 0
                                ? ((state.feedback || []).reduce((s, fb) => s + fb.rating, 0) / (state.feedback || []).length).toFixed(1)
                                : 'N/A'}
                        </div>
                        <div style="color:#64748b;margin-top:5px">Avg Rating</div>
                    </div>
                </div>
            </div>
        </div>

        ${(state.feedback || []).length === 0 ? `
            <div style="text-align:center;padding:60px 20px;color:#64748b">
                <div style="font-size:48px;margin-bottom:15px">📭</div>
                <h3 style="margin:0 0 10px;color:#1e293b">No Feedback Yet</h3>
                <p style="margin:0">Judge feedback will appear here once judges submit evaluations.</p>
            </div>
        ` : `
            <div class="section">
                <h2>Judge Performance Overview</h2>
                <div id="feedback-list" style="display:grid;gap:20px">
                    ${Object.entries(judgeStats)
                        .sort((a,b) => b[1].avgRating - a[1].avgRating)
                        .map(([judgeId, stats]) => {
                            const judge = state.judges.find(j => j.id === parseInt(judgeId));
                            if (!judge) return '';
                            const ratingColor = stats.avgRating >= 4 ? '#2e7d32' : stats.avgRating >= 3 ? '#f59e0b' : '#dc2626';
                            const stars = '⭐'.repeat(Math.round(stats.avgRating));
                            const latest = stats.feedbacks[stats.feedbacks.length - 1];
                            return `
                            <div style="background:white;padding:20px;border-radius:12px;box-shadow:0 2px 4px rgba(0,0,0,.05)">
                                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:15px">
                                    <div style="flex:1">
                                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                                            <h3 style="margin:0;color:#1e293b">${escapeHTML(judge.name)}</h3>
                                            <span style="background:${judge.role==='chair'?'#2e7d32':'#1a73e8'};color:white;padding:2px 10px;border-radius:40px;font-size:12px">
                                                ${judge.role.toUpperCase()}
                                            </span>
                                        </div>
                                        <div style="display:flex;gap:20px;align-items:center">
                                            <span style="font-size:24px;font-weight:600;color:${ratingColor}">${stats.avgRating.toFixed(1)}</span>
                                            <span style="color:#64748b;font-size:14px">/5.0</span>
                                            <span style="font-size:18px">${stars}</span>
                                            <span style="color:#64748b;font-size:14px">${stats.count} review${stats.count!==1?'s':''}</span>
                                        </div>
                                    </div>
                                    <button onclick="window.viewJudgeFeedbackDetails(${judgeId})"
                                            style="background:#1a73e8;color:white;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer">
                                        View Details
                                    </button>
                                </div>
                                <div style="background:#f8fafc;padding:12px;border-radius:6px;border-left:4px solid ${ratingColor}">
                                    <div style="font-size:13px;color:#64748b;margin-bottom:5px">Recent Feedback:</div>
                                    <div style="color:#1e293b;font-style:italic">"${escapeHTML(latest.comment || 'No comment provided')}"</div>
                                    <div style="font-size:12px;color:#64748b;margin-top:5px">— Anonymous</div>
                                </div>
                            </div>`;
                        }).join('')}
                </div>
            </div>
        `}`;
}

// ============================================================================
// JUDGE VIEW — submit feedback + view own anonymous feedback
// ============================================================================
function _renderJudgeFeedbackPortal() {
    const container = document.getElementById('feedback');
    if (!container) return;

    const myId     = _myJudgeId();
    const myJudge  = (state.judges || []).find(j => String(j.id) === String(myId));
    const myName   = myJudge?.name || 'Judge';

    // Feedback this judge has received (shown anonymously — no from-name displayed)
    const received = (state.feedback || []).filter(fb => String(fb.toJudgeId) === String(myId));
    const avgRating = received.length > 0
        ? (received.reduce((s, fb) => s + fb.rating, 0) / received.length).toFixed(1)
        : null;

    // Other judges this judge co-panelled with (potential feedback targets)
    const coPanelledIds = new Set();
    (state.rounds || []).forEach(r => {
        (r.debates || []).forEach(d => {
            const inPanel = (d.panel || []).some(p => String(p.id) === String(myId));
            if (!inPanel) return;
            (d.panel || []).forEach(p => {
                if (String(p.id) !== String(myId)) coPanelledIds.add(String(p.id));
            });
        });
    });

    const coJudges = (state.judges || []).filter(j => coPanelledIds.has(String(j.id)));

    // Already submitted feedback targets
    const alreadySubmitted = new Set(
        (state.feedback || [])
            .filter(fb => String(fb.fromJudgeId) === String(myId))
            .map(fb => String(fb.toJudgeId))
    );

    container.innerHTML = `
    <div style="max-width:760px;margin:0 auto">

        <!-- My Feedback Summary -->
        <div class="section">
            <h2>📬 My Feedback (Anonymous)</h2>
            ${received.length === 0 ? `
            <div style="background:#f8fafc;border-radius:10px;padding:30px;text-align:center;color:#64748b">
                <div style="font-size:36px;margin-bottom:8px">📭</div>
                <p style="margin:0">You haven't received any feedback yet.</p>
            </div>` : `
            <div style="background:#f8fafc;border-radius:10px;padding:20px;margin-bottom:16px">
                <div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap">
                    <div style="text-align:center">
                        <div style="font-size:36px;font-weight:700;color:${parseFloat(avgRating)>=4?'#2e7d32':parseFloat(avgRating)>=3?'#f59e0b':'#dc2626'}">${avgRating}</div>
                        <div style="font-size:22px">${'⭐'.repeat(Math.round(parseFloat(avgRating)))}</div>
                        <div style="color:#64748b;font-size:13px">${received.length} review${received.length!==1?'s':''}</div>
                    </div>
                    <div style="flex:1;min-width:200px">
                        ${[5,4,3,2,1].map(r => {
                            const cnt = received.filter(fb => fb.rating === r).length;
                            const pct = received.length > 0 ? Math.round(cnt / received.length * 100) : 0;
                            return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                                <span style="width:50px;text-align:right;font-size:12px;color:#64748b">${r} ⭐</span>
                                <div style="flex:1;background:#e2e8f0;border-radius:4px;height:8px;overflow:hidden">
                                    <div style="background:#f59e0b;height:100%;width:${pct}%"></div>
                                </div>
                                <span style="width:30px;font-size:12px;color:#64748b">${cnt}</span>
                            </div>`;
                        }).join('')}
                    </div>
                </div>
            </div>
            <div style="display:grid;gap:12px">
                ${[...received].reverse().map(fb => `
                <div style="background:white;padding:15px;border-radius:8px;border-left:4px solid ${fb.rating>=4?'#2e7d32':fb.rating>=3?'#f59e0b':'#dc2626'}">
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                        <span style="font-size:16px">${'⭐'.repeat(fb.rating)}</span>
                        <span style="font-size:12px;color:#94a3b8">${new Date(fb.timestamp).toLocaleDateString()}</span>
                    </div>
                    ${fb.comment
                        ? `<div style="color:#475569;font-style:italic">"${escapeHTML(fb.comment)}"</div>`
                        : '<div style="color:#94a3b8;font-style:italic">No comment provided</div>'}
                    <div style="font-size:11px;color:#94a3b8;margin-top:6px">— Anonymous reviewer</div>
                </div>`).join('')}
            </div>`}
        </div>

        <!-- Submit Feedback -->
        <div class="section">
            <h2>✍️ Submit Feedback</h2>
            ${coJudges.length === 0 ? `
            <div style="background:#f8fafc;border-radius:10px;padding:30px;text-align:center;color:#64748b">
                <div style="font-size:36px;margin-bottom:8px">⚖️</div>
                <p style="margin:0">You'll be able to submit feedback once you've been allocated to a round with other judges.</p>
            </div>` : `
            <div id="feedback-form-container">
                <div style="background:#f8fafc;border-radius:10px;padding:20px">
                    <div style="margin-bottom:16px">
                        <label style="display:block;font-weight:600;color:#374151;margin-bottom:6px">Select Judge to Review</label>
                        <select id="fb-target-judge" onchange="window._onFeedbackTargetChange()"
                                style="width:100%;padding:10px;border-radius:8px;border:1px solid #e2e8f0;font-size:14px">
                            <option value="">— Choose a co-judge —</option>
                            ${coJudges.map(j => {
                                const done = alreadySubmitted.has(String(j.id));
                                return `<option value="${j.id}" ${done?'style="color:#94a3b8"':''}>
                                    ${escapeHTML(j.name)} ${done ? '(already reviewed)' : ''}
                                </option>`;
                            }).join('')}
                        </select>
                    </div>
                    <div id="fb-form-body" style="display:none">
                        <div style="margin-bottom:16px">
                            <label style="display:block;font-weight:600;color:#374151;margin-bottom:8px">Rating *</label>
                            <div id="fb-star-row" style="display:flex;gap:10px">
                                ${[1,2,3,4,5].map(n => `
                                <button type="button" onclick="window._setFeedbackRating(${n})"
                                        id="fb-star-${n}"
                                        style="font-size:28px;background:none;border:none;cursor:pointer;padding:4px;border-radius:6px;transition:transform .1s"
                                        title="${n} star${n!==1?'s':''}">⭐</button>`).join('')}
                            </div>
                            <input type="hidden" id="fb-rating" value="0">
                            <div id="fb-rating-error" style="display:none;color:#dc2626;font-size:12px;margin-top:4px">Please select a rating</div>
                        </div>
                        <div style="margin-bottom:16px">
                            <label style="display:block;font-weight:600;color:#374151;margin-bottom:6px">Comments <span style="font-weight:400;color:#64748b">(optional)</span></label>
                            <textarea id="fb-comment" rows="3"
                                      placeholder="Share constructive feedback about judging quality, consistency, reasoning…"
                                      style="width:100%;padding:10px;border-radius:8px;border:1px solid #e2e8f0;font-size:14px;resize:vertical;box-sizing:border-box"></textarea>
                        </div>
                        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:10px;margin-bottom:14px;font-size:13px;color:#1e40af">
                            🔒 Your feedback is anonymous. The judge will not see your name.
                        </div>
                        <button onclick="window.submitFeedback()"
                                style="background:#1a73e8;color:white;border:none;padding:12px 28px;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px">
                            Submit Feedback
                        </button>
                    </div>
                </div>
            </div>`}
        </div>
    </div>`;

    // Initialise star state
    window._feedbackRating = 0;
}

// ─── Star rating helpers ───────────────────────────────────────────────────
window._setFeedbackRating = function(n) {
    window._feedbackRating = n;
    document.getElementById('fb-rating').value = n;
    for (let i = 1; i <= 5; i++) {
        const btn = document.getElementById(`fb-star-${i}`);
        if (btn) btn.style.opacity = i <= n ? '1' : '0.3';
    }
    const err = document.getElementById('fb-rating-error');
    if (err) err.style.display = 'none';
};

window._onFeedbackTargetChange = function() {
    const sel = document.getElementById('fb-target-judge');
    const body = document.getElementById('fb-form-body');
    if (!sel || !body) return;
    if (sel.value) {
        body.style.display = 'block';
        // reset star state
        window._feedbackRating = 0;
        for (let i = 1; i <= 5; i++) {
            const btn = document.getElementById(`fb-star-${i}`);
            if (btn) btn.style.opacity = '0.3';
        }
        document.getElementById('fb-rating').value = 0;
        const comment = document.getElementById('fb-comment');
        if (comment) comment.value = '';
    } else {
        body.style.display = 'none';
    }
};

// ============================================================================
// SUBMIT FEEDBACK
// ============================================================================
function submitFeedback() {
    if (!_isJudge()) {
        showNotification('Only judges can submit feedback', 'error');
        return;
    }

    const myId    = _myJudgeId();
    const myJudge = (state.judges || []).find(j => String(j.id) === String(myId));
    if (!myId || !myJudge) {
        showNotification('Your judge profile could not be found', 'error');
        return;
    }

    const targetSel = document.getElementById('fb-target-judge');
    const toJudgeId = targetSel?.value;
    if (!toJudgeId) {
        showNotification('Please select a judge to review', 'error');
        return;
    }

    const rating = parseInt(document.getElementById('fb-rating')?.value || '0');
    if (!rating || rating < 1 || rating > 5) {
        const err = document.getElementById('fb-rating-error');
        if (err) err.style.display = 'block';
        showNotification('Please select a star rating', 'error');
        return;
    }

    const comment = document.getElementById('fb-comment')?.value.trim() || '';

    // Check duplicate
    const already = (state.feedback || []).some(
        fb => String(fb.fromJudgeId) === String(myId) && String(fb.toJudgeId) === String(toJudgeId)
    );
    if (already) {
        showNotification('You have already submitted feedback for this judge', 'error');
        return;
    }

    if (!state.feedback) state.feedback = [];
    state.feedback.push({
        id: `fb_${Date.now()}`,
        fromJudgeId:  myId,
        fromJudgeName: myJudge.name, // stored internally for admin; never shown to judges
        toJudgeId:    parseInt(toJudgeId) || toJudgeId,
        rating,
        comment,
        timestamp: new Date().toISOString()
    });

    save();
    showNotification('✅ Feedback submitted — thank you!', 'success');
    _renderJudgeFeedbackPortal(); // refresh view
}

// ============================================================================
// ADMIN: View detailed feedback for a specific judge
// ============================================================================
function viewJudgeFeedbackDetails(judgeId) {
    const judge     = state.judges.find(j => j.id === parseInt(judgeId));
    const feedbacks = (state.feedback || []).filter(fb => fb.toJudgeId === parseInt(judgeId));

    if (!judge || feedbacks.length === 0) return;

    closeAllModals();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) closeAllModals(); };

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.maxWidth = '700px';
    modal.style.maxHeight = '80vh';
    modal.style.overflow = 'auto';

    const avgRating = feedbacks.reduce((sum, fb) => sum + fb.rating, 0) / feedbacks.length;
    const ratingDistribution = [1, 2, 3, 4, 5].map(r =>
        feedbacks.filter(fb => fb.rating === r).length
    );

    modal.innerHTML = `
        <div style="background:linear-gradient(135deg,#1a73e8 0%,#0d47a1 100%);color:white;padding:25px;border-radius:12px 12px 0 0;margin:-20px -20px 20px -20px">
            <h2 style="margin:0 0 10px">Feedback for ${escapeHTML(judge.name)}</h2>
            <span style="background:${judge.role==='chair'?'#2e7d32':'rgba(255,255,255,.2)'};padding:4px 12px;border-radius:40px;font-size:13px">
                ${judge.role.toUpperCase()}
            </span>
        </div>

        <div style="background:#f8fafc;padding:20px;border-radius:8px;margin-bottom:20px">
            <div style="text-align:center;margin-bottom:15px">
                <div style="font-size:48px;font-weight:600;color:#1a73e8">${avgRating.toFixed(1)}</div>
                <div style="font-size:24px;margin:5px 0">${'⭐'.repeat(Math.round(avgRating))}</div>
                <div style="color:#64748b">${feedbacks.length} review${feedbacks.length!==1?'s':''}</div>
            </div>
            <div style="display:grid;gap:8px">
                ${[5,4,3,2,1].map(r => {
                    const cnt = ratingDistribution[r - 1];
                    const pct = feedbacks.length > 0 ? (cnt / feedbacks.length * 100) : 0;
                    return `<div style="display:flex;align-items:center;gap:10px">
                        <span style="width:60px;text-align:right;color:#64748b">${r} ⭐</span>
                        <div style="flex:1;background:#e2e8f0;border-radius:4px;height:8px;overflow:hidden">
                            <div style="background:#f59e0b;height:100%;width:${pct}%"></div>
                        </div>
                        <span style="width:40px;color:#64748b">${cnt}</span>
                    </div>`;
                }).join('')}
            </div>
        </div>

        <div>
            <h3 style="margin:0 0 15px;color:#1e293b">All Reviews</h3>
            <div style="display:grid;gap:15px;max-height:400px;overflow-y:auto;padding-right:10px">
                ${[...feedbacks].reverse().map(fb => `
                <div style="background:white;padding:15px;border-radius:8px;border-left:4px solid ${fb.rating>=4?'#2e7d32':fb.rating>=3?'#f59e0b':'#dc2626'}">
                    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px">
                        <div>
                            <div style="font-weight:600;color:#1e293b">Anonymous</div>
                            <div style="font-size:12px;color:#64748b">${new Date(fb.timestamp).toLocaleString()}</div>
                        </div>
                        <div style="font-size:18px">${'⭐'.repeat(fb.rating)}</div>
                    </div>
                    ${fb.comment
                        ? `<div style="color:#475569;font-style:italic;padding:10px;background:#f8fafc;border-radius:4px">"${escapeHTML(fb.comment)}"</div>`
                        : '<div style="color:#94a3b8;font-style:italic">No comment provided</div>'}
                </div>`).join('')}
            </div>
        </div>

        <div style="margin-top:20px;text-align:center">
            <button onclick="window.closeAllModals()" style="background:#64748b;color:white;border:none;padding:12px 30px;border-radius:8px;font-weight:600;cursor:pointer">Close</button>
        </div>`;

    document.body.appendChild(overlay);
    document.body.appendChild(modal);
}

// Register on window
window.submitFeedback             = submitFeedback;
window.viewJudgeFeedbackDetails   = viewJudgeFeedbackDetails;
window.renderFeedback             = renderFeedback;

// Export
export {
    renderFeedback,
    submitFeedback,
    viewJudgeFeedbackDetails
};