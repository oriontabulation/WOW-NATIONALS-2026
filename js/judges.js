// ============================================
// JUDGE MANAGEMENT FUNCTIONS
// ============================================

import { state, save, getJudgeCurrentAssignment } from './state.js';
import { showNotification, escapeHTML, updatePublicCounts } from './utils.js';

// ============================================
// RENDER JUDGES TAB
// ============================================

// ============================================
// PERMISSION HELPERS
// ============================================
function _isAdmin() {
    return state.auth?.isAuthenticated && state.auth?.currentUser?.role === 'admin';
}
function _currentUserId() {
    return state.auth?.currentUser?.associatedId ?? null;
}

// ============================================
// RENDER JUDGES TAB
// ============================================

function renderJudges() {
    const container = document.getElementById('judges');
    if (!container) return;

    const isAdmin = _isAdmin();
    const role    = state.auth?.currentUser?.role;

    // ── Non-admin, non-judge: render a proper locked landing page inline
    if (!isAdmin && role !== 'judge') {
        const isAuth = state.auth?.isAuthenticated;
        container.innerHTML = `
            <div style="min-height:340px;display:flex;align-items:center;justify-content:center;padding:40px 20px">
                <div style="text-align:center;max-width:460px">
                    <div style="font-size:64px;margin-bottom:16px">⚖️</div>
                    <div style="display:inline-block;background:#fee2e2;color:#991b1b;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:14px">
                        🔒 Restricted
                    </div>
                    <h2 style="margin:0 0 12px;color:#1e293b;font-size:22px">Admin Access Only</h2>
                    <p style="color:#64748b;margin:0 0 28px;font-size:15px;line-height:1.6">
                        Judge management is for tournament administrators only. If you are a judge, 
                        log in with your judge account to access your portal.
                    </p>
                    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
                        ${!isAuth ? `<button onclick="window.showLoginModal()" style="background:#1a73e8;color:white;border:none;padding:12px 28px;border-radius:8px;font-weight:600;cursor:pointer;font-size:15px">🔑 Login</button>` : ''}
                        <button onclick="window.switchTab('public')" style="background:#e2e8f0;color:#1e293b;border:none;padding:12px 28px;border-radius:8px;font-weight:600;cursor:pointer;font-size:15px">← Back to Home</button>
                    </div>
                </div>
            </div>`;
        return;
    }

    const teams = state.teams || [];
    const affiliationHtml = teams.map(team => `
        <label class="custom-checkbox-label">
            <input type="checkbox" class="judge-affil" value="${team.id}"> 
            <span class="affil-text">${escapeHTML(team.name)}</span>
        </label>
    `).join('');

    // ── Admin: full management UI
    if (isAdmin) {
        container.innerHTML = `          
            <div class="section">
                <h2>Add New Judge</h2>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
                    <input type="text" id="judge-name" placeholder="Judge Name" style="padding: 12px;">
                    <input type="email" id="judge-email" placeholder="Email (for private URL)" style="padding: 12px;">
                    <select id="judge-role" style="padding: 12px; border: 1px solid #e2e8f0; border-radius: 6px;">
                        <option value="wing">Wing Judge</option>
                        <option value="chair">Chair</option>
                        <option value="trainee">Trainee</option>
                    </select>
                    <button onclick="window.addJudge()" class="primary" style="padding: 12px;">Add Judge</button>
                </div>
                <div style="margin-top: 15px; padding: 15px; background: #f1f5f9; border-radius: 8px;">
                    <h3 style="margin: 0 0 10px;">Conflict Affiliations</h3>
                    <div style="max-height: 150px; overflow-y: auto;">
                        ${affiliationHtml || '<p>No teams available</p>'}
                    </div>
                </div>
            </div>
            ${(state.judges && state.judges.length > 0) ? `
                <div class="section" style="background: linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%); color: white; padding: 20px; border-radius: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h3 style="margin: 0 0 8px;">Private Judge URLs</h3>
                            <p style="margin: 0; opacity: 0.9; font-size: 14px;">
                                ${Object.keys(state.judgeTokens || {}).length} of ${state.judges.length} judges have URLs
                            </p>
                        </div>
                        <button onclick="window.generateAllJudgeURLs()" 
                                style="background: white; color: #1a73e8; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; cursor: pointer;">
                            Generate URLs for All Judges
                        </button>
                    </div>
                </div>
            ` : ''}
            <div class="section">
                <h2>Judges List</h2>
                <div id="judges-list"></div>
            </div>`;
    } else {
        // ── Judge role: own profile card + read-only list
        const myId    = _currentUserId();
        const myJudge = (state.judges || []).find(j => String(j.id) === String(myId));
        const myAffils = (myJudge?.affiliations || []).map(id => {
            const team = (state.teams || []).find(t => t && t.id == id);
            return team ? team.name : null;
        }).filter(Boolean);

        const teams = state.teams || [];
        const profileAffilHtml = teams.map(team => {
            const checked = (myJudge?.affiliations || []).some(a => a == team.id) ? 'checked' : '';
            return `<label style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer">
                <input type="checkbox" class="my-conflict-affil" value="${team.id}" ${checked}>
                <span>${escapeHTML(team.name)}</span>
            </label>`;
        }).join('');

        container.innerHTML = `
            <!-- User Profile Card -->
            ${myJudge ? `
            <div class="section">
                <h2>👤 My Judge Profile</h2>
                <div id="my-judge-profile">
                <div style="background:white;border:2px solid #bfdbfe;border-radius:12px;padding:20px;margin-bottom:20px">
                    <div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:12px">
                        <div>
                            <div style="font-size:22px;font-weight:700;color:#1e293b">${escapeHTML(myJudge.name)}</div>
                            <div style="display:inline-block;background:${myJudge.role==='chair'?'#dcfce7':'#dbeafe'};color:${myJudge.role==='chair'?'#16a34a':'#1e40af'};padding:2px 12px;border-radius:20px;font-size:12px;font-weight:700;margin-top:4px">${(myJudge.role||'wing').toUpperCase()}</div>
                        </div>
                        <button onclick="window.showEditJudgeProfile('${myJudge.id}')"
                                style="background:#1a73e8;color:white;border:none;padding:10px 20px;border-radius:8px;font-weight:600;cursor:pointer">
                            ✏️ Edit Profile
                        </button>
                    </div>
                    <div style="margin-top:14px;padding-top:14px;border-top:1px solid #e2e8f0">
                        <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:6px">My Conflict Affiliations</div>
                        ${myAffils.length > 0
                            ? myAffils.map(n => `<span style="background:#fee2e2;color:#991b1b;padding:2px 10px;border-radius:20px;font-size:12px;margin:2px;display:inline-block">${escapeHTML(n)}</span>`).join('')
                            : '<span style="color:#94a3b8;font-size:13px">No conflicts declared</span>'}
                    </div>
                </div>
                </div>
            </div>` : `
            <div class="section">
                <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:14px 18px;margin-bottom:20px;font-size:14px;color:#92400e">
                    ⚠️ Your judge profile has not been linked to this account yet. Contact the tournament admin.
                </div>
            </div>`}
            <div class="section">
                <h2>All Judges</h2>
                <div id="judges-list"></div>
            </div>`;
    }

    displayJudges();
}

// ============================================
// DISPLAY JUDGES
// ============================================

function displayJudges() {
    const list = document.getElementById('judges-list');
    if (!list) return;

    const judges   = state.judges || [];
    const isAdmin  = _isAdmin();
    const myId     = _currentUserId(); // associatedId of the logged-in judge user

    if (judges.length === 0) {
        list.innerHTML = '<p style="color: #64748b; text-align: center; padding: 40px;">No judges registered</p>';
        return;
    }

    // Pre-build a judgeId → assignments map once to avoid O(n×R×D) lookups
    // inside the per-judge render loop.
    const assignmentsByJudge = new Map();
    if (typeof getJudgeCurrentAssignment === 'function') {
        try {
            judges.forEach(j => {
                if (j) assignmentsByJudge.set(String(j.id), getJudgeCurrentAssignment(j.id) || []);
            });
        } catch(e) {}
    }

    list.innerHTML = judges.map(judge => {
        if (!judge) return '';
        const affiliations = judge.affiliations || [];
        const conflicts = affiliations.map(id => {
            const team = (state.teams || []).find(t => t && t.id == id);
            return team ? team.name : null;
        }).filter(Boolean).join(', ') || 'None';

        const judgeTokens = state.judgeTokens || {};
        const hasURL  = judgeTokens[judge.id] !== undefined;
        const judgeURL = hasURL && window.getJudgeURL ? window.getJudgeURL(judge.id) : null;

        const assignments    = assignmentsByJudge.get(String(judge.id)) || [];
        const hasAssignments = assignments.length > 0;
        const isOwnProfile   = String(judge.id) === String(myId);

        // ── Build action buttons based on role ────────────────────────────────
        let actionButtons = '';
        if (isAdmin) {
            actionButtons = `
                ${hasURL ? `<button onclick="window.sendJudgeURL('${judge.id}')"
                    style="background:#10b981;color:white;border:none;padding:8px 16px;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px">📧 Send URL</button>` : ''}
                <button onclick="window.showEditJudge('${judge.id}')" class="secondary" style="padding:8px 16px;">Edit</button>
                <button onclick="window.deleteJudge('${judge.id}')" class="danger" style="padding:8px 16px;">Delete</button>`;
        } else if (isOwnProfile) {
            // Judge can only edit their own name
            actionButtons = `<button onclick="window.showEditJudgeNameOnly('${judge.id}')"
                style="background:#1a73e8;color:white;border:none;padding:8px 16px;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px">✏️ Edit My Name</button>`;
        }

        // ── URL block only for admin ──────────────────────────────────────────
        const urlBlock = isAdmin ? `
            <div style="background:white;padding:15px;border-radius:8px;border-left:4px solid ${hasURL ? '#2e7d32' : '#f59e0b'};">
                ${!hasURL ? `
                    <div style="text-align:center;padding:20px;">
                        <div style="font-size:14px;color:#64748b;margin-bottom:12px;">No private URL generated yet</div>
                        <button onclick="window.generateJudgeURL(${judge.id})"
                            style="background:#1a73e8;color:white;border:none;padding:12px 24px;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;">
                            Generate Private URL</button>
                    </div>` : `
                    <div>
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                            <div style="font-weight:600;color:#1e293b;">Private Judge URL <span style="font-size:12px;color:#16a34a;margin-left:8px;">✓ Generated</span></div>
                            <div style="display:flex;gap:8px;">
                                <button onclick="window.copyJudgeURL('${judge.id}')" style="background:#1a73e8;color:white;border:none;padding:6px 16px;border-radius:6px;font-weight:600;cursor:pointer;">Copy URL</button>
                                <button onclick="window.regenerateJudgeURL('${judge.id}')" style="background:#f59e0b;color:white;border:none;padding:6px 16px;border-radius:6px;font-weight:600;cursor:pointer;">Regenerate</button>
                            </div>
                        </div>
                        <div style="background:#f8fafc;padding:10px;border-radius:4px;font-family:monospace;font-size:12px;color:#475569;overflow-x:auto;">
                            ${judgeURL || 'URL not available'}</div>
                    </div>`}
            </div>` : '';

        return `
        <div id="judge-${judge.id}" class="judge-card" style="background:#f8fafc;padding:20px;border-radius:12px;margin-bottom:15px;${isOwnProfile && !isAdmin ? 'border:2px solid #bfdbfe;' : ''}">
            <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:15px;">
                <div style="flex:1;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:5px;">
                        <strong style="font-size:18px;">${escapeHTML(judge.name || 'Unnamed Judge')}</strong>
                        ${isOwnProfile && !isAdmin ? '<span style="background:#dbeafe;color:#1e40af;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700">YOU</span>' : ''}
                        ${hasAssignments ? `<span style="background:${judge.role==='chair'?'#2e7d32':judge.role==='wing'?'#1a73e8':'#b45309'};color:white;padding:2px 10px;border-radius:40px;font-size:12px;">
                            ${(judge.role || 'wing').toUpperCase()}</span>` : ''}
                        ${hasAssignments ? `<span style="background:#22c55e;color:white;padding:2px 10px;border-radius:40px;font-size:12px;">${assignments.length} Room${assignments.length!==1?'s':''}</span>` : ''}
                    </div>
                    <div style="color:#64748b;font-size:14px;margin-bottom:8px;">Conflicts: ${conflicts}</div>
                    ${isAdmin ? `<div style="font-size:13px;margin-top:2px;color:${judge.email?'#10b981':'#f59e0b'};">
                        ${judge.email ? `📧 ${escapeHTML(judge.email)}` : '⚠️ No email saved'}</div>` : ''}
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">${actionButtons}</div>
            </div>
            ${urlBlock}
        </div>`;
    }).join('');
}

// ============================================
// SHOW EDIT JUDGE (admin: full edit)
// ============================================

function showEditJudge(judgeId) {
    if (!_isAdmin()) {
        showNotification('Admin access required', 'error');
        return;
    }
    const judge = (state.judges || []).find(j => j && j.id == judgeId);
    if (!judge) { showNotification('Judge not found', 'error'); return; }
    const card = document.getElementById(`judge-${judgeId}`);
    if (!card) return;

    const judgeAffiliations = judge.affiliations || [];
    let affiliationHtml = '';
    (state.teams || []).forEach(team => {
        if (!team) return;
        const checked = judgeAffiliations.some(a => a == team.id) ? 'checked' : '';
        affiliationHtml += `
            <label style="display: block; margin: 5px 0;">
                <input type="checkbox" class="edit-judge-affil-${judgeId}" value="${team.id}" ${checked}> 
                ${escapeHTML(team.name)} (${escapeHTML(team.code || '')})
            </label>`;
    });

    card.innerHTML = `
        <div style="background: white; padding: 20px; border-radius: 12px;">
            <h3 style="margin-top: 0;">Edit Judge: ${escapeHTML(judge.name)}</h3>
            <div style="margin-bottom: 15px;">
                <label>Judge Name</label>
                <input id="edit-judge-name-${judgeId}" value="${escapeHTML(judge.name)}" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;">
            </div>
            <div style="margin-bottom: 15px;">
                <label>Email Address <span style="color: #64748b; font-size: 12px;">(used to send private URL)</span></label>
                <input type="email" id="edit-judge-email-${judgeId}" value="${escapeHTML(judge.email || '')}" placeholder="judge@example.com" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;">
            </div>
            <div style="margin-bottom: 15px;">
                <label>Role</label>
                <select id="edit-judge-role-${judgeId}" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <option value="chair" ${judge.role === 'chair' ? 'selected' : ''}>Chair</option>
                    <option value="wing" ${judge.role === 'wing' ? 'selected' : ''}>Wing</option>
                    <option value="trainee" ${judge.role === 'trainee' ? 'selected' : ''}>Trainee</option>
                </select>
            </div>
            <div style="margin-bottom: 15px;">
                <label>Conflict Affiliations</label>
                <div style="max-height: 150px; overflow-y: auto; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px;">
                    ${affiliationHtml || '<p>No teams available</p>'}
                </div>
            </div>
            <div style="display: flex; gap: 10px;">
                <button onclick="window.saveEditJudge('${judgeId}')" class="primary" style="padding: 10px 20px;">💾 Save</button>
                <button onclick="window.displayJudges()" class="secondary" style="padding: 10px 20px;">❌ Cancel</button>
            </div>
        </div>`;
}

// ============================================
// SHOW EDIT JUDGE PROFILE (judge role: own full profile — name + conflicts)
// ============================================

function showEditJudgeProfile(judgeId) {
    const myId = _currentUserId();
    if (!state.auth?.isAuthenticated || !myId || String(judgeId) !== String(myId)) {
        showNotification('You can only edit your own profile', 'error');
        return;
    }
    const judge = (state.judges || []).find(j => j && j.id == judgeId);
    if (!judge) { showNotification('Judge not found', 'error'); return; }

    const profileEl = document.getElementById('my-judge-profile');
    if (!profileEl) return;

    const teams = state.teams || [];
    const affilHtml = teams.map(team => {
        const checked = (judge.affiliations || []).some(a => a == team.id) ? 'checked' : '';
        return `<label style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer">
            <input type="checkbox" class="edit-my-affil-${judgeId}" value="${team.id}" ${checked}>
            <span>${escapeHTML(team.name)}</span>
        </label>`;
    }).join('');

    profileEl.innerHTML = `
        <div style="background:white;border:2px solid #bfdbfe;border-radius:12px;padding:20px">
            <h3 style="margin-top:0;color:#1e40af">✏️ Edit Your Profile</h3>
            <div style="margin-bottom:15px">
                <label style="font-weight:600;color:#374151;display:block;margin-bottom:6px">Display Name</label>
                <input id="edit-my-judge-name-${judgeId}" value="${escapeHTML(judge.name)}"
                       style="width:100%;padding:10px;border-radius:8px;border:1px solid #e2e8f0;box-sizing:border-box">
            </div>
            <div style="margin-bottom:15px">
                <label style="font-weight:600;color:#374151;display:block;margin-bottom:6px">Conflict Affiliations</label>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;max-height:180px;overflow-y:auto">
                    ${affilHtml || '<p style="color:#94a3b8;margin:0">No teams available</p>'}
                </div>
                <p style="font-size:12px;color:#64748b;margin:6px 0 0">Select every team you have a connection to (coach, family, institution).</p>
            </div>
            <div style="display:flex;gap:10px">
                <button onclick="window.saveJudgeProfile('${judgeId}')" class="primary" style="padding:10px 20px">💾 Save</button>
                <button onclick="window.displayJudges();window.renderJudges();" class="secondary" style="padding:10px 20px">Cancel</button>
            </div>
        </div>`;
}

function saveJudgeProfile(judgeId) {
    const myId = _currentUserId();
    if (!state.auth?.isAuthenticated || !myId || String(judgeId) !== String(myId)) {
        showNotification('You can only edit your own profile', 'error');
        return;
    }
    const judge = (state.judges || []).find(j => j && j.id == judgeId);
    if (!judge) return;

    const newName = document.getElementById(`edit-my-judge-name-${judgeId}`)?.value.trim();
    if (!newName) { showNotification('Name cannot be empty', 'error'); return; }

    const checkboxes = document.querySelectorAll(`.edit-my-affil-${judgeId}:checked`);
    const affiliations = Array.from(checkboxes).map(cb => {
        const val = cb.value;
        return isNaN(parseInt(val)) ? val : parseInt(val);
    });

    judge.name = newName;
    judge.affiliations = affiliations;

    if (state.auth?.currentUser) state.auth.currentUser.name = newName;
    const authUser = (state.auth?.users || []).find(u => u.associatedId == judgeId);
    if (authUser) authUser.name = newName;

    save();
    renderJudges(); // re-render full view
    showNotification('Profile updated successfully', 'success');
}

// ============================================
// SHOW EDIT JUDGE NAME ONLY (judge role: own profile only)
// ============================================

function showEditJudgeNameOnly(judgeId) {
    const myId = _currentUserId();
    // Must be logged in as a judge AND this must be their own profile
    if (!state.auth?.isAuthenticated || !myId || String(judgeId) !== String(myId)) {
        showNotification('You can only edit your own profile when logged in as a judge', 'error');
        return;
    }
    const judge = (state.judges || []).find(j => j && j.id == judgeId);
    if (!judge) { showNotification('Judge not found', 'error'); return; }
    const card = document.getElementById(`judge-${judgeId}`);
    if (!card) return;

    card.innerHTML = `
        <div style="background:white;padding:20px;border-radius:12px;border:2px solid #bfdbfe;">
            <h3 style="margin-top:0;color:#1e40af;">✏️ Edit Your Display Name</h3>
            <div style="margin-bottom:15px;">
                <label style="font-weight:600;color:#374151;">Display Name</label>
                <input id="edit-judge-name-${judgeId}" value="${escapeHTML(judge.name)}"
                       style="width:100%;padding:10px;border-radius:8px;border:1px solid #e2e8f0;margin-top:6px;">
            </div>
            <p style="font-size:12px;color:#64748b;margin-bottom:15px;">Only your display name can be changed here. Contact the admin for other changes.</p>
            <div style="display:flex;gap:10px;">
                <button onclick="window.saveJudgeNameOnly('${judgeId}')" class="primary" style="padding:10px 20px;">💾 Save</button>
                <button onclick="window.displayJudges()" class="secondary" style="padding:10px 20px;">Cancel</button>
            </div>
        </div>`;
}

// ============================================
// SAVE EDIT JUDGE (admin only)
// ============================================

function saveEditJudge(judgeId) {
    if (!_isAdmin()) { showNotification('Admin access required', 'error'); return; }
    const judges = state.judges || [];
    const judge = judges.find(j => j && j.id == judgeId);
    if (!judge) return;

    const newName = document.getElementById(`edit-judge-name-${judgeId}`)?.value.trim();
    const role    = document.getElementById(`edit-judge-role-${judgeId}`)?.value;
    const email   = document.getElementById(`edit-judge-email-${judgeId}`)?.value.trim().toLowerCase() || '';

    if (!newName) { showNotification('Judge name required', 'error'); return; }

    const checkboxes = document.querySelectorAll(`.edit-judge-affil-${judgeId}:checked`);
    const affiliations = Array.from(checkboxes).map(cb => {
        const val = cb.value;
        return isNaN(parseInt(val)) ? val : parseInt(val);
    });

    judge.name = newName;
    judge.role = role;
    judge.email = email;
    judge.affiliations = affiliations;

    save();
    displayJudges();
    showNotification('Judge updated successfully', 'success');
}

// ============================================
// SAVE JUDGE NAME ONLY (judge role: own profile)
// ============================================

function saveJudgeNameOnly(judgeId) {
    const myId = _currentUserId();
    if (!state.auth?.isAuthenticated || !myId || String(judgeId) !== String(myId)) {
        showNotification('You can only edit your own profile when logged in as a judge', 'error');
        return;
    }
    const judge = (state.judges || []).find(j => j && j.id == judgeId);
    if (!judge) return;

    const newName = document.getElementById(`edit-judge-name-${judgeId}`)?.value.trim();
    if (!newName) { showNotification('Name cannot be empty', 'error'); return; }

    judge.name = newName;
    // Also update the auth user's display name if it matches
    if (state.auth?.currentUser) state.auth.currentUser.name = newName;
    const authUser = (state.auth?.users || []).find(u => u.associatedId == judgeId);
    if (authUser) authUser.name = newName;

    save();
    displayJudges();
    showNotification('Your name has been updated', 'success');
}

// ============================================
// ADD JUDGE (admin only)
// ============================================

function addJudge() {
    if (!_isAdmin()) { showNotification('Admin access required', 'error'); return; }
    const name  = document.getElementById('judge-name')?.value.trim();
    const email = document.getElementById('judge-email')?.value.trim().toLowerCase() || '';
    const role  = document.getElementById('judge-role')?.value;

    if (!name) { showNotification('Judge name required', 'error'); return; }

    const checkboxes   = document.querySelectorAll('.judge-affil:checked');
    const affiliations = Array.from(checkboxes).map(cb => {
        const val = cb.value;
        return isNaN(parseInt(val)) ? val : parseInt(val);
    });

    const newJudge = {
        id: `judge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name, email, role: role || 'wing', affiliations: affiliations || [], active: true
    };

    if (!state.judges) state.judges = [];
    state.judges.push(newJudge);

    save();
    displayJudges();
    updatePublicCounts();
    showNotification('Judge added successfully', 'success');

    document.getElementById('judge-name').value = '';
    if (document.getElementById('judge-email')) document.getElementById('judge-email').value = '';
    document.querySelectorAll('.judge-affil').forEach(cb => cb.checked = false);
}

// ============================================
// DELETE JUDGE (admin only)
// ============================================

function deleteJudge(id) {
    if (!_isAdmin()) { showNotification('Admin access required', 'error'); return; }
    if (confirm('Are you sure you want to delete this judge?')) {
        state.judges = (state.judges || []).filter(j => j && j.id !== id);
        save();
        displayJudges();
        showNotification('Judge deleted', 'info');
    }
}

// ============================================
// REGISTER ON WINDOW (called by onclick handlers)
// ============================================
window.addJudge               = addJudge;
window.deleteJudge            = deleteJudge;
window.showEditJudge          = showEditJudge;
window.showEditJudgeNameOnly  = showEditJudgeNameOnly;
window.showEditJudgeProfile   = showEditJudgeProfile;
window.saveJudgeProfile       = saveJudgeProfile;
window.saveEditJudge          = saveEditJudge;
window.saveJudgeNameOnly      = saveJudgeNameOnly;
window.displayJudges          = displayJudges;
window.renderJudges           = renderJudges;

// ============================================
// EXPORT ALL FUNCTIONS
// ============================================

export {
    renderJudges,
    displayJudges,
    showEditJudge,
    showEditJudgeNameOnly,
    showEditJudgeProfile,
    saveJudgeProfile,
    saveEditJudge,
    saveJudgeNameOnly,
    addJudge,
    deleteJudge
};