// ============================================
// ADMIN.JS — Admin bypass panel
// Handles edge cases: ballot override, draw override,
//   publish controls, break/knockout, URLs, danger zone.
//   + Tournament management 
// Team & Judge management → owned by teams.js / judges.js
// ============================================

import { state, save, saveNow,
         createTournament, switchTournament,
         renameTournament, deleteTournament,
         activeTournament,
         resetTournamentDrawOnly, fullTournamentWipe
} from './state.js';
import { showNotification, escapeHTML, closeAllModals } from './utils.js';
import { createRound, displayRounds, displayAdminRounds } from './draw.js';
import { calculateBreak } from './knockout.js';
import { exportData } from './file-manager.js';

let _activeSection = 'overview';

// ============================================================================
// ENTRY POINT
// ============================================================================
export function renderAdminDashboard() {
    // Guarantee all window.adminXxx bindings exist before any HTML is injected.
    // initAdminDashboard() is only pure window assignments — safe to call multiple times.
    initAdminDashboard();

    const container = document.getElementById('admin-dashboard');
    if (!container) return;

    if (!state.auth?.isAuthenticated || state.auth?.currentUser?.role !== 'admin') {
        container.innerHTML = `
            <div class="adm-denied">
                <div class="adm-denied-icon">🔒</div>
                <h2>Access Denied</h2><p>Log in as admin to access this panel.</p>
            </div>`;
        return;
    }

    container.innerHTML = `
        <div class="adm-shell">
            ${_buildTopBar()}
            <div class="adm-layout">
                ${_buildSidebar()}
                <div class="adm-body" id="adm-body">${_buildSection(_activeSection)}</div>
            </div>
        </div>`;

    if (_activeSection === 'rounds') _refreshAdminRounds();
}

// Lightweight refresh — no full section rebuild
function _refreshAdminRounds() {
    _fillRoundsSidebar();
    try { displayAdminRounds(); } catch(e) { window.displayAdminRounds?.(); }
    const rounds  = state.rounds || [];
    const entered = rounds.flatMap(r => r.debates || []).filter(d => d.entered).length;
    const total   = rounds.flatMap(r => r.debates || []).length;
    const badge   = document.getElementById('adm-draw-count');
    if (badge) badge.textContent = `${entered}/${total} results`;
}

// Render the sticky left column into #adm-rounds-sidebar
function _fillRoundsSidebar() {
    const el = document.getElementById('adm-rounds-sidebar');
    if (!el) return;
    const rounds = state.rounds || [];

    let savedPrefs = {};
    try { savedPrefs = JSON.parse(localStorage.getItem('orion_draw_prefs') || '{}'); } catch(e) {}
    const sp = savedPrefs['adm-pair-method'] || 'random';
    const ss = savedPrefs['adm-side-method'] || 'random';

    const pairOpts = [['random','🎲 Random'],['power','⚡ Power Pairing'],['fold','📊 Fold Pairing'],['roundrobin','🔄 Round Robin'],['knockout','🏆 Knockout Draw']]
        .map(([v,l]) => `<option value="${v}" ${sp===v?'selected':''}>${l}</option>`).join('');
    const sideOpts = [['random','🎲 Random'],['manual','✋ Manual'],['seed-high-gov','🔼 High Seed = Gov'],['seed-low-gov','🔽 Low Seed = Gov']]
        .map(([v,l]) => `<option value="${v}" ${ss===v?'selected':''}>${l}</option>`).join('');

    const ctrlCards = rounds.map((r, idx) => {
        const done = (r.debates||[]).filter(d=>d.entered).length;
        const tot  = (r.debates||[]).length;
        const pct  = tot > 0 ? Math.round(done/tot*100) : 0;
        return `<div class="adm-round-ctrl">
            <div class="adm-round-ctrl-head">
                <div class="adm-row">
                    <strong class="adm-round-ctrl-title">Round ${r.id}</strong>
                    ${r.type==='knockout'?'<span class="adm-badge red">KO</span>':''}
                    ${r.blinded?'<span class="adm-badge grey">Blind</span>':''}
                </div>
                <span class="adm-round-ctrl-pct">${pct}%</span>
            </div>
            <div class="adm-round-ctrl-progress"><div class="adm-round-ctrl-fill" style="width:${pct}%"></div></div>
            <div class="adm-round-ctrl-motion">${r.motion?escapeHTML(r.motion.substring(0,45)):'No motion set'}</div>
            <div class="adm-row gap-sm">
                ${r.type!=='knockout'?`<button class="adm-btn secondary xs" onclick="window.toggleBlindRound(${idx});window.refreshAdminRounds()">${r.blinded?'\u{1F441} Unblind':'\u{1F512} Blind'}</button>`:''}
                <button onclick="window.redrawRound(${idx});window.refreshAdminRounds()"
                        ${done>0?'disabled title="Cannot redraw — results already entered"':'title="Shuffle pairings for this round"'}
                        style="display:inline-flex;align-items:center;gap:4px;padding:5px 12px;font-size:12px;font-weight:700;border-radius:6px;border:none;cursor:${done>0?'not-allowed':'pointer'};background:${done>0?'#e2e8f0':'#f59e0b'};color:${done>0?'#94a3b8':'white'};opacity:${done>0?'0.55':'1'};box-shadow:${done>0?'none':'0 2px 5px rgba(245,158,11,0.35)'};">
                    🔀 Redraw
                </button>
                <button class="adm-btn danger xs" onclick="window.adminDeleteRound(${r.id})">🗑</button>
            </div>
        </div>`;
    }).join('');

    el.innerHTML = `
        <div class="adm-card adm-card--no-mb">
            <div class="adm-card-title">➕ Create Round</div>
            <div class="adm-form-stack">
                <div class="adm-field">
                    <label class="adm-label">Motion / Topic</label>
                    <input type="text" id="adm-motion" class="adm-input" placeholder="e.g. This House Would…"
                           onkeydown="if(event.key==='Enter') window.adminCreateRound()">
                </div>
                <div class="adm-field">
                    <label class="adm-label">Pairing Method</label>
                    <select id="adm-pair-method" class="adm-select" onchange="window._admSaveDrawPref('adm-pair-method',this.value)">${pairOpts}</select>
                </div>
                <div class="adm-field">
                    <label class="adm-label">Side Assignment</label>
                    <select id="adm-side-method" class="adm-select" onchange="window._admSaveDrawPref('adm-side-method',this.value)">${sideOpts}</select>
                </div>
                <div class="adm-field">
                    <label class="adm-label">Options</label>
                    <div class="adm-checks">
                        <label class="adm-check"><input type="checkbox" id="adm-auto-allocate" checked> Auto-allocate Judges</label>
                        <label class="adm-check"><input type="checkbox" id="adm-blind-round"> 🔒 Blind Round</label>
                    </div>
                </div>
                <button class="adm-btn accent full" onclick="window.adminCreateRound()">🎯 Create Round</button>
            </div>
        </div>
        ${rounds.length > 0 ? `<div class="adm-card adm-card--mt adm-card--no-mb">
            <div class="adm-card-title">⚙️ Round Controls</div>
            <div class="adm-col adm-col--sm">${ctrlCards}</div>
        </div>` : ''}`;
}

function _buildTopBar() {
    const user = state.auth.currentUser;
    const tour = activeTournament();
    return `
    <div class="adm-topbar">
        <div class="adm-topbar-left">
            <div class="adm-logo" onclick="switchTab('public')" style="display:inline-flex;align-items:center;gap:8px;">
                <img src="IMG/logo.png" alt="Orion logo" style="width:28px;height:28px;border-radius:50%;object-fit:cover;object-position:center;flex-shrink:0;">
            </div>
            <div class="adm-topbar-divider"></div>
            <div class="adm-avatar">${escapeHTML((user.name||'A')[0].toUpperCase())}</div>
            <div>
                <div class="adm-topbar-title">Admin Panel</div>
                <div class="adm-topbar-sub">${escapeHTML(user.name)}</div>
            </div>
        </div>
        <div class="adm-topbar-right">
            <div class="adm-tour-badge">
                <span class="adm-tour-icon">🏟️</span>
                <span class="adm-tour-name">${escapeHTML(tour?.name || 'No Tournament')}</span>
                <button onclick="window.adminSwitchSection('tournaments')" class="adm-tour-switch">Switch</button>
            </div>
            <button class="adm-pill" onclick="window.renderAdminDashboard()">↺ Refresh</button>
        </div>
    </div>`;
}

function _buildStatStrip() {
    const s = _getStats();
    return `
    <div class="adm-stat-strip">
        ${_chip('👥', s.teams.total,     'Teams',   s.teams.breaking  + ' breaking',  'blue')}
        ${_chip('⚖️', s.judges.total,   'Judges',  s.judges.chair    + ' chairs',    'green')}
        ${_chip('🎯', s.rounds.total,    'Rounds',  s.rounds.completed + ' complete', 'amber')}
        ${_chip('🗳️', s.debates.entered, 'Ballots', s.debates.total   + ' rooms',    'purple')}
    </div>`;
}

function _chip(icon, val, label, sub, color) {
    return `<div class="adm-chip adm-chip--${color}">
        <div class="adm-chip-icon">${icon}</div>
        <div class="adm-chip-val">${val}</div>
        <div class="adm-chip-label">${label}</div>
        <div class="adm-chip-sub">${sub}</div>
    </div>`;
}

const _SECTIONS = [
    { id:'tournaments', icon:'🏟️', label:'Tournaments'      },
    { id:'overview',    icon:'📊', label:'Overview'          },
    { id:'rounds',      icon:'🎲', label:'Rounds & Draw'     },
    { id:'ballots',     icon:'🗳️', label:'Ballot Override'   },
    { id:'break',       icon:'🏆', label:'Break & Knockout'  },
    { id:'publish',     icon:'📡', label:'Publish Controls'  },
    { id:'urls',        icon:'🔗', label:'URLs & Access'     },
    { id:'data',        icon:'💾', label:'Data & Export'     },
    { id:'sample',      icon:'🚀', label:'Test Data'         },
    { id:'danger',      icon:'⚠️', label:'Danger Zone'       },
];

function _buildSidebar() {
    return `<nav class="adm-sidebar">
        ${_SECTIONS.map(s => `
            <button class="adm-nav-item ${_activeSection===s.id?'active':''}"
                    data-section="${s.id}"
                    onclick="window.adminSwitchSection('${s.id}')">
                <span class="adm-nav-icon">${s.icon}</span>
                <span class="adm-nav-label">${s.label}</span>
            </button>`).join('')}
    </nav>`;
}

export function adminSwitchSection(id) {
    _activeSection = id;
    const body = document.getElementById('adm-body');
    if (body) body.innerHTML = _buildSection(id);
    document.querySelectorAll('.adm-nav-item').forEach(el =>
        el.classList.toggle('active', el.getAttribute('data-section') === id));
    if (id === 'rounds') _refreshAdminRounds();
    // Also refresh topbar tournament badge
    const topbar = document.querySelector('.adm-topbar');
    if (topbar) topbar.outerHTML = _buildTopBar();
}

function _buildSection(id) {
    switch(id) {
        case 'tournaments': return _sectionTournaments();
        case 'overview':    return _sectionOverview();
        case 'rounds':      return _sectionRounds();
        case 'ballots':     return _sectionBallots();
        case 'break':       return _sectionBreak();
        case 'publish':     return _sectionPublish();
        case 'urls':        return _sectionURLs();
        case 'data':        return _sectionData();
        case 'sample':      return _sectionSample();
        case 'danger':      return _sectionDanger();
        default:            return _sectionOverview();
    }
}

// ============================================================================
// SECTION: TOURNAMENTS  
// ============================================================================
function _sectionTournaments() {
    const tournaments = state.tournaments;
    const activeId    = state.activeTournamentId;
    const tourList    = Object.entries(tournaments);

    return `
    <div class="adm-section-head">
        <h2>🏟️ Tournament Manager</h2>
        <p>Create and manage multiple tournaments. Only one tournament is active at a time — all tabs (Teams, Draw, Standings, etc.) show data for the active tournament.</p>
    </div>

    <!-- Create new tournament -->
    <div class="adm-card">
        <div class="adm-card-title">➕ Create New Tournament</div>
        <div class="adm-row end">
            <div class="adm-grow-2">
                <label class="adm-label">Tournament Name</label>
                <input type="text" id="new-tournament-name" class="adm-input"
                       placeholder="e.g. WSDC 2026, Nationals, Spring Invitational"
                       onkeydown="if(event.key===\'Enter\') window.adminCreateTournament()">
            </div>
            <div class="adm-grow">
                <label class="adm-label">Format / Mode</label>
                <select id="new-tournament-format" class="adm-select"
                        onchange="window._admShowFormatHint(this.value)">
                    <option value="standard">🏛️ WSDC — Team wins</option>
                    <option value="bp">⚖️ BP — British Parliamentary</option>
                    <option value="speech">🎤 Speech — Individual speaker scores</option>
                </select>
            </div>
            <div class="adm-row gap-sm">
                <button class="adm-btn primary" onclick="window.adminCreateTournament()">Create &amp; Switch</button>
                <button class="adm-btn secondary" onclick="window.adminCreateTournamentNoSwitch()"
                        title="Create without switching to it">+ Create Only</button>
            </div>
        </div>

        <!-- Format hint — swaps dynamically on select change -->
        <div id="adm-format-hint" class="adm-format-hint adm-format-hint--standard">
            <span class="adm-format-hint__icon">🏛️</span>
            <div><strong>WSDC / Standard</strong> — Teams compete head-to-head. Standings track wins, total speaker points, and averages per team.</div>
        </div>

        <p class="adm-hint">
            💡 Creating a tournament switches you to it. Teams, judges, and rounds are independent per tournament.
        </p>
    </div>
    <!-- Tournament list -->
    <div class="adm-card">
        <div class="adm-card-title">📋 All Tournaments <span class="adm-card-count">${tourList.length}</span></div>
        ${tourList.length === 0 ? `<div class="adm-empty">No tournaments yet.</div>` : `
        <div class="adm-col">
            ${tourList.map(([id, t]) => {
                const isActive = id === activeId;
                const teamCount   = (t.teams   || []).length;
                const judgeCount  = (t.judges  || []).length;
                const roundCount  = (t.rounds  || []).length;
                const ballotsDone = (t.rounds  || []).flatMap(r => r.debates||[]).filter(d => d.entered).length;
                const created     = t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—';

                return `
                <div class="adm-tour-row ${isActive ? 'is-active' : ''}">
                    <div class="adm-row between">
                        <div class="adm-grow">
                            <div class="adm-tour-header">
                                <span class="adm-strong" id="tour-name-display-${id}">${escapeHTML(t.name)}</span>
                                ${isActive ? `<span class="adm-badge indigo">● ACTIVE</span>` : ''}
                            </div>
                            <div class="adm-tour-meta">
                                ${t.format === 'bp'
                                    ? `<span class="adm-format-badge bp">⚖️ British Parliamentary</span>`
                                    : t.format === 'speech'
                                    ? `<span class="adm-format-badge speech">🎤 Speech</span>`
                                    : `<span class="adm-format-badge std">🏛️ Standard</span>`}
                                <span class="adm-tour-meta-item">👥 ${teamCount} Team${teamCount!==1?'s':''}</span>
                                <span class="adm-tour-meta-item">⚖️ ${judgeCount} Judge${judgeCount!==1?'s':''}</span>
                                <span class="adm-tour-meta-item">🎲 ${roundCount} Round${roundCount!==1?'s':''}</span>
                                <span class="adm-tour-meta-item">🗳️ ${ballotsDone} Ballot${ballotsDone!==1?'s':''}</span>
                                <span class="adm-muted-sm">📅 ${created}</span>
                            </div>
                        </div>
                        <div class="adm-tour-actions">
                            ${!isActive ? `
                                <button class="adm-btn primary sm"
                                        onclick="window.adminSwitchTournament('${id}')">
                                    ↩ Switch to this
                                </button>` : `
                                <span class="adm-badge active-tour">Currently active</span>`}
                            <button class="adm-btn secondary sm"
                                    onclick="window.adminRenameTournament('${id}', '${escapeHTML(t.name).replace(/'/g,"\\'")}')">
                                ✏️ Rename
                            </button>                          
                            <button class="adm-btn danger sm"
                                    onclick="window.adminDeleteTournament('${id}')"
                                    ${tourList.length <= 1 ? 'disabled title="Cannot delete the only tournament"' : ''}>
                                🗑️
                            </button>
                        </div>
                    </div>
                </div>`;
            }).join('')}
        </div>`}
    </div>

    <!-- How it works -->
    <div class="adm-card adm-info-card">
        <div class="adm-card-title">ℹ️ How Multi-Tournament Works</div>
        <div class="adm-info-grid">
            <div class="adm-info-item indigo">
                <strong>Per-tournament data</strong>
                <p>Teams, judges, rounds, results, draw, speaker scores, ballots, feedback, judge URLs, and publish settings.</p>
            </div>
            <div class="adm-info-item green">
                <strong>Shared (global) data</strong>
                <p>User accounts &amp; login credentials. Admins, judges, and teams can log in regardless of active tournament.</p>
            </div>
            <div class="adm-info-item amber">
                <strong>Switching tournaments</strong>
                <p>Click "Switch to this" and all tabs instantly refresh with that tournament's data. The badge in the top bar shows which is active.</p>
            </div>
        </div>
    </div>`;
}

// ============================================================================
// SECTION: OVERVIEW
// ============================================================================
function _sectionOverview() {
    const s = _getStats();
    const rounds = [...(state.rounds||[])].reverse().slice(0,5);

    return `
    <div class="adm-section-head">
        <h2>📊 Tournament Overview</h2>
        <p>At-a-glance status of <strong>${escapeHTML(activeTournament()?.name || 'current tournament')}</strong>.</p>
    </div>
    <div class="adm-theme-bar">
        <div id="theme-picker-container"></div>
        <div class="adm-muted-sm">Theme applies across the whole app</div>
    </div>
    <script>setTimeout(()=>{ if(typeof window.renderThemePicker==='function') window.renderThemePicker('theme-picker-container'); },50)</script>
    <div class="adm-overview-grid">
        <div class="adm-card">
            <div class="adm-card-title">📈 Progress</div>
            ${_progressBar('Ballot Completion', s.debates.entered, s.debates.total, '#f97316')}
            ${_progressBar('Rounds Completed',  s.rounds.completed, Math.max(s.rounds.total,1), '#3b82f6')}            
            ${_progressBar('Teams Breaking',    s.teams.breaking, Math.max(s.teams.total,1), '#8b5cf6')}
        </div>
        <div class="adm-card">
            <div class="adm-card-title">🕐 Recent Rounds</div>
            ${rounds.length === 0
                ? `<div class="adm-empty">No rounds yet — go to Rounds &amp; Draw to create one.</div>`
                : rounds.map(r => {
                    const done = (r.debates||[]).filter(d=>d.entered).length;
                    const tot  = (r.debates||[]).length;
                    return `<div class="adm-round-row">
                        <div class="adm-round-info">
                            <strong>Round ${r.id}</strong>
                            ${r.type==='knockout'?'<span class="adm-badge red">KO</span>':''}
                            ${r.blinded?'<span class="adm-badge grey">Blind</span>':''}
                            <small>${r.motion ? escapeHTML(r.motion.substring(0,50))+'…' : 'No motion'}</small>
                        </div>
                        <div class="adm-round-pct">${tot?Math.round(done/tot*100):0}%</div>
                    </div>`;
                }).join('')}
            <div class="adm-card-action">
                <button class="adm-btn secondary sm" onclick="window.adminSwitchSection('rounds')">All rounds →</button>
            </div>
        </div>
        <div class="adm-card">
            <div class="adm-card-title">⚡ Quick Access</div>
            <div class="adm-quick-grid">
                <button class="adm-quick" onclick="window.switchTab('standings')">
                    <span class="adm-quick-icon">📊</span>
                    <span class="adm-quick-label">Standings</span>
                </button>
                <button class="adm-quick" onclick="window.switchTab('draw')">
                    <span class="adm-quick-icon">🎲</span>
                    <span class="adm-quick-label">Draw</span>
                </button>
                <button class="adm-quick" onclick="window.switchTab('teams')">
                    <span class="adm-quick-icon">👥</span>
                    <span class="adm-quick-label">Teams</span>
                </button>
                <button class="adm-quick" onclick="window.switchTab('judges')">
                    <span class="adm-quick-icon">⚖️</span>
                    <span class="adm-quick-label">Judges</span>
                </button>
                <button class="adm-quick" onclick="window.switchTab('speakers')">
                    <span class="adm-quick-icon">🎤</span>
                    <span class="adm-quick-label">Speakers</span>
                </button>
                <button class="adm-quick" onclick="window.switchTab('knockout')">
                    <span class="adm-quick-icon">⚔️</span>
                    <span class="adm-quick-label">Knockout</span>
                </button>
                <button class="adm-quick" onclick="window.switchTab('results')">
                    <span class="adm-quick-icon">✅</span>
                    <span class="adm-quick-label">Results</span>
                </button>
                <button class="adm-quick" onclick="window.switchTab('feedback')">
                    <span class="adm-quick-icon">💬</span>
                    <span class="adm-quick-label">Feedback</span>
                </button>
            </div>
        </div>
    </div>`;
}

// ============================================================================
// SECTION: ROUNDS & DRAW — side-by-side layout
// ============================================================================
function _sectionRounds() {
    return `
    <div class="adm-section-head">
        <h2>🎲 Rounds &amp; Draw</h2>
        <p>Create rounds on the left, manage pairings on the right. For full judge drag-and-drop use the
           <button class="adm-btn secondary xs" onclick="window.switchTab('draw')">Draw tab →</button></p>
    </div>
    <div class="adm-rounds-split">
        <div class="adm-rounds-create-col" id="adm-rounds-sidebar">
            <div class="adm-empty">Loading…</div>
        </div>
        <div class="adm-rounds-live-col">
            <div class="adm-card adm-card--flush adm-card--no-mb">
                <div class="adm-card-header adm-row between">
                    <span class="adm-card-title adm-card-title--inline">
                        📋 Live Draw
                        <span class="adm-card-title-sub" id="adm-draw-count"></span>
                    </span>
                    <div class="adm-row gap-sm">
                        <select id="round-filter" onchange="window.displayAdminRounds()" class="adm-select adm-select--sm">
                            <option value="all">All Rounds</option>
                            <option value="pending">Pending</option>
                            <option value="completed">Submitted</option>
                            <option value="blinded">Blinded</option>
                        </select>
                        <button class="adm-btn secondary sm" onclick="window.refreshAdminRounds()">↺</button>
                    </div>
                </div>
                <div id="rounds-list" class="adm-rounds-list-body">
                    <div class="adm-empty">Loading…</div>
                </div>
            </div>
        </div>
    </div>`;
}

// ============================================================================
// SECTION: BALLOT OVERRIDE
// ============================================================================
function _sectionBallots() {
    const allRounds = state.rounds || [];
    const rounds = [...allRounds].reverse();
    return ` <div class="adm-section-head">
        <h2>🗳️ Ballot Override</h2>
        <p>Enter or override ballot results for any room. Normally judges submit via their portal link — use this as a bypass when needed.</p>
    </div>
    ${rounds.length === 0
        ? `<div class="adm-card"><div class="adm-empty">No rounds yet.</div></div>`
        : rounds.map(r => {
            const rIdx  = allRounds.indexOf(r);
            const done  = (r.debates||[]).filter(d=>d.entered).length;
            const total = (r.debates||[]).length;
            const pct   = total > 0 ? Math.round(done/total*100) : 0;
            return `
            <div class="adm-card">
                <div class="adm-ballot-header">
                    <div class="adm-row gap-sm">
                        <span class="adm-strong">Round ${r.id}</span>
                        ${r.type==='knockout'?'<span class="adm-badge red">KO</span>':''}
                        ${r.blinded?'<span class="adm-badge grey">Blind</span>':''}
                    </div>
                    <div class="adm-prog-row">
                        <div class="adm-bar-bg adm-bar-bg--fixed"><div class="adm-bar-fill" style="width:${pct}%"></div></div>
                        <span class="adm-pct">${done}/${total}</span>
                    </div>
                </div>
                <div class="adm-room-grid">
                ${(r.debates||[]).map((d,i) => {
                    const gov  = (state.teams||[]).find(t=>t.id===d.gov);
                    const opp  = (state.teams||[]).find(t=>t.id===d.opp);
                    const room = r.rooms?.[i] || `Room ${String.fromCharCode(65+i)}`;
                    const jnames = (d.panel||[]).map(p=>escapeHTML(p.name||'')).join(', ');
                    return `
                    <div class="adm-room-card ${d.entered?'done':''}">
                        <div class="adm-room-top">
                            <span class="adm-room-dot ${d.entered?'green':'amber'}"></span>
                            <strong>${escapeHTML(room)}</strong>
                            <span class="adm-room-status">${d.entered?'✓ Done':'⏳ Pending'}</span>
                        </div>
                        <div class="adm-room-teams">${gov?escapeHTML(gov.name):'?'} <em>vs</em> ${opp?escapeHTML(opp.name):'?'}</div>
                        ${jnames?`<div class="adm-room-judges">⚖️ ${jnames}</div>`:''}
                        ${d.entered?`<div class="adm-room-scores">${d.govResults?.total?.toFixed(1)||'?'} — ${d.oppResults?.total?.toFixed(1)||'?'}</div>`:''}
                        <button onclick="window.showEnterResults(${rIdx},${i})"
                                class="adm-ballot-btn ${d.entered?'done':'pending'}">
                            ${d.entered ? '✏️ Override Results' : '📝 Enter Results'}
                        </button>
                    </div>`;
                }).join('')}
                </div>
            </div>`;
        }).join('')}`;
}

// ============================================================================
// SECTION: BREAK & KNOCKOUT
// ============================================================================
function _sectionBreak() {
    const isBP = (activeTournament()?.format === 'bp');
    const winsLabel = isBP ? '1st/2nd' : 'Wins';

    // Category filter
    const allCats    = (typeof window.getCategories === 'function') ? window.getCategories() : [];
    const selectedCat = window._brkSelectedCat || '';

    const allTeams   = [...(state.teams||[])].filter(t => {
        if (!selectedCat) return true;
        return (typeof window.teamMatchesCategory === 'function')
            ? window.teamMatchesCategory(t, selectedCat)
            : (t.categories||[]).includes(selectedCat);
    }).sort((a,b)=>((b.wins||0)-(a.wins||0))||((b.total||0)-(a.total||0)));
    const breaking   = allTeams.filter(t=>_isCatBroke(t, selectedCat)).sort((a,b)=>(_catSeed(a,selectedCat)||99)-(_catSeed(b,selectedCat)||99));
    const ineligible = allTeams.filter(t=>_isCatIneligible(t, selectedCat));
    const totalRounds = (state.rounds||[]).filter(r=>r&&r.type==='prelim').length;
    const blindedCount = (state.rounds||[]).filter(r=>r.blinded&&r.type==='prelim').length;

    const catSelectorHtml = allCats.length === 0 ? '' : `
        <div class="adm-break-controls-stat" style="flex-direction:column;align-items:flex-start;min-width:140px;">
            <label class="adm-label adm-label--light" style="font-size:10px;margin-bottom:3px;">Category</label>
            <select class="adm-select adm-select--dark" onchange="window._brkSelectedCat=this.value;window.adminSwitchSection('break')">
                <option value="" ${!selectedCat?'selected':''}>All Teams</option>
                ${allCats.map(c=>`<option value="${c.id}" ${selectedCat===c.id?'selected':''}>${c.icon||''} ${escapeHTML(c.name)}</option>`).join('')}
            </select>
        </div>
        <div class="adm-break-controls-divider"></div>`;

    const teamRows = allTeams.map(t => {
        const rp     = Object.keys(t.roundScores||{}).length;
        const avg    = rp > 0 ? ((t.total||0)/rp).toFixed(1) : '—';
        const missed = totalRounds - rp;
        const inelig = _isCatIneligible(t, selectedCat);
        const broke  = _isCatBroke(t, selectedCat);
        const seed   = _catSeed(t, selectedCat);
        const reason = _catIneligReason(t, selectedCat);
        const rowClass = inelig ? 'adm-row--inelig' : (broke ? 'adm-row--breaking' : '');
        return `<tr class="${rowClass}" id="inelig-row-${t.id}">
            <td>
                <label class="adm-center-label">
                    <input type="checkbox" ${inelig?'checked':''}
                           onchange="window.adminToggleIneligible('${t.id}', this.checked)"
                           class="adm-inelig-checkbox">
                </label>
            </td>
            <td>
                <div class="adm-row gap-sm">
                    <strong>${escapeHTML(t.name)}</strong>
                    ${broke ? `<span class="adm-badge green">Seed ${seed}</span>` : ''}
                    ${missed > 0 ? `<span class="adm-badge amber">⚠️ ${missed} missed</span>` : ''}
                    ${(t.categories||[]).map(cid=>{const cat=allCats.find(c=>c.id===cid);return cat?`<span class="adm-badge" style="background:${cat.color}22;color:${cat.color};border:1px solid ${cat.color}44">${cat.icon||''} ${escapeHTML(cat.name)}</span>`:''}).join('')}
                </div>
            </td>
            <td><code class="adm-code">${escapeHTML(t.code||'')} </code></td>
            <td class="adm-td-wins">${t.wins||0}</td>
            <td>${(t.total||0).toFixed(1)}</td>
            <td class="adm-td-avg">${avg}</td>
            <td id="inelig-reason-cell-${t.id}">
                ${inelig
                    ? `<input type="text" value="${escapeHTML(reason)}"
                              placeholder="Reason (optional)…"
                              onchange="window.adminSetIneligibleReason('${t.id}', this.value)"
                              class="adm-inelig-input">`
                    : `<span class="adm-muted-sm">—</span>`}
            </td>
        </tr>`;
    }).join('');

    const breakingTable = breaking.length === 0
        ? `<div class="adm-empty">No teams confirmed yet — preview and confirm above.</div>`
        : `<div class="adm-table-wrap"><table class="adm-table">
            <thead><tr><th>Seed</th><th>Team</th><th>Code</th><th>${winsLabel}</th><th>Points</th><th>Avg</th></tr></thead>
            <tbody>${breaking.map(t => {
                const rp = Object.keys(t.roundScores||{}).length;
                return `<tr>
                    <td><span class="adm-badge green">${_catSeed(t, selectedCat)}</span></td>
                    <td><strong>${escapeHTML(t.name)}</strong></td>
                    <td><code class="adm-code">${escapeHTML(t.code||'')} </code></td>
                    <td class="adm-td-wins">${t.wins||0}</td>
                    <td>${(t.total||0).toFixed(1)}</td>
                    <td class="adm-td-avg">${rp>0?((t.total||0)/rp).toFixed(1):'—'}</td>
                </tr>`;
            }).join('')}</tbody>
        </table></div>`;

    const ineligCount = ineligible.length;
    const catLabel = selectedCat
        ? (allCats.find(c=>c.id===selectedCat)?.name || selectedCat)
        : 'All Teams';

    return `
    <div class="adm-section-head">
        <h2>🏆 Break &amp; Knockout</h2>
        <p>Mark ineligible teams, preview and confirm the break. Ranking: wins first, total points as tiebreak.
        ${blindedCount>0?`<span class="adm-blinded-badge">⚠️ ${blindedCount} round${blindedCount!==1?'s':''} blinded</span>`:''}
        </p>
    </div>

    <!-- STICKY CONTROL BAR -->
    <div class="adm-break-controls-bar">
        ${catSelectorHtml}
        <div class="adm-break-controls-stat">
            <div class="adm-break-controls-stat-val">${allTeams.length}</div>
            <div class="adm-break-controls-stat-lbl">${escapeHTML(catLabel)}</div>
        </div>
        ${ineligCount > 0 ? `
        <div class="adm-break-controls-stat">
            <div class="adm-break-controls-stat-val adm-break-controls-stat-val--danger">${ineligCount}</div>
            <div class="adm-break-controls-stat-lbl">Ineligible</div>
        </div>` : ''}
        ${breaking.length > 0 ? `
        <div class="adm-break-controls-stat">
            <div class="adm-break-controls-stat-val adm-break-controls-stat-val--success">${breaking.length}</div>
            <div class="adm-break-controls-stat-lbl">Breaking</div>
        </div>` : ''}
        <div class="adm-break-controls-divider"></div>
        <div class="adm-break-size-col">
            <label class="adm-label adm-label--light">Break Size</label>
            <select id="adm-break-size" class="adm-select adm-select--dark adm-select--dark-wide">
                <option value="2">Final (2 teams)</option>
                <option value="4">Semi-Finals (4 teams)</option>
                <option value="8" selected>Quarter-Finals (8 teams)</option>
                <option value="16">Octo-Finals (16 teams)</option>
                <option value="32">Pre-Octos (32 teams)</option>
            </select>
        </div>
        <div class="adm-break-controls-actions">
            <button class="adm-btn light sm" onclick="window.adminPreviewBreak()">👁 Preview</button>
            <button class="adm-btn glow sm" onclick="window.adminConfirmBreak()">✅ Confirm Break</button>
            <div class="adm-break-controls-divider"></div>
            <select id="adm-ko-seed" class="adm-select adm-select--dark">
                <option value="wins">Seed: Wins + Points</option>
                <option value="points">Seed: Points Only</option>
            </select>
            <button class="adm-btn light sm" onclick="window.generateKnockout?.()">⚔️ Knockout</button>
            <button class="adm-btn light sm" onclick="window.switchTab('knockout')">View Bracket →</button>
        </div>
        <p class="adm-break-footer-hint">Preview = no save · Confirm = saves publicly</p>
    </div>

    <!-- Preview result area -->
    <div id="adm-break-preview" class="hidden">
        <div class="adm-card adm-preview-card adm-card--mt">
            <div class="adm-row between adm-card-header-inner">
                <div class="adm-card-title adm-preview-title adm-card-title--inline">
                    👁 Break Preview <span class="adm-hint-xs">(not saved yet)</span>
                </div>
                <div class="adm-row gap-sm">
                    <button class="adm-btn secondary sm" onclick="document.getElementById('adm-break-preview').classList.add('hidden')">✕ Dismiss</button>
                    <button class="adm-btn glow sm" onclick="window.adminConfirmBreak()">✅ Confirm &amp; Save</button>
                </div>
            </div>
            <div id="adm-break-preview-content"></div>
        </div>
    </div>

    <!-- TABBED LAYOUT: reduces scrolling -->
    <div class="adm-card adm-card--flush">
        <div class="brk-tab-bar">
            <button id="brk-tab-all" class="brk-tab brk-tab-active" onclick="window._brkTab('all')">
                All Teams <span class="brk-tab-count">${allTeams.length}</span>
            </button>
            <button id="brk-tab-breaking" class="brk-tab" onclick="window._brkTab('breaking')">
                Breaking <span class="brk-tab-count brk-tab-count--green">${breaking.length}</span>
            </button>
            <button id="brk-tab-inelig" class="brk-tab" onclick="window._brkTab('inelig')">
                Ineligible <span class="brk-tab-count brk-tab-count--red">${ineligCount}</span>
            </button>
        </div>
        <div id="brk-pane-all" class="adm-brk-pane is-active" style="display:block">
            <div class="adm-table-wrap"><table class="adm-table">
                <thead><tr>
                    <th class="adm-th-icon">🚫</th>
                    <th>Team</th><th>Code</th>
                    <th class="adm-th-center">${winsLabel}</th>
                    <th class="adm-th-center">Pts</th>
                    <th class="adm-th-center">Avg</th>
                    <th>Reason</th>
                </tr></thead>
                <tbody>${teamRows}</tbody>
            </table></div>
        </div>
        <div id="brk-pane-breaking" class="adm-brk-pane" style="display:none">
            ${breakingTable}
            ${breaking.length > 0 ? `
            <div class="adm-brk-pane-actions">
                <button class="adm-btn primary" onclick="window.generateKnockout?.()">⚔️ Start Knockout</button>
                <button class="adm-btn secondary" onclick="window.switchTab('knockout')">View Bracket →</button>
            </div>` : ''}
        </div>
        <div id="brk-pane-inelig" class="adm-brk-pane" style="display:none">
            ${ineligible.length === 0
                ? `<div class="adm-empty">No teams marked ineligible. Tick 🚫 in the All Teams tab to exclude a team.</div>`
                : `<div class="adm-table-wrap"><table class="adm-table">
                    <thead><tr><th>Team</th><th>${winsLabel}</th><th>Points</th><th>Reason</th><th></th></tr></thead>
                    <tbody>${ineligible.map(t=>`<tr>
                        <td><strong>${escapeHTML(t.name)}</strong></td>
                        <td class="adm-td-wins">${t.wins||0}</td>
                        <td>${(t.total||0).toFixed(1)}</td>
                        <td class="adm-td-avg">${escapeHTML(_catIneligReason(t, selectedCat)||'—')}</td>
                        <td><button class="adm-btn secondary xs" onclick="window.adminToggleIneligible('${t.id}',false);window.adminSwitchSection('break')">Remove</button></td>
                    </tr>`).join('')}</tbody>
                </table></div>`}
        </div>
    </div>
    `;
}


// ============================================================================
// SECTION: PUBLISH CONTROLS
// ============================================================================
function _sectionPublish() {
    const pub = state.publish || {};
    const tabs = [
        { id:'draw',      icon:'🎲', label:'Draw',      desc:'Show round pairings publicly' },
        { id:'standings', icon:'📊', label:'Standings',  desc:'Show team win/loss table' },
        { id:'speakers',  icon:'🗣️', label:'Speakers',   desc:'Show speaker score rankings' },
        { id:'break',     icon:'🏆', label:'Break',      desc:'Show breaking teams list' },
        { id:'knockout',  icon:'⚔️', label:'Knockout',   desc:'Show knockout bracket' },
        { id:'motions',   icon:'📜', label:'Motions',    desc:'Show all round motions' },
        { id:'results',   icon:'✅', label:'Results',    desc:'Show debate result scores' },
    ];
    const rounds = state.rounds || [];

    return `
    <div class="adm-section-head">
        <h2>📡 Publish Controls</h2>
        <p>Toggle what the general public can see for <strong>${escapeHTML(activeTournament()?.name || 'this tournament')}</strong>.<br>
        <span style="font-size:12px;color:#64748b">⚠️ <strong>Admin accounts always see all tabs</strong> — publish state does not affect you. Published tabs are visible to everyone including unauthenticated visitors.</span></p>
    </div>
    <div class="adm-card">
        <div class="adm-card-title">🌐 Tab Visibility</div>
        <p class="adm-card-desc">Turn each public tab on or off.</p>
        <div class="adm-publish-list">
            ${tabs.map(t => `
            <div class="adm-pub-row">
                <div class="adm-pub-info">
                    <span class="adm-pub-icon">${t.icon}</span>
                    <div>
                        <div class="adm-pub-label">${t.label}</div>
                        <div class="adm-pub-desc">${t.desc}</div>
                    </div>
                </div>
                <div class="adm-pub-right">
                    <span class="adm-pub-state ${pub[t.id]?'on':'off'}">${pub[t.id]?'Live':'Hidden'}</span>
                    <button class="adm-toggle ${pub[t.id]?'on':''}" onclick="window.adminTogglePublish('${t.id}')">
                        <span class="adm-toggle-knob"></span>
                    </button>
                </div>
            </div>`).join('')}
        </div>
        <div class="adm-card-actions-bordered">
            <button class="adm-btn primary" onclick="window.adminPublishAll()">📡 Publish Everything</button>
            <button class="adm-btn secondary" onclick="window.adminHideAll()">🔒 Hide Everything</button>
        </div>
    </div>
    <div class="adm-card">
        <div class="adm-card-title">🔒 Round Blind Controls</div>
        <p class="adm-card-desc">Blinding a round hides its results from teams and the public.</p>
        ${rounds.length === 0
            ? `<div class="adm-empty">No rounds yet.</div>`
            : `<div class="adm-col">
                ${rounds.map((r, idx) => {
                    const done = (r.debates||[]).filter(d=>d.entered).length;
                    const tot  = (r.debates||[]).length;
                    return `
                    <div class="adm-pub-row">
                        <div class="adm-pub-info">
                            <span class="adm-pub-icon">${r.type==='knockout'?'🏆':'🎲'}</span>
                            <div>
                                <div class="adm-pub-label">Round ${r.id}${r.motion ? ': '+escapeHTML(r.motion.substring(0,40))+'…' : ''}</div>
                                <div class="adm-pub-desc">${done}/${tot} ballots submitted · ${r.type||'prelim'}</div>
                            </div>
                        </div>
                        <div class="adm-pub-right">
                            <span class="adm-pub-state ${r.blinded?'off':'on'}">${r.blinded?'Blinded':'Visible'}</span>
                            ${r.type !== 'knockout' ? `
                            <button class="adm-toggle ${r.blinded?'':' on'}" onclick="window.toggleBlindRound(${idx});window.adminSwitchSection('publish')">
                                <span class="adm-toggle-knob"></span>
                            </button>` : '<span class="adm-ko-label">KO — always visible</span>'}
                        </div>
                    </div>`;
                }).join('')}
            </div>`}
    </div>`;
}

// ============================================================================
// SECTION: URLs & ACCESS
// ============================================================================
function _sectionURLs() {
    const judgesWithURL = (state.judges||[]).filter(j => (state.judgeTokens||{})[j.id]);
    const teamsWithURL  = (state.teams||[]).filter(t => t.url);
    return `
    <div class="adm-section-head">
        <h2>🔗 URLs &amp; Access</h2>
        <p>Generate and send private access links for judges and teams.</p>
    </div>
    <div class="adm-two-col">
        <div class="adm-card">
            <div class="adm-card-title">⚖️ Judge URLs</div>
            <div class="adm-url-stat">
                <span class="adm-url-num">${judgesWithURL.length}</span>
                <span class="adm-url-denom">/ ${(state.judges||[]).length} generated</span>
            </div>
            <p class="adm-card-desc">Each judge gets a permanent link to their portal for viewing assignments and submitting ballots.</p>
            <div class="adm-form-stack">
                <button class="adm-btn secondary full" onclick="window.generateAllJudgeURLs()">🔗 Generate All</button>
                <button class="adm-btn primary full" onclick="window.showBulkSendPanel('judges')">📧 Send All</button>
            </div>
            <div class="adm-url-list">
            ${(state.judges||[]).map(j => {
                const hasURL = !!(state.judgeTokens||{})[j.id];
                return `<div class="adm-url-row">
                    <span class="adm-url-dot ${hasURL?'green':'grey'}"></span>
                    <span class="adm-url-name">${escapeHTML(j.name)}</span>
                    <div class="adm-url-acts">
                        ${!hasURL
                            ? `<button class="adm-btn secondary xs" onclick="window.generateJudgeURL('${j.id}');setTimeout(()=>window.adminSwitchSection('urls'),400)">Gen</button>`
                            : `<button class="adm-btn secondary xs" onclick="window.copyJudgeURL('${j.id}')">Copy</button>
                               <button class="adm-btn secondary xs" onclick="window.sendJudgeURL('${j.id}')">Send</button>`}
                    </div>
                </div>`;
            }).join('')}
            </div>
        </div>
        <div class="adm-card">
            <div class="adm-card-title">👥 Team URLs</div>
            <div class="adm-url-stat">
                <span class="adm-url-num">${teamsWithURL.length}</span>
                <span class="adm-url-denom">/ ${(state.teams||[]).length} generated</span>
            </div>
            <p class="adm-card-desc">Teams get a link to view their draw, speaker scores, and feedback.</p>
            <div class="adm-form-stack">
                <button class="adm-btn secondary full" onclick="window.generateAllTeamURLs()">🔗 Generate All</button>
                <button class="adm-btn primary full" onclick="window.showBulkSendPanel('teams')">📧 Send All</button>
            </div>
            <div class="adm-url-list">
            ${(state.teams||[]).map(t => {
                const hasURL = !!t.url;
                return `<div class="adm-url-row">
                    <span class="adm-url-dot ${hasURL?'green':'grey'}"></span>
                    <span class="adm-url-name">${escapeHTML(t.name)}</span>
                    <div class="adm-url-acts">
                        ${!hasURL
                            ? `<button class="adm-btn secondary xs" onclick="window.generateTeamURL?.('${t.id}');setTimeout(()=>window.adminSwitchSection('urls'),400)">Gen</button>`
                            : `<button class="adm-btn secondary xs" onclick="window.sendTeamURL('${t.id}')">Send</button>`}
                    </div>
                </div>`;
            }).join('')}
            </div>
        </div>
    </div>`;
}

// ============================================================================
// SECTION: TEST DATA
// ============================================================================
function _sectionSample() {
    return `
    <div class="adm-section-head">
        <h2>🚀 Test Data</h2>
        <p>Generate a realistic sample tournament to explore all features without setting up real participants.</p>
    </div>

    <div class="adm-two-col">
        <div class="adm-card">
            <div class="adm-card-title">⚙️ Configure Dataset</div>

            <div class="adm-form-stack">
                <div class="adm-field">
                    <label class="adm-label">Number of Teams</label>
                    <input type="range" id="sample-team-count" min="8" max="32" value="20" step="2"
                           class="adm-range"
                           oninput="document.getElementById('sample-team-display').textContent=this.value+' teams'">
                    <div class="adm-range-labels">
                        <span>8</span><span id="sample-team-display" class="adm-range-val">20 teams</span><span>32</span>
                    </div>
                </div>

                <div class="adm-field">
                    <label class="adm-label">Preliminary Rounds</label>
                    <input type="range" id="sample-round-count" min="3" max="8" value="5" step="1"
                           class="adm-range"
                           oninput="document.getElementById('sample-round-display').textContent=this.value+' rounds'">
                    <div class="adm-range-labels">
                        <span>3</span><span id="sample-round-display" class="adm-range-val">5 rounds</span><span>8</span>
                    </div>
                </div>

                <div class="adm-field">
                    <label class="adm-label">Number of Judges</label>
                    <input type="range" id="sample-judge-count" min="4" max="20" value="12" step="1"
                           class="adm-range"
                           oninput="document.getElementById('sample-judge-display').textContent=this.value+' judges'">
                    <div class="adm-range-labels">
                        <span>4</span><span id="sample-judge-display" class="adm-range-val">12 judges</span><span>20</span>
                    </div>
                </div>

                <label class="adm-check">
                    <input type="checkbox" id="sample-include-knockout" checked class="adm-range">
                    <span>Include Knockout Rounds</span>
                </label>

                <label class="adm-check">
                    <input type="checkbox" id="sample-randomize-scores" checked class="adm-range">
                    <span>Randomize Scores (realistic distribution)</span>
                </label>
            </div>

            <div class="adm-card-actions">
                <button class="adm-btn primary full" onclick="window.generateCustomSampleData()">🚀 Generate Data</button>
            </div>
        </div>

        <div class="adm-card">
            <div class="adm-card-title">✅ What Gets Generated</div>
            <div class="adm-gen-list">
                <div>🏫 Teams with school affiliations &amp; speakers</div>
                <div>👨‍⚖️ Judges with conflict flags</div>
                <div>🎲 Completed prelim rounds &amp; pairings</div>
                <div>📊 Ballot results &amp; team scores</div>
                <div>🗣️ Speaker scores &amp; standings</div>
                <div>🏆 Knockout bracket (if enabled)</div>
            </div>

            <div class="adm-info-banner adm-info-banner--mt">
                ⚠️ <strong>Warning:</strong> This will replace all existing tournament data. Export first if needed.
            </div>

            <div class="adm-card-actions">
                <button class="adm-btn secondary" onclick="window.adminSwitchSection('data')">📤 Export First</button>
                <button class="adm-btn secondary" onclick="window.adminSwitchSection('danger')">🗑️ Reset First</button>
            </div>
        </div>
    </div>`;
}

// ============================================================================
// SECTION: DATA & EXPORT
// ============================================================================
function _sectionData() {
    return `
    <div class="adm-section-head">
        <h2>💾 Data &amp; Export</h2>
        <p>Export tournament data or bring in new participants.</p>
    </div>
    <div class="adm-two-col">
        <div class="adm-card">
            <div class="adm-card-title">📤 Export</div>
            <div class="adm-form-stack">
                <button class="adm-btn secondary full" onclick="window.exportData()">📥 Export Full JSON</button>
                <button class="adm-btn secondary full" onclick="window.exportStandings?.()">📊 Export Standings CSV</button>
                <button class="adm-btn secondary full" onclick="window.exportSpeakerStandings?.()">🗣️ Export Speakers CSV</button>
            </div>
        </div>
        <div class="adm-card">
            <div class="adm-card-title">📥 Import &amp; Sample</div>
            <div class="adm-form-stack">
                <button class="adm-btn secondary full" onclick="window.switchTab('import')">📤 Go to Import Tab</button>
                <button class="adm-btn secondary full" onclick="window.adminSwitchSection('sample')">🚀 Go to Test Data</button>
            </div>
        </div>
    </div>`;
}

// ============================================================================
// SECTION: DANGER ZONE
// ============================================================================
function _sectionDanger() {
    return `
    <div class="adm-section-head">
        <h2>⚠️ Danger Zone ⚠️</h2>
        <p>These actions are permanent and cannot be undone. Read carefully.</p>
    </div>
    <div class="adm-card danger-card">
        <div class="adm-danger-item">
            <div class="adm-danger-info">
                <strong>↺ Reset Draw Only</strong>
                <p>Clears all rounds, debates, and results for <em>${escapeHTML(activeTournament()?.name||'current tournament')}</em>. Resets team/speaker stats. <strong>Teams and judges are preserved.</strong></p>
            </div>
            <button class="adm-btn warning" onclick="window.showResetConfirmation()">Reset Draw</button>
        </div>
        <div class="adm-danger-item">
            <div class="adm-danger-info">
                <strong>💣 Full Wipe</strong>
                <p>Deletes everything in the current tournament — teams, judges, rounds, all data.</p>
            </div>
            <button class="adm-btn danger" onclick="window.adminConfirmFullWipe()">Full Wipe</button>
        </div>
        <div class="adm-danger-item">
            <div class="adm-danger-info">
                <strong>🔑 Reset All URLs</strong>
                <p>Invalidates all judge and team access links for this tournament.</p>
            </div>
            <button class="adm-btn warning" onclick="window.adminResetURLs()">Reset URLs</button>
        </div>
    </div>`;
}

// ============================================================================
// HELPERS
// ============================================================================
function _progressBar(label, val, max, color) {
    const pct = max > 0 ? Math.min(100, Math.round(val/max*100)) : 0;
    return `<div class="adm-prog-item">
        <div class="adm-prog-hd"><span>${label}</span><span>${val}/${max}</span></div>
        <div class="adm-bar-bg"><div class="adm-bar-fill" style="width:${pct}%;background:${color}"></div></div>
    </div>`;
}

function _getStats() {
    const teams      = state.teams  || [];
    const judges     = state.judges || [];
    const rounds     = state.rounds || [];
    const allDebates = rounds.flatMap(r => r.debates || []);
    return {
        teams:   { total: teams.length,   breaking: teams.filter(t=>t.broke).length },
        judges:  { total: judges.length,  chair: judges.filter(j=>j.role==='chair').length },
        rounds:  { total: rounds.length,  completed: rounds.filter(r=>(r.debates||[]).every(d=>d.entered)&&r.debates?.length>0).length },
        debates: { total: allDebates.length, entered: allDebates.filter(d=>d.entered).length },
    };
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

export function adminCreateRound() {
    const motion       = document.getElementById('adm-motion')?.value.trim()    || 'Debate Round';
    const method       = document.getElementById('adm-pair-method')?.value      || 'random';
    const sideMethod   = document.getElementById('adm-side-method')?.value      || 'random';
    const autoAllocate = document.getElementById('adm-auto-allocate')?.checked ?? true;
    const blind        = document.getElementById('adm-blind-round')?.checked    ?? false;

    const fn = typeof createRound === 'function' ? createRound : window.createRound;
    if (typeof fn !== 'function') { showNotification('createRound not available — is draw.js loaded?','error'); return; }
    fn({ motion, method, sideMethod, autoAllocate, blind });
    _refreshAdminRounds();
}

// Toggle a team's ineligibility manually — saves immediately
// When a category is active, writes to t.categoryIneligible[catId] so each
// category has its own independent ineligibility list.
export function adminToggleIneligible(teamId, isIneligible) {
    const team = (state.teams||[]).find(t => String(t.id) === String(teamId));
    if (!team) return;
    const catId = window._brkSelectedCat || '';

    if (catId) {
        if (!team.categoryIneligible) team.categoryIneligible = {};
        if (!team.categoryIneligibleReason) team.categoryIneligibleReason = {};
        if (isIneligible) {
            team.categoryIneligible[catId] = true;
            team.categoryIneligibleReason[catId] = team.categoryIneligibleReason[catId] || '';
        } else {
            delete team.categoryIneligible[catId];
            delete team.categoryIneligibleReason[catId];
        }
    } else {
        if (isIneligible) {
            team.breakIneligible = true;
            team.breakIneligibleReason = team.breakIneligibleReason || '';
        } else {
            delete team.breakIneligible;
            delete team.breakIneligibleReason;
        }
    }

    save();
    const row = document.getElementById(`inelig-row-${teamId}`);
    if (row) row.classList.toggle('adm-row--inelig', isIneligible);
    const cell = document.getElementById(`inelig-reason-cell-${teamId}`);
    if (cell) {
        cell.innerHTML = isIneligible
            ? `<input type="text" value=""
                      placeholder="Reason (optional)…"
                      onchange="window.adminSetIneligibleReason('${teamId}', this.value)"
                      class="adm-inelig-input">`
            : `<span class="adm-muted-sm">—</span>`;
    }
}

// Update the reason string for a manually ineligible team
export function adminSetIneligibleReason(teamId, reason) {
    const team = (state.teams||[]).find(t => String(t.id) === String(teamId));
    if (!team) return;
    const catId = window._brkSelectedCat || '';
    if (catId) {
        if (!team.categoryIneligibleReason) team.categoryIneligibleReason = {};
        team.categoryIneligibleReason[catId] = reason.trim();
    } else {
        if (!team.breakIneligible) return;
        team.breakIneligibleReason = reason.trim();
    }
    save();
}

// ── Per-category break helpers ────────────────────────────────────────────────
// Break data lives in two places depending on context:
//   • "All Teams" (catId=''):  t.broke / t.seed / t.breakIneligible  (legacy)
//   • Per-category (catId):    t.categoryBreaks[catId].{broke,seed}
//                              t.categoryIneligible[catId]
function _isCatIneligible(t, catId) {
    return catId
        ? !!(t.categoryIneligible?.[catId])
        : !!t.breakIneligible;
}
function _isCatBroke(t, catId) {
    return catId
        ? !!(t.categoryBreaks?.[catId]?.broke)
        : !!t.broke;
}
function _catSeed(t, catId) {
    return catId
        ? (t.categoryBreaks?.[catId]?.seed ?? null)
        : (t.seed ?? null);
}
function _catIneligReason(t, catId) {
    return catId
        ? (t.categoryIneligibleReason?.[catId] || '')
        : (t.breakIneligibleReason || '');
}

// Pure compute — uses per-category or global ineligible flags
function _computeBreak(size) {
    const catId = window._brkSelectedCat || '';
    const eligible = (state.teams||[])
        .filter(t => !_isCatIneligible(t, catId))
        .filter(t => {
            if (!catId) return true;
            return (typeof window.teamMatchesCategory === 'function')
                ? window.teamMatchesCategory(t, catId)
                : (t.categories||[]).includes(catId);
        })
        .sort((a,b) => ((b.wins||0)-(a.wins||0)) || ((b.total||0)-(a.total||0)));

    const cutoff = Math.min(size, eligible.length);
    return {
        breaking:  eligible.slice(0, cutoff).map((t,i) => ({...t, _previewSeed: i+1})),
        bubble:    eligible.slice(cutoff, cutoff+3),
        ineligible:(state.teams||[])
            .filter(t => {
                if (!_isCatIneligible(t, catId)) return false;
                if (!catId) return true;
                return (typeof window.teamMatchesCategory === 'function')
                    ? window.teamMatchesCategory(t, catId)
                    : (t.categories||[]).includes(catId);
            })
            .sort((a,b) => ((b.wins||0)-(a.wins||0))||((b.total||0)-(a.total||0)))
    };
}

export function adminPreviewBreak() {
    const size = parseInt(document.getElementById('adm-break-size')?.value||'8');
    const catId = window._brkSelectedCat || '';
    const { breaking, bubble, ineligible } = _computeBreak(size);
    const isBP = (activeTournament()?.format === 'bp');
    const winsLabel = isBP ? '1st/2nd' : 'Wins';

    const row = (t, seed, faded=false) => {
        const rp = Object.keys(t.roundScores||{}).length;
        const avg = rp > 0 ? ((t.total||0)/rp).toFixed(1) : '—';
        return `<tr class="${faded?'adm-row--faded':''}">
            <td><span class="adm-badge ${faded?'grey':'green'}">${seed}</span></td>
            <td><strong>${escapeHTML(t.name)}</strong></td>
            <td><code class="adm-code">${escapeHTML(t.code||'')}</code></td>
            <td class="adm-td-wins">${t.wins||0}</td>
            <td>${(t.total||0).toFixed(1)}</td>
            <td class="adm-td-avg">${avg}</td>
        </tr>`;
    };

    let html = `<div class="adm-table-wrap"><table class="adm-table">
        <thead><tr><th>Seed</th><th>Team</th><th>Code</th><th>${winsLabel}</th><th>Points</th><th>Avg</th></tr></thead>
        <tbody>
            ${breaking.map((t,i)=>row(t, i+1)).join('')}
            ${bubble.length ? `<tr class="adm-brk-bubble-row"><td colspan="6">— Bubble (next ${bubble.length}) —</td></tr>${bubble.map((t,i)=>row(t,breaking.length+i+1,true)).join('')}` : ''}
        </tbody>
    </table></div>`;

    if (ineligible.length) {
        html += `<div class="adm-inelig-block">
            <div class="adm-inelig-block-title">🚫 ${ineligible.length} manually excluded</div>
            ${ineligible.map(t=>`<div class="adm-inelig-block-row">
                <strong>${escapeHTML(t.name)}</strong>${_catIneligReason(t,catId)?` — ${escapeHTML(_catIneligReason(t,catId))}` :''}
            </div>`).join('')}
        </div>`;
    }

    const el = document.getElementById('adm-break-preview');
    const content = document.getElementById('adm-break-preview-content');
    if (el && content) {
        content.innerHTML = html;
        el.style.display = 'block';
        el.classList.remove('hidden');
    }
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function adminConfirmBreak() {
    const size  = parseInt(document.getElementById('adm-break-size')?.value||'8');
    const catId = window._brkSelectedCat || '';

    // Reset only the break data for this specific category/scope
    (state.teams||[]).forEach(t => {
        if (!catId) {
            t.broke = false; t.seed = null;
        } else {
            const matches = (typeof window.teamMatchesCategory === 'function')
                ? window.teamMatchesCategory(t, catId)
                : (t.categories||[]).includes(catId);
            if (matches) {
                if (!t.categoryBreaks) t.categoryBreaks = {};
                t.categoryBreaks[catId] = { broke: false, seed: null };
            }
        }
    });

    const eligible = (state.teams||[])
        .filter(t => !_isCatIneligible(t, catId))
        .filter(t => {
            if (!catId) return true;
            return (typeof window.teamMatchesCategory === 'function')
                ? window.teamMatchesCategory(t, catId)
                : (t.categories||[]).includes(catId);
        })
        .sort((a,b) => ((b.wins||0)-(a.wins||0)) || ((b.total||0)-(a.total||0)));

    const cutoff = Math.min(size, eligible.length);
    eligible.forEach((t, i) => {
        if (i >= cutoff) return;
        if (catId) {
            if (!t.categoryBreaks) t.categoryBreaks = {};
            t.categoryBreaks[catId] = { broke: true, seed: i + 1 };
        } else {
            t.broke = true; t.seed = i + 1;
        }
    });
    save();

    const ineligCount = (state.teams||[]).filter(t => _isCatIneligible(t, catId)).length;
    const catLabel = catId
        ? ((typeof window.getCategoryById === 'function' ? window.getCategoryById(catId) : null)?.name || catId)
        : '';
    let msg = `Break confirmed — ${cutoff} team${cutoff!==1?'s':''} breaking`;
    if (catLabel) msg += ` (${catLabel})`;
    if (ineligCount) msg += ` · ${ineligCount} excluded`;
    showNotification(msg, 'success');

    const prev = document.getElementById('adm-break-preview');
    if (prev) prev.style.display = 'none';
    setTimeout(() => {
        adminSwitchSection('break');
        window.renderBreakDisplay?.();
    }, 150);
}

// Backward-compat alias
export function adminCalculateBreak() { adminConfirmBreak(); }

export function adminTogglePublish(tabId) {
    if (!state.publish) state.publish = {};
    state.publish[tabId] = !state.publish[tabId];
    save();
    adminSwitchSection('publish');
    showNotification(`${tabId} ${state.publish[tabId]?'published':'hidden'}`, state.publish[tabId]?'success':'info');
}

export function adminPublishAll() {
    if (!state.publish) state.publish = {};
    ['draw','standings','speakers','break','knockout','motions','results'].forEach(t=>state.publish[t]=true);
    save(); adminSwitchSection('publish');
    showNotification('All tabs published','success');
}

export function adminHideAll() {
    state.publish = {};
    save(); adminSwitchSection('publish');
    showNotification('All tabs hidden','info');
}

function adminDeleteRound(id) {
    if (!confirm(`Delete Round ${id}? All debate data will be lost.`)) return;
    state.rounds = (state.rounds||[]).filter(r=>r.id!==id);
    saveNow(); showNotification(`Round ${id} deleted`,'info');
    _refreshAdminRounds();
}

// ── Tournament action handlers (exposed to window) ──────────────────────────

function adminCreateTournamentWithOpt(autoSwitch) {
    const name   = document.getElementById('new-tournament-name')?.value.trim();
    const format = document.getElementById('new-tournament-format')?.value || 'standard';
    if (!name) { showNotification('Please enter a tournament name', 'error'); return; }

    // Snapshot existing IDs so we can identify the newly created one
    const beforeIds = new Set(Object.keys(state.tournaments || {}));

    createTournament(name, autoSwitch);

    // Stamp the chosen format onto the new tournament
    const newId = Object.keys(state.tournaments || {}).find(id => !beforeIds.has(id));
    if (newId) {
        state.tournaments[newId].format = format;

        // Speech tournaments: auto-publish the speech tab and default to
        // tracking individual speaker scores rather than team wins
        if (format === 'speech') {
            if (!state.tournaments[newId].publish) state.tournaments[newId].publish = {};
            state.tournaments[newId].publish.speech   = true;   // speech tab live by default
            state.tournaments[newId].publish.speakers = true;   // speaker rankings also live
            state.tournaments[newId].speechMode = true;         // flag for renderers
        }
        save();
    }

    document.getElementById('new-tournament-name').value = '';
    adminSwitchSection('tournaments');
}

function adminSwitchTournament(id) {
    switchTournament(id);
    adminSwitchSection('tournaments');
    // Refresh topbar
    const topbar = document.querySelector('.adm-topbar');
    if (topbar) topbar.outerHTML = _buildTopBar();
}

function adminRenameTournament(id, currentName) {
    const newName = prompt('Rename tournament:', currentName);
    if (!newName?.trim()) return;
    renameTournament(id, newName.trim());
    adminSwitchSection('tournaments');
}

function adminDeleteTournament(id) {
    deleteTournament(id);  // confirm dialog is inside deleteTournament
    // renderAdminDashboard is called inside deleteTournament
}

// ── Danger zone ──────────────────────────────────────────────────────────────

function showResetConfirmation() {
    closeAllModals();
    const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
    overlay.onclick = e => { if(e.target===overlay) closeAllModals(); };
    const modal = document.createElement('div'); modal.className = 'modal modal--center';
    modal.innerHTML = `<div class="adm-modal-icon">⚠️</div>
        <h3 class="adm-modal-danger-title">Reset Tournament?</h3>
        <p class="adm-modal-body">Deletes all rounds and results. Teams and judges are kept.</p>
        <div class="adm-modal-actions">
            <button onclick="window.closeAllModals()" class="adm-btn secondary">Cancel</button>
            <button onclick="window.resetTournamentDrawOnly?.();window.closeAllModals();window.renderAdminDashboard();" class="adm-btn danger">Yes, Reset Draw</button>
        </div>`;
    overlay.appendChild(modal); document.body.appendChild(overlay);
}

function adminConfirmFullWipe() {
    closeAllModals();
    const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
    overlay.onclick = e => { if(e.target===overlay) closeAllModals(); };
    const modal = document.createElement('div'); modal.className = 'modal modal--center';
    modal.innerHTML = `<div class="adm-modal-icon">💣</div>
        <h3 class="adm-modal-danger-title">Full Wipe?</h3>
        <p class="adm-modal-body-sm"><strong>This deletes everything.</strong></p>
        <p class="adm-modal-body">Teams, judges, rounds, URLs — permanently gone.</p>
        <div class="adm-modal-actions">
            <button onclick="window.closeAllModals()" class="adm-btn secondary">Cancel</button>
            <button onclick="window.fullTournamentWipe?.();window.closeAllModals();window.renderAdminDashboard();" class="adm-btn danger">Wipe Everything</button>
        </div>`;
    overlay.appendChild(modal); document.body.appendChild(overlay);
}

function adminResetURLs() {
    if (!confirm('Invalidate all judge and team URLs? They will need to be regenerated.')) return;
    state.judgeTokens = {}; state.judgeURLs = {};
    (state.teams||[]).forEach(t => { delete t.url; delete t.token; });
    save(); showNotification('All URLs reset','info'); adminSwitchSection('urls');
}

// ============================================================================
// INIT — register all functions on window
// ============================================================================
export function initAdminDashboard() {
    window._brkSelectedCat = window._brkSelectedCat ?? '';
    window.renderAdminDashboard      = renderAdminDashboard;
    window.adminSwitchSection        = adminSwitchSection;
    window.adminCreateRound          = adminCreateRound;
    window.refreshAdminRounds        = _refreshAdminRounds;
    window.displayAdminRounds        = displayAdminRounds;
    window.adminCalculateBreak       = adminCalculateBreak;
    window.adminPreviewBreak         = adminPreviewBreak;
    window.adminConfirmBreak         = adminConfirmBreak;
    window.adminToggleIneligible     = adminToggleIneligible;
    window.adminSetIneligibleReason  = adminSetIneligibleReason;
    window.adminTogglePublish        = adminTogglePublish;
    window.adminPublishAll           = adminPublishAll;
    window.adminHideAll              = adminHideAll;
    window.adminDeleteRound          = adminDeleteRound;
    window.adminConfirmFullWipe      = adminConfirmFullWipe;
    window.adminResetURLs            = adminResetURLs;
    window.showResetConfirmation     = showResetConfirmation;
    window.exportData                = exportData;
    window.resetTournamentDrawOnly   = resetTournamentDrawOnly;
    window.fullTournamentWipe        = fullTournamentWipe;

    // Format hint switcher — updates description card under the create-tournament form
    window._admShowFormatHint = function(format) {
        const el = document.getElementById('adm-format-hint');
        if (!el) return;
        const hints = {
            standard: { cls: 'adm-format-hint--standard', icon: '🏛️', html: '<strong>WSDC / Standard</strong> — Teams compete head-to-head each round. Standings track wins, total speaker points, and averages per team.' },
            bp:       { cls: 'adm-format-hint--bp',       icon: '⚖️', html: '<strong>British Parliamentary</strong> — Four teams per room ranked 1st–4th. Standings use points (3/2/1/0) per round.' },
            speech:   { cls: 'adm-format-hint--speech',   icon: '🎤', html: '<strong>Speech Tournament</strong> — Tracks <em>individual speaker scores</em> per round rather than team wins. Perfect for public speaking competitions and oratory events. The public <strong>Speech tab</strong> shows a live per-speaker leaderboard with round-by-round scores and optional category sub-tabs.' }
        };
        const h = hints[format] || hints.standard;
        el.className = 'adm-format-hint ' + h.cls;
        el.innerHTML = '<span class="adm-format-hint__icon">' + h.icon + '</span><div>' + h.html + '</div>';
    };

    // Draw selector memory helper
    window._admSaveDrawPref = function(key, value) {
        try {
            const prefs = JSON.parse(localStorage.getItem('orion_draw_prefs') || '{}');
            prefs[key] = value;
            localStorage.setItem('orion_draw_prefs', JSON.stringify(prefs));
        } catch(e) {}
    };

    /**
     * isTabVisible(tabId)
     * Central tab-visibility check used by the main app's nav and tab renderers.
     *
     * Rules:
     *  • Admin always sees every tab — no publish or login gate applies.
     *  • A *published* tab is visible to everyone, including unauthenticated visitors.
     *  • An *unpublished* tab is hidden from everyone except admin.
     *
     * This fixes:
     *  – Speaker tab locked even for admin accounts.
     *  – Published tabs requiring login from the public.
     */
    window.isTabVisible = function(tabId) {
        const role    = state.auth?.currentUser?.role;
        const isAdmin = role === 'admin';
        // Admin always has access regardless of publish state
        if (isAdmin) return true;
        // Published tabs are publicly accessible — no login required
        if (state.publish?.[tabId]) return true;
        return false;
    };

    // Tournament management
    window.adminCreateTournament         = () => adminCreateTournamentWithOpt(true);
    window.adminCreateTournamentNoSwitch = () => adminCreateTournamentWithOpt(false);
    window.adminSwitchTournament         = adminSwitchTournament;
    window.adminRenameTournament         = adminRenameTournament;
    window.adminDeleteTournament         = adminDeleteTournament;

    // Break section tab switcher — must live on window (not inside innerHTML <script> tags)
    window._brkTab = function(tab) {
        ['all','breaking','inelig'].forEach(function(id) {
            const pane = document.getElementById('brk-pane-' + id);
            const btn  = document.getElementById('brk-tab-' + id);
            if (!pane || !btn) return;
            const active = id === tab;
            pane.style.display = active ? 'block' : 'none';
            pane.classList.toggle('is-active', active);
            btn.classList.toggle('brk-tab-active', active);
        });
    };
}