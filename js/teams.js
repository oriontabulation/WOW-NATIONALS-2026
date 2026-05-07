// ============================================
// TEAMS.JS - Team management UI (calls admin functions)
// ============================================

import { state, save } from './state.js';
import { showNotification, escapeHTML, createSpeakerObj } from './utils.js';
import {
    getCategories, teamMatchesCategory
} from './categories.js';

// ── Permission helpers ─────────────────────────────────────────────────────────
function _isAdmin() {
    return state.auth?.isAuthenticated && state.auth?.currentUser?.role === 'admin';
}
function _myTeamId() {
    return state.auth?.currentUser?.associatedId ?? null;
}

// ── Active category filter for the teams list ─────────────────────────────────
let _teamsListCategory = null;

// ── renderTeams ───────────────────────────────────────────────────────────────
function renderTeams() {
    const container = document.getElementById('teams');
    if (!container) return;

    const isAdmin = _isAdmin();
    const role    = state.auth?.currentUser?.role;

    if (!isAdmin && role !== 'team') {
        const isAuth = state.auth?.isAuthenticated;
        container.innerHTML = `
            <div style="min-height:340px;display:flex;align-items:center;justify-content:center;padding:40px 20px">
                <div style="text-align:center;max-width:460px">
                    <div style="font-size:64px;margin-bottom:16px">👥</div>
                    <div style="display:inline-block;background:#fee2e2;color:#991b1b;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:14px">
                        🔒 Restricted
                    </div>
                    <h2 style="margin:0 0 12px;color:#1e293b;font-size:22px">Admin Access Only</h2>
                    <p style="color:#64748b;margin:0 0 28px;font-size:15px;line-height:1.6">
                        Team management is for tournament administrators only. If you are a team member,
                        log in with your team account to update your speaker names.
                    </p>
                    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
                        ${!isAuth ? `<button onclick="window.showLoginModal()" style="background:#1a73e8;color:white;border:none;padding:12px 28px;border-radius:8px;font-weight:600;cursor:pointer;font-size:15px">🔑 Login</button>` : ''}
                        <button onclick="window.switchTab('public')" style="background:#e2e8f0;color:#1e293b;border:none;padding:12px 28px;border-radius:8px;font-weight:600;cursor:pointer;font-size:15px">← Back to Home</button>
                    </div>
                </div>
            </div>`;
        return;
    }

    if (isAdmin) {
        const isSpeech = !!(state.tournaments?.[state.activeTournamentId]?.isSpeechTournament);
        const cats     = getCategories();

        container.innerHTML = `
            <div class="section">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
                    <h2 style="margin:0;">${isSpeech ? 'Register Individual Speaker' : 'Add New Team'}</h2>
                    <label style="display:flex;align-items:center;gap:8px;background:${isSpeech?'#eff6ff':'#f1f5f9'};border:1px solid ${isSpeech?'#bfdbfe':'#e2e8f0'};border-radius:20px;padding:6px 14px;cursor:pointer;font-size:13px;font-weight:600;color:${isSpeech?'#1e40af':'#475569'};">
                        <input type="checkbox" id="speech-mode-toggle" ${isSpeech ? 'checked' : ''}
                               onchange="window.toggleSpeechTournamentMode(this.checked)"
                               style="width:16px;height:16px;accent-color:#1a73e8;cursor:pointer;">
                        🎤 Speech Tournament Mode
                    </label>
                </div>
                ${isSpeech ? `
                <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:13px;color:#1e40af;">
                    ℹ️ Speech mode: each participant registers as an individual. One speaker per entry.
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:12px;">
                    <input type="text"  id="spk-reg-name"   placeholder="Speaker Name"             style="padding:12px;">
                    <input type="text"  id="spk-reg-code"   placeholder="School Code (e.g. SEN)"   style="padding:12px;">
                    <input type="email" id="spk-reg-email"  placeholder="Email (optional)"          style="padding:12px;">
                    <input type="text"  id="spk-reg-school" placeholder="School / Institution"      style="padding:12px;">
                </div>
                <button onclick="window.addIndividualSpeaker()" class="primary" style="padding:12px;margin-bottom:20px;">➕ Register Speaker</button>
                ` : `
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:12px;">
                    <input type="text"  id="team-name"     placeholder="Team Name *"                        style="padding:12px;">
                    <input type="text"  id="team-code"     placeholder="Code (e.g. SEN)"                    style="padding:12px;">
                    <input type="email" id="team-email"    placeholder="Email (for private URL)"            style="padding:12px;">
                    <input type="text"  id="team-speakers" placeholder="Speakers (optional, comma-separated)" style="padding:12px;">
                </div>
                ${cats.length > 0 ? `
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:10px 14px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;">
                    <label style="font-size:13px;font-weight:700;color:#1e293b;white-space:nowrap;">🏷️ Category:</label>
                    <select id="add-team-category" style="flex:1;padding:8px 10px;border-radius:6px;border:1px solid #cbd5e1;font-size:13px;background:white;">
                        <option value="">— None —</option>
                        ${cats.map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('')}
                    </select>
                    <span style="font-size:11px;color:#64748b;white-space:nowrap;">Assign on create</span>
                </div>` : ''}
                <button onclick="window.addTeam()" class="primary" style="padding:12px;margin-bottom:20px;">Add Team</button>
                `}
            </div>
            <div class="section">
                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:16px;">
                    <h2 style="margin:0;">${isSpeech ? 'Registered Speakers' : 'Teams List'}</h2>
                    ${cats.length > 0 ? `
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                        <span style="font-size:12px;color:#64748b;font-weight:500;">Filter:</span>
                        <button onclick="window.filterTeamsByCategory(null)"
                            style="border:1.5px solid ${!_teamsListCategory ? '#1a73e8' : '#e2e8f0'};border-radius:16px;padding:3px 10px;font-size:12px;font-weight:600;cursor:pointer;background:${!_teamsListCategory ? '#1a73e8' : 'white'};color:${!_teamsListCategory ? 'white' : '#64748b'};">
                            All</button>
                        ${cats.map(cat => `
                        <button onclick="window.filterTeamsByCategory('${cat.id}')"
                            style="background:${_teamsListCategory === cat.id ? cat.color : cat.color+'15'};color:${_teamsListCategory === cat.id ? 'white' : cat.color};border:1.5px solid ${cat.color}50;border-radius:16px;padding:3px 10px;font-size:12px;font-weight:600;cursor:pointer;">
                            ${cat.icon} ${escapeHTML(cat.name)}</button>`).join('')}
                    </div>` : ''}
                </div>
                <div id="teams-list"></div>
            </div>`;
    } else {
        container.innerHTML = `
            <div class="section">
                <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 18px;margin-bottom:20px;font-size:14px;color:#1e40af">
                    ℹ️ You can update your team's speaker names. Contact the tournament admin for other changes.
                </div>
                <h2>Your Team</h2>
                <div id="teams-list"></div>
            </div>`;
    }

    displayTeams();
}

function filterTeamsByCategory(catId) {
    _teamsListCategory = catId || null;
    renderTeams();
}

function displayTeams() {
    const list = document.getElementById('teams-list');
    if (!list) return;

    const isAdmin  = _isAdmin();
    const myTeamId = _myTeamId();

    let teamsToShow = isAdmin
        ? state.teams
        : state.teams.filter(t => String(t.id) === String(myTeamId));

    if (isAdmin && _teamsListCategory) {
        teamsToShow = teamsToShow.filter(t => teamMatchesCategory(t, _teamsListCategory));
    }

    if (teamsToShow.length === 0) {
        list.innerHTML = isAdmin
            ? `<p style="color:#64748b;text-align:center;padding:40px;">${_teamsListCategory ? 'No teams in this category.' : 'No teams registered'}</p>`
            : '<p style="color:#64748b;text-align:center;padding:40px;">Your team profile could not be found. Contact the admin.</p>';
        return;
    }

    const cats = getCategories();

    list.innerHTML = teamsToShow.map(team => {
        const isOwnTeam  = String(team.id) === String(myTeamId);
        const teamCatIds = Array.isArray(team.categories) ? team.categories : [];

        // Current category badge (display only)
        const catBadges = teamCatIds.map(cid => {
            const cat = cats.find(c => c.id === cid);
            if (!cat) return '';
            return `<span style="display:inline-flex;align-items:center;background:${cat.color}18;border:1px solid ${cat.color}40;color:${cat.color};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;">${cat.icon} ${escapeHTML(cat.name)}</span>`;
        }).join('');

        // ── Inline category radio buttons (admin only, shown on every card) ──
        // Radio group name is unique per team so selections are independent.
        // Clicking a selected radio again de-selects (sets to "None").
        let catRadioRow = '';
        if (isAdmin && cats.length > 0) {
            const currentCatId = teamCatIds[0] || '';
            const noneChecked  = !currentCatId;

            const noneBtn = `
            <label onclick="if(${noneChecked ? `true` : `false`})return;window.setTeamCategory(${team.id},'')"
                   style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;padding:3px 10px;
                          border-radius:14px;font-size:12px;font-weight:600;
                          border:1.5px solid ${noneChecked ? '#94a3b8' : '#e2e8f0'};
                          background:${noneChecked ? '#94a3b8' : 'white'};
                          color:${noneChecked ? 'white' : '#94a3b8'};">
                <input type="radio" name="teamcat-${team.id}" value=""
                       ${noneChecked ? 'checked' : ''}
                       onchange="window.setTeamCategory(${team.id},'')"
                       style="display:none;">
                ✕ None
            </label>`;

            const catBtns = cats.map(cat => {
                const isSelected = currentCatId === cat.id;
                return `
                <label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;padding:3px 11px;
                              border-radius:14px;font-size:12px;font-weight:700;transition:all .12s;
                              border:1.5px solid ${isSelected ? cat.color : cat.color + '55'};
                              background:${isSelected ? cat.color : cat.color + '12'};
                              color:${isSelected ? '#fff' : cat.color};">
                    <input type="radio" name="teamcat-${team.id}" value="${cat.id}"
                           ${isSelected ? 'checked' : ''}
                           onchange="window.setTeamCategory(${team.id},'${cat.id}')"
                           style="display:none;">
                    ${cat.icon} ${escapeHTML(cat.name)}
                </label>`;
            }).join('');

            catRadioRow = `
            <div style="display:flex;align-items:center;gap:6px;margin-top:10px;padding-top:10px;
                        border-top:1px solid #f1f5f9;flex-wrap:wrap;">
                <span style="font-size:11px;font-weight:600;color:#94a3b8;white-space:nowrap;">🏷️ Category:</span>
                ${noneBtn}
                ${catBtns}
            </div>`;
        }

        let actions = '';
        if (isAdmin) {
            actions = `
                <button onclick="window.showEditTeam(${team.id})" class="secondary">Edit</button>
                <button onclick="window.deleteTeam(${team.id})" class="danger">Delete</button>`;
        } else if (isOwnTeam) {
            actions = `<button onclick="window.showEditSpeakersOnly(${team.id})"
                style="background:#1a73e8;color:white;border:none;padding:8px 16px;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px">
                ✏️ Edit Speakers</button>`;
        }

        return `
        <div id="team-${team.id}" class="team-card" style="background:#f8fafc;padding:20px;border-radius:12px;margin-bottom:15px;${isOwnTeam&&!isAdmin?'border:2px solid #bfdbfe;':''}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
                        <strong style="font-size:18px;color:#1a73e8;">${escapeHTML(team.name)}</strong>
                        <span style="background:#64748b;color:white;padding:2px 10px;border-radius:40px;font-size:12px;">${escapeHTML(team.code || '')}</span>
                        ${isOwnTeam && !isAdmin ? '<span style="background:#dbeafe;color:#1e40af;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700">YOUR TEAM</span>' : ''}
                        ${catBadges}
                    </div>
                    <div style="color:#475569;font-size:14px;">
                        <strong>Speakers:</strong> ${(team.speakers||[]).map(s => escapeHTML(s.name)).join(' | ')}
                    </div>
                    ${catRadioRow}
                </div>
                <div style="display:flex;gap:8px;flex-shrink:0;">${actions}</div>
            </div>
        </div>`;
    }).join('');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateTeamCode(name) {
    const words = name.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length >= 2) return words.slice(0, 3).map(w => w.substring(0, 2)).join('').toUpperCase();
    return words[0].substring(0, 6).toUpperCase();
}

function uniquifyCode(code, excludeId = null) {
    const others = (state.teams || []).filter(t => excludeId === null || t.id !== excludeId);
    const taken  = new Set(others.map(t => t.code));
    if (!taken.has(code)) return code;
    let n = 2;
    const base = code.replace(/\d+$/, '');
    while (taken.has(base + n)) n++;
    return base + n;
}

// ── Add Team ──────────────────────────────────────────────────────────────────
function addTeam() {
    if (!_isAdmin()) { showNotification('Admin access required', 'error'); return; }
    const name          = document.getElementById('team-name')?.value.trim();
    const code          = document.getElementById('team-code')?.value.trim().toUpperCase();
    const email         = document.getElementById('team-email')?.value.trim().toLowerCase() || '';
    const speakersInput = document.getElementById('team-speakers')?.value.trim();

    if (!name) {
        showNotification('Team name is required', 'error');
        return;
    }

    const isSpeech     = !!(state.tournaments?.[state.activeTournamentId]?.isSpeechTournament);
    const speakerNames = speakersInput
        ? speakersInput.split(',').map(s => s.trim()).filter(s => s)
        : [];

    // Standard mode requires at least 3 speakers; speech mode has no minimum
    if (!isSpeech && speakerNames.length < 3) {
        showNotification('At least 3 speakers required (add them as comma-separated names)', 'error');
        return;
    }

    // Read category from the add-form category selector (if present)
    const addCatEl = document.getElementById('add-team-category');
    const selCat   = addCatEl?.value || '';
    const cats     = selCat ? [selCat] : [];

    state.teams.push({
        id: Date.now(),
        name,
        code: uniquifyCode(code || generateTeamCode(name), null),
        email,
        speakers: speakerNames.map(n => createSpeakerObj(n)),
        categories: cats,
        wins: 0, total: 0, roundScores: {}, eliminated: false, broke: false
    });

    displayTeams();
    showNotification('Team added successfully', 'success');
    window.updateNavDropdowns?.();

    ['team-name','team-code','team-email','team-speakers'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    if (addCatEl) addCatEl.value = '';
}

function deleteTeam(id) {
    if (!_isAdmin()) { showNotification('Admin access required', 'error'); return; }
    if (confirm('Are you sure you want to delete this team?')) {
        state.teams = state.teams.filter(t => t.id !== id);
        displayTeams();
        showNotification('Team deleted', 'info');
    }
}

function removeTeamCategory(teamId, catId) {
    if (!_isAdmin()) { showNotification('Admin access required', 'error'); return; }
    const teams = state.teams || [];
    // Replace entire teams array (same pattern as deleteTeam) so proxy fires correctly
    state.teams = teams.map(t =>
        t.id == teamId
            ? { ...t, categories: (t.categories || []).filter(c => c !== catId) }
            : t
    );
    displayTeams();
    window.updateNavDropdowns?.();
}

// ── Inline category assignment (called from radio buttons on each team card) ──
function setTeamCategory(teamId, catId) {
    if (!_isAdmin()) { showNotification('Admin access required', 'error'); return; }
    const team = (state.teams || []).find(t => t.id == teamId);
    if (!team) return;
    // Single-category model: store at most one category per team
    team.categories = catId ? [catId] : [];
    save();
    // Re-render only the affected team card so other open edit cards are untouched
    _refreshTeamCard(teamId);
    window.updateNavDropdowns?.();
}

// Re-renders a single team card in-place without touching any other card
function _refreshTeamCard(teamId) {
    const card = document.getElementById(`team-${teamId}`);
    if (!card) return;
    // If the card is in edit mode, skip the refresh (avoid destroying an open form)
    if (card.querySelector('[data-team-edit="true"]')) return;
    // Build a minimal temporary list to steal the new card HTML from
    const tempDiv = document.createElement('div');
    const isAdmin  = _isAdmin();
    const myTeamId = _myTeamId();
    const team     = (state.teams || []).find(t => t.id == teamId);
    if (!team) { card.remove(); return; }
    const cats       = getCategories();
    const teamCatIds = Array.isArray(team.categories) ? team.categories : [];
    const catBadges  = teamCatIds.map(cid => {
        const cat = cats.find(c => c.id === cid);
        if (!cat) return '';
        return `<span style="display:inline-flex;align-items:center;background:${cat.color}18;border:1px solid ${cat.color}40;color:${cat.color};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;">${cat.icon} ${escapeHTML(cat.name)}</span>`;
    }).join('');

    let catRadioRow = '';
    if (isAdmin && cats.length > 0) {
        const currentCatId = teamCatIds[0] || '';
        const noneChecked  = !currentCatId;
        const noneBtn = `
        <label onclick="if(${noneChecked}===true)return;window.setTeamCategory(${team.id},'')"
               style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;padding:3px 10px;
                      border-radius:14px;font-size:12px;font-weight:600;
                      border:1.5px solid ${noneChecked ? '#94a3b8' : '#e2e8f0'};
                      background:${noneChecked ? '#94a3b8' : 'white'};
                      color:${noneChecked ? 'white' : '#94a3b8'};">
            <input type="radio" name="teamcat-${team.id}" value=""
                   ${noneChecked ? 'checked' : ''}
                   onchange="window.setTeamCategory(${team.id},'')"
                   style="display:none;">
            ✕ None
        </label>`;
        const catBtns = cats.map(cat => {
            const isSelected = currentCatId === cat.id;
            return `
            <label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;padding:3px 11px;
                          border-radius:14px;font-size:12px;font-weight:700;transition:all .12s;
                          border:1.5px solid ${isSelected ? cat.color : cat.color + '55'};
                          background:${isSelected ? cat.color : cat.color + '12'};
                          color:${isSelected ? '#fff' : cat.color};">
                <input type="radio" name="teamcat-${team.id}" value="${cat.id}"
                       ${isSelected ? 'checked' : ''}
                       onchange="window.setTeamCategory(${team.id},'${cat.id}')"
                       style="display:none;">
                ${cat.icon} ${escapeHTML(cat.name)}
            </label>`;
        }).join('');
        catRadioRow = `
        <div style="display:flex;align-items:center;gap:6px;margin-top:10px;padding-top:10px;
                    border-top:1px solid #f1f5f9;flex-wrap:wrap;">
            <span style="font-size:11px;font-weight:600;color:#94a3b8;white-space:nowrap;">🏷️ Category:</span>
            ${noneBtn}${catBtns}
        </div>`;
    }

    const isOwnTeam = String(team.id) === String(myTeamId);
    let actions = '';
    if (isAdmin) {
        actions = `<button onclick="window.showEditTeam(${team.id})" class="secondary">Edit</button>
                   <button onclick="window.deleteTeam(${team.id})" class="danger">Delete</button>`;
    } else if (isOwnTeam) {
        actions = `<button onclick="window.showEditSpeakersOnly(${team.id})"
            style="background:#1a73e8;color:white;border:none;padding:8px 16px;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px">
            ✏️ Edit Speakers</button>`;
    }

    tempDiv.innerHTML = `
    <div id="team-${team.id}" class="team-card" style="background:#f8fafc;padding:20px;border-radius:12px;margin-bottom:15px;${isOwnTeam&&!isAdmin?'border:2px solid #bfdbfe;':''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
            <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
                    <strong style="font-size:18px;color:#1a73e8;">${escapeHTML(team.name)}</strong>
                    <span style="background:#64748b;color:white;padding:2px 10px;border-radius:40px;font-size:12px;">${escapeHTML(team.code || '')}</span>
                    ${isOwnTeam && !isAdmin ? '<span style="background:#dbeafe;color:#1e40af;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700">YOUR TEAM</span>' : ''}
                    ${catBadges}
                </div>
                <div style="color:#475569;font-size:14px;">
                    <strong>Speakers:</strong> ${(team.speakers||[]).map(s => escapeHTML(s.name)).join(' | ')}
                </div>
                ${catRadioRow}
            </div>
            <div style="display:flex;gap:8px;flex-shrink:0;">${actions}</div>
        </div>
    </div>`;
    card.replaceWith(tempDiv.firstElementChild);
}

// ── Edit Team ─────────────────────────────────────────────────────────────────
function showEditTeam(teamId) {
    if (!_isAdmin()) { showNotification('Admin access required', 'error'); return; }
    const team = state.teams.find(t => t.id === teamId);
    const card = document.getElementById(`team-${teamId}`);
    if (!team || !card) return;

    let speakerInputs = '';
    for (let i = 0; i < 5; i++) {
        const speakerName = team.speakers[i]?.name || '';
        speakerInputs += `
            <div>
                <label>Speaker ${i+1}</label>
                <input id="edit-speaker-${teamId}-${i}" value="${escapeHTML(speakerName)}" style="width:100%;padding:8px;">
            </div>`;
    }

    card.innerHTML = `
        <div data-team-edit="true" style="background:white;padding:20px;border-radius:12px;">
            <h3>Edit Team</h3>
            <div style="margin-bottom:15px;">
                <label>Team Name</label>
                <input id="edit-name-${teamId}" value="${escapeHTML(team.name)}" style="width:100%;padding:10px;">
            </div>
            <div style="margin-bottom:15px;">
                <label>Team Code</label>
                <input id="edit-code-${teamId}" value="${escapeHTML(team.code||'')}" style="width:100%;padding:10px;">
            </div>
            <div style="margin-bottom:15px;">
                <label>Email</label>
                <input type="email" id="edit-team-email-${teamId}" value="${escapeHTML(team.email||'')}" style="width:100%;padding:10px;">
            </div>
            <div style="margin-bottom:15px;">
                <label>Speakers</label>
                <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">${speakerInputs}</div>
            </div>
            <div style="margin-bottom:15px;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;color:#64748b;">
                🏷️ <strong>Category</strong> is assigned via the radio buttons on each team card — no need to set it here.
            </div>
            <div style="display:flex;gap:10px;">
                <button onclick="window.saveEditTeam(${teamId})" class="primary">Save</button>
                <button onclick="window.displayTeams()" class="secondary">Cancel</button>
            </div>
        </div>`;
}
function saveEditTeam(teamId) {
    if (!_isAdmin()) { showNotification('Admin access required', 'error'); return; }
    const team     = state.teams.find(t => t.id === teamId);
    const newName  = document.getElementById(`edit-name-${teamId}`)?.value.trim();
    const newCode  = document.getElementById(`edit-code-${teamId}`)?.value.trim().toUpperCase();
    const newEmail = document.getElementById(`edit-team-email-${teamId}`)?.value.trim().toLowerCase() || '';
    // NOTE: categories are managed via inline radio buttons — do NOT overwrite them here

    const speakers    = [];
    const oldSpeakers = team.speakers || [];
    const renameMap   = {};

    for (let i = 0; i < 5; i++) {
        const name = document.getElementById(`edit-speaker-${teamId}-${i}`)?.value.trim();
        if (name) {
            const oldSpeaker = oldSpeakers[i];
            if (oldSpeaker && oldSpeaker.name !== name) renameMap[oldSpeaker.name] = name;
            const existingSpeaker = team.speakers.find(s => s.name === name);
            speakers.push(existingSpeaker || createSpeakerObj(name));
        }
    }

    const isSpeech = !!(state.tournaments?.[state.activeTournamentId]?.isSpeechTournament);
    if (!newName || (!isSpeech && speakers.length < 3)) {
        showNotification(isSpeech ? 'Team name is required' : 'Team name and at least 3 speakers required', 'error');
        return;
    }

    Object.entries(renameMap).forEach(([oldName, newName]) => {
        if (oldName !== newName) window.renameSpeakerInBallots?.(teamId, oldName, newName);
    });

    team.name = newName;
    team.code = uniquifyCode(newCode || generateTeamCode(newName), teamId);
    team.email = newEmail;
    team.speakers = speakers;
    // team.categories is left untouched — managed by inline radio buttons

    displayTeams();
    showNotification('Team updated successfully', 'success');
    window.updateNavDropdowns?.();
}

// ── Edit Speakers Only (team role) ────────────────────────────────────────────
function showEditSpeakersOnly(teamId) {
    const myTeamId = _myTeamId();
    if (!_isAdmin() && String(teamId) !== String(myTeamId)) {
        showNotification('You can only edit your own team', 'error'); return;
    }
    const team = state.teams.find(t => t.id === teamId);
    if (!team) return;
    const card = document.getElementById(`team-${teamId}`);
    if (!card) return;

    let speakerInputs = '';
    for (let i = 0; i < 5; i++) {
        const name = team.speakers[i]?.name || '';
        speakerInputs += `
            <div>
                <label style="font-size:13px;color:#374151;">Speaker ${i + 1}</label>
                <input id="spk-${teamId}-${i}" value="${escapeHTML(name)}"
                       style="width:100%;padding:8px;border-radius:6px;border:1px solid #e2e8f0;margin-top:4px;">
            </div>`;
    }

    card.innerHTML = `
        <div style="background:white;padding:20px;border-radius:12px;border:2px solid #bfdbfe;">
            <h3 style="margin-top:0;color:#1e40af;">✏️ Edit Speaker Names — ${escapeHTML(team.name)}</h3>
            <p style="font-size:12px;color:#64748b;margin-bottom:16px;">Only speaker names can be changed here. Contact the admin for other changes.</p>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px;">${speakerInputs}</div>
            <div style="display:flex;gap:10px;">
                <button onclick="window.saveSpeakersOnly(${teamId})" class="primary" style="padding:10px 20px;">💾 Save</button>
                <button onclick="window.displayTeams()" class="secondary" style="padding:10px 20px;">Cancel</button>
            </div>
        </div>`;
}

function saveSpeakersOnly(teamId) {
    const myTeamId = _myTeamId();
    if (!_isAdmin() && String(teamId) !== String(myTeamId)) {
        showNotification('You can only edit your own team', 'error'); return;
    }
    const team = state.teams.find(t => t.id === teamId);
    if (!team) return;

    const speakers    = [];
    const oldSpeakers = team.speakers || [];
    const renameMap   = {};

    for (let i = 0; i < 5; i++) {
        const name = document.getElementById(`spk-${teamId}-${i}`)?.value.trim();
        if (name) {
            const oldSpeaker = oldSpeakers[i];
            if (oldSpeaker && oldSpeaker.name !== name) renameMap[oldSpeaker.name] = name;
            const existing = team.speakers.find(s => s.name === name);
            speakers.push(existing || createSpeakerObj(name));
        }
    }

    const isSpeechMode = !!(state.tournaments?.[state.activeTournamentId]?.isSpeechTournament);
    // No minimum speaker count required — teams can have any number of speakers

    Object.entries(renameMap).forEach(([oldName, newName]) => {
        if (oldName !== newName) window.renameSpeakerInBallots?.(teamId, oldName, newName);
    });

    team.speakers = speakers;
    displayTeams();
    showNotification('Speaker names updated', 'success');
}

// ── Speech Tournament Mode ─────────────────────────────────────────────────────
function toggleSpeechTournamentMode(enabled) {
    if (!_isAdmin()) { showNotification('Admin access required', 'error'); return; }
    const t = state.tournaments?.[state.activeTournamentId];
    if (t) t.isSpeechTournament = !!enabled;
    save();
    renderTeams();
    showNotification(enabled ? '🎤 Speech Tournament Mode enabled' : 'Team Tournament Mode enabled', 'success');
}

function addIndividualSpeaker() {
    if (!_isAdmin()) { showNotification('Admin access required', 'error'); return; }
    const name       = document.getElementById('spk-reg-name')?.value.trim();
    const code       = document.getElementById('spk-reg-code')?.value.trim().toUpperCase();
    const email      = document.getElementById('spk-reg-email')?.value.trim().toLowerCase() || '';
    const school     = document.getElementById('spk-reg-school')?.value.trim() || '';

    if (!name) { showNotification('Speaker name is required', 'error'); return; }

    state.teams.push({
        id: Date.now(),
        name: school ? `${name} (${school})` : name,
        code: uniquifyCode(code || generateTeamCode(name), null),
        email,
        speakers: [createSpeakerObj(name)],
        categories: [],
        wins: 0, total: 0, roundScores: {}, eliminated: false, broke: false,
        isSpeechEntry: true,
        school: school || '',
    });
    save();
    displayTeams();
    showNotification(`${name} registered as individual speaker`, 'success');
    window.updateNavDropdowns?.();

    ['spk-reg-name','spk-reg-code','spk-reg-email','spk-reg-school'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
}

// ── Window registrations ──────────────────────────────────────────────────────
window.addTeam                    = addTeam;
window.deleteTeam                 = deleteTeam;
window.removeTeamCategory         = removeTeamCategory;
window.setTeamCategory            = setTeamCategory;
window.showEditTeam               = showEditTeam;
window.saveEditTeam               = saveEditTeam;
window.displayTeams               = displayTeams;
window.showEditSpeakersOnly       = showEditSpeakersOnly;
window.saveSpeakersOnly           = saveSpeakersOnly;
window.toggleSpeechTournamentMode = toggleSpeechTournamentMode;
window.addIndividualSpeaker       = addIndividualSpeaker;
window.filterTeamsByCategory      = filterTeamsByCategory;

// ── EXPORT ALL FUNCTIONS ─────────────────────────────────────────────────────
export {
    renderTeams,
    displayTeams,
    addTeam,
    deleteTeam,
    showEditTeam,
    saveEditTeam,
    showEditSpeakersOnly,
    saveSpeakersOnly,
    toggleSpeechTournamentMode,
    addIndividualSpeaker,
    filterTeamsByCategory
};