// ============================================
// STATE MANAGEMENT — Multi-Tournament Support
// WITH DEEP PROXY AUTO-SAVE
// ============================================
// Architecture: `state` is a proxy object with getters/setters that
// delegate tournament-scoped properties to the ACTIVE tournament.
// Every other file (auth.js, tab.js, admin.js, …) continues to read
// `state.teams`, `state.rounds`, etc. with zero changes — they
// transparently get the active tournament's data.
// ============================================

import { showNotification, closeAllModals, escapeHTML } from './utils.js';
import { debounce } from './utils.js';

// ── Helper: build a blank tournament data object ──────────────────────────────
function _newTournamentData(name) {
    return {
        name: name || 'New Tournament',
        createdAt: new Date().toISOString(),
        teams: [],
        judges: [],
        rounds: [],
        tournament: { active: false, bracket: [], currentRound: 0, champion: null, breakingTeams: [] },
        publicSettings: { showDraws: true, showStandings: true, showKnockoutBracket: false },
        roomURLs: {},       // { roundIdx-debateIdx: { url, token, judges[] } }
        feedback: [],       // { id, roundId, debateIdx, fromJudgeId, toJudgeId, rating, comment, timestamp }
        judgeTokens: {},    // { judgeId: 'token' }
        universalJudgeToken: null,
        publish: {},        // { draw: bool, standings: bool, … }
        standingsFilter: null
    };
}

// ── Private internal store ────────────────────────────────────────────────────
let _state = {
    activeTournamentId: 'default',
    auth: {
        users: [
            { id: 1, username: 'admin',  password: 'admin123',  role: 'admin',  name: 'Tab Master',         email: 'admin@debate.org',  status: 'active' },
            { id: 2, username: 'judge1', password: 'judge123',  role: 'judge',  name: 'Judge Sarah Chen',   email: 'judge@debate.org',  status: 'active' },
            { id: 3, username: 'team1',  password: 'team123',   role: 'team',   name: 'Debate Team',        email: 'team@debate.org',   status: 'active' }
        ],
        pendingRegistrations: [],
        currentUser: null,
        isAuthenticated: false,
        lastActivity: Date.now()
    },
    tournaments: {
        'default': _newTournamentData('My Tournament')
    }
};

// ── Keys that belong to the active tournament (not global) ────────────────────
const TOURNAMENT_KEYS = [
    'teams', 'judges', 'rounds', 'tournament', 'publicSettings',
    'roomURLs', 'feedback', 'judgeTokens', 'universalJudgeToken',
    'publish', 'standingsFilter'
];

// ================================
// DEEP PROXY CREATOR
// ================================

/**
 * Creates a deep proxy that tracks mutations and triggers callbacks
 * @param {Object} target - The object to proxy
 * @param {Function} onChange - Callback when any deep change occurs
 * @param {string} path - Current path for debugging (internal)
 * @returns {Proxy} - Deep proxy that intercepts all mutations
 */
function createDeepProxy(target, onChange, path = '') {
    // Handle primitives and null
    if (target === null || typeof target !== 'object') {
        return target;
    }

    // Prevent proxy-ing proxies
    if (target.__isProxy) return target;

    // Handle arrays and objects
    const handler = {
        get(obj, prop) {
            // Mark as proxy
            if (prop === '__isProxy') return true;
            
            const value = obj[prop];
            
            // Create deep proxy for nested objects/arrays
            if (value !== null && typeof value === 'object') {
                return createDeepProxy(value, onChange, `${path}.${String(prop)}`);
            }
            
            return value;
        },

        set(obj, prop, value) {
            const oldValue = obj[prop];
            
            // Skip if values are the same (prevents infinite loops)
            if (oldValue === value) return true;
            
            // Set the value
            obj[prop] = value;
            
            // Trigger change notification
            onChange(`${path}.${String(prop)}`, value, oldValue);
            
            return true;
        },

        deleteProperty(obj, prop) {
            delete obj[prop];
            onChange(`${path}.${String(prop)}`, undefined, obj[prop]);
            return true;
        }
    };

    return new Proxy(target, handler);
}

// ================================
// REACTIVE STATE WATCHERS
// ================================

const watchers = {};

function watch(key, fn) {
    if (!watchers[key]) watchers[key] = [];
    watchers[key].push(fn);
}

function notify(key) {
    if (!watchers[key]) return;
    // Use setTimeout to avoid cascading updates
    setTimeout(() => {
        watchers[key].forEach(fn => {
            try { fn(); } catch (e) { console.error(`Watcher error for ${key}:`, e); }
        });
    }, 0);
}

function notifyAll() {
    Object.keys(watchers).forEach(key => notify(key));
}

// ================================
// PERSISTENCE
// ================================

let saveTimeout = null;
let pendingChanges = false;


// 1. Define the actual work
const Save = () => {
    try {
        const stateToSave = {
            activeTournamentId: _state.activeTournamentId,
            auth: _state.auth,
            tournaments: _state.tournaments
        };
        
        localStorage.setItem('orion_state', JSON.stringify(stateToSave));
        console.log('✅ State persisted efficiently');
        pendingChanges = false;
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            console.error('LocalStorage is full! Clear some tournaments.');
        } else {
            console.error('Failed to save state:', e);
        }
    }
};

// saveNow — synchronous, immediate write to localStorage.
// Use this in critical paths (ballot submission, round creation)
// where we cannot afford to lose data if the user navigates away quickly.
export const saveNow = Save;

// save — debounced version for frequent background mutations (proxy auto-saves).
// Reduced to 300ms so data is never more than 300ms stale.
export const save = debounce(Save, 300);
// ── Shared notification helper — avoids duplicating the "which watchers
//    should fire for this key?" logic across getters, setters, and the proxy.
function _notifyForKey(key) {
    notify(key);
    if (key === 'teams')  notify('speakers');
    if (key === 'rounds') { notify('standings'); notify('speakers'); }
}

// ================================
// TOURNAMENT PROXY CREATION
// ================================

// This creates reactive versions of all tournament data
function createReactiveTournament(tournamentData, tournamentId) {
    if (!tournamentData) return tournamentData;
    
    return createDeepProxy(tournamentData, (path, newValue, oldValue) => {
        // Flag that changes occurred
        pendingChanges = true;
        
        // Determine which watchers to notify based on the path
        if (path.includes('.teams') || path.startsWith('.teams')) {
            _notifyForKey('teams');
        } else if (path.includes('.judges')) {
            notify('judges');
        } else if (path.includes('.rounds')) {
            _notifyForKey('rounds');
            if (path.includes('entered') || path.includes('Results') || path.includes('bpSpeakers')) {
                notify('speakers');
            }
        } else if (path.includes('.publish')) {
            notify('publish');
        }
        
        // Always trigger save on any change
        save();
    });
}

// ================================
// EXPORTED STATE PROXY
// ================================

// Create the main state object with dynamic getters/setters
const state = {};

// Setup tournament keys with dynamic access to active tournament
TOURNAMENT_KEYS.forEach(key => {
    Object.defineProperty(state, key, {
        get() {
            const t = _state.tournaments[_state.activeTournamentId];
            if (!t) return undefined;
            
            // Return the reactive proxy for this key's data
            if (!t[`__proxy_${key}`]) {
                t[`__proxy_${key}`] = createDeepProxy(t[key], (path, newValue, oldValue) => {
                    pendingChanges = true;
                    _notifyForKey(key);
                    save();
                }, `.${key}`);
            }
            return t[`__proxy_${key}`];
        },
        set(v) {
            const t = _state.tournaments[_state.activeTournamentId];
            if (t) {
                t[key] = v;
                // Clear proxy cache
                delete t[`__proxy_${key}`];
                pendingChanges = true;
                _notifyForKey(key);
                save();
            }
        },
        enumerable: true,
        configurable: true
    });
});

// Auth is global (not tournament-scoped)
Object.defineProperty(state, 'auth', {
    get() { 
        // Make auth reactive too
        if (!_state.__authProxy) {
            _state.__authProxy = createDeepProxy(_state.auth, (path, newValue, oldValue) => {
                pendingChanges = true;
                notify('auth');
                save();
            }, '.auth');
        }
        return _state.__authProxy;
    },
    set(v) { 
        _state.auth = v;
        delete _state.__authProxy;
        pendingChanges = true;
        notify('auth');
        save(); 
    },
    enumerable: true, 
    configurable: true
});

Object.defineProperty(state, 'activeTournamentId', {
    get() { return _state.activeTournamentId; },
    set(v) { 
        _state.activeTournamentId = v;
        pendingChanges = true;
        notify('tournament');
        // Clear proxy caches for new tournament
        const t = _state.tournaments[v];
        if (t) {
            TOURNAMENT_KEYS.forEach(key => delete t[`__proxy_${key}`]);
        }
        notifyAll(); // Refresh everything on tournament switch
        save(); 
    },
    enumerable: true, 
    configurable: true
});

Object.defineProperty(state, 'tournaments', {
    get() { 
        if (!_state.__tournamentsProxy) {
            _state.__tournamentsProxy = createDeepProxy(_state.tournaments, (path, newValue, oldValue) => {
                pendingChanges = true;
                notify('tournaments');
                save();
            }, '.tournaments');
        }
        return _state.__tournamentsProxy;
    },
    set(v) { 
        _state.tournaments = v;
        delete _state.__tournamentsProxy;
        pendingChanges = true;
        notify('tournaments');
        save(); 
    },
    enumerable: true, 
    configurable: true
});

// ================================
// LOAD SAVED STATE
// ================================

try {
    const raw = localStorage.getItem('orion_state') || localStorage.getItem('wsdc_tournament');
    if (raw) {
        const s = JSON.parse(raw);

        if (s.tournaments) {
            // ── New multi-tournament format ──
            _state.activeTournamentId = s.activeTournamentId || 'default';
            _state.tournaments = s.tournaments;

            // Patch any missing fields from older saves
            Object.values(_state.tournaments).forEach(t => {
                if (!t.publish)             t.publish = {};
                if (!t.roomURLs)            t.roomURLs = {};
                if (!t.feedback)            t.feedback = [];
                if (!t.judgeTokens)         t.judgeTokens = {};
                if (t.universalJudgeToken === undefined) t.universalJudgeToken = null;
                if (!t.standingsFilter)     t.standingsFilter = null;
                if (!t.publicSettings)      t.publicSettings = { showDraws: true, showStandings: true, showKnockoutBracket: false };
            });

            // Ensure active tournament still exists
            if (!_state.tournaments[_state.activeTournamentId]) {
                _state.activeTournamentId = Object.keys(_state.tournaments)[0];
            }

        } else if (s.teams || s.judges || s.rounds) {
            // ── Migrate OLD single-tournament format ──
            const tour = _newTournamentData(s.tournamentName || 'My Tournament');
            ['teams','judges','rounds','tournament','publicSettings',
             'roomURLs','feedback','judgeTokens','universalJudgeToken','publish'].forEach(k => {
                if (s[k] !== undefined) tour[k] = s[k];
            });
            _state.tournaments['default'] = tour;
            _state.activeTournamentId = 'default';
        }

        if (s.auth) {
            _state.auth.users               = (s.auth.users && s.auth.users.length)
                                                ? s.auth.users
                                                : _state.auth.users;
            _state.auth.pendingRegistrations = s.auth.pendingRegistrations || [];
            // Explicitly clear any persisted session — never trust localStorage for auth
            _state.auth.isAuthenticated = false;
            _state.auth.currentUser     = null;
            _state.auth.lastActivity    = Date.now();
        }
    }
} catch(e) {
    console.error('Failed to load saved state', e);
}

// ================================
// INITIAL SAVE TO ENSURE PERSISTENCE
// ================================
save();

// ================================
// TOURNAMENT MANAGEMENT API
// ================================

/** Returns the active tournament's data object (same thing state.teams etc. read from) */
function activeTournament() {
    return _state.tournaments[_state.activeTournamentId];
}

/** Create a brand-new tournament and (optionally) switch to it immediately */
function createTournament(name, autoSwitch = true) {
    const id = 'tournament_' + Date.now();
    _state.tournaments[id] = _newTournamentData(name || 'New Tournament');
    if (autoSwitch) {
        _state.activeTournamentId = id;
    }
    save();
    _updateHeaderTournamentBadge();
    showNotification(`🏟️ "${_state.tournaments[id].name}" created${autoSwitch ? ' and activated!' : '!'}`, 'success');
    return id;
}

/** Switch the active tournament */
function switchTournament(id) {
    if (!_state.tournaments[id]) {
        showNotification('Tournament not found', 'error');
        return;
    }
    _state.activeTournamentId = id;
    save();
    _updateHeaderTournamentBadge();
    showNotification(`Switched to "${_state.tournaments[id].name}"`, 'success');
    // Re-render whatever is currently on screen
    const activeTabId = document.querySelector('.tab-content.active')?.id || 'public';
    window.switchTab?.(activeTabId);
}

/** Rename a tournament */
function renameTournament(id, newName) {
    if (!_state.tournaments[id] || !newName?.trim()) return;
    _state.tournaments[id].name = newName.trim();
    save();
    _updateHeaderTournamentBadge();
    showNotification(`Renamed to "${newName.trim()}"`, 'success');
}

/** Delete a tournament (cannot delete the last one) */
function deleteTournament(id) {
    const tourList = Object.keys(_state.tournaments);
    if (tourList.length <= 1) {
        showNotification('Cannot delete the only tournament', 'error');
        return;
    }
    const name = _state.tournaments[id]?.name || id;
    if (!confirm(`Delete "${name}"?\n\nAll teams, judges, rounds and results for this tournament will be permanently lost.`)) return;

    delete _state.tournaments[id];

    if (_state.activeTournamentId === id) {
        _state.activeTournamentId = Object.keys(_state.tournaments)[0];
        showNotification(`"${name}" deleted. Switched to "${activeTournament().name}"`, 'info');
    } else {
        showNotification(`"${name}" deleted`, 'info');
    }
    save();
    _updateHeaderTournamentBadge();
    window.renderAdminDashboard?.();
}

/** Inject the active tournament name into the page header */
function _updateHeaderTournamentBadge() {
    // Try to update an element we inject if it doesn't exist yet
    let badge = document.getElementById('header-tournament-badge');
    if (!badge) {
        const headerLogo = document.querySelector('.header-logo');
        if (headerLogo) {
            badge = document.createElement('span');
            badge.id = 'header-tournament-badge';
            badge.style.cssText = 'font-size:11px;font-weight:600;background:rgba(255,255,255,0.2);padding:3px 8px;border-radius:20px;margin-left:8px;color:rgba(255,255,255,0.9);vertical-align:middle;';
            headerLogo.appendChild(badge);
        }
    }
    if (badge) badge.textContent = activeTournament()?.name || '';
    // Also update document title
    const tName = activeTournament()?.name;
    if (tName) document.title = `${tName} — Orion Debate Tab`;
}

// Inject badge on load
try { _updateHeaderTournamentBadge(); } catch(e) {}

// ============================================
// PERMANENT JUDGE URL SYSTEM
// ============================================

// SECURITY: use crypto.getRandomValues instead of Math.random() for all tokens.
// Math.random() is not cryptographically secure; tokens derived from it can be
// predicted, which would let an attacker forge judge/room URLs.
function _secureToken(prefix) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${prefix}_${hex}`;
}

function generateJudgeToken() {
    return _secureToken('judge');
}

function getOrCreateJudgeToken(judgeId) {
    if (!state.judgeTokens[judgeId]) {
        state.judgeTokens[judgeId] = generateJudgeToken();
        // No need for manual save - proxy handles it
    }
    return state.judgeTokens[judgeId];
}

function getJudgeCurrentAssignment(judgeId) {
    const assignments = [];
    // EFFICIENCY: build a Map once instead of calling state.teams.find() inside
    // every iteration of the rounds→debates loop (was O(rounds × debates × teams)).
    const teamById = new Map((state.teams || []).map(t => [String(t.id), t]));

    (state.rounds || []).forEach((round, roundIdx) => {
        (round.debates || []).forEach((debate, debateIdx) => {
            const panelMember = (debate.panel || []).find(p => String(p.id) == String(judgeId));
            if (!panelMember) return;

            assignments.push({
                roundIdx,
                roundId:   round.id,
                debateIdx,
                roomName:  round.rooms?.[debateIdx] || `Room ${debateIdx + 1}`,
                motion:    round.motion,
                role:      panelMember.role,
                govTeam:   teamById.get(String(debate.gov)),
                oppTeam:   teamById.get(String(debate.opp)),
                entered:   debate.entered,
                panel:     debate.panel
            });
        });
    });

    return assignments;
}

function validateJudgeToken(token) {
    for (const [judgeId, storedToken] of Object.entries(state.judgeTokens || {})) {
        if (storedToken === token) {
            const judge = (state.judges || []).find(j => j.id == judgeId);
            if (judge) {
                return {
                    judgeId: judgeId,
                    judge,
                    assignments: getJudgeCurrentAssignment(judgeId)
                };
            }
        }
    }
    return null;
}

function getJudgeURL(judgeId) {
    const token = getOrCreateJudgeToken(judgeId);
    const baseURL = window.location.origin + window.location.pathname;
    return `${baseURL}?judge=${token}`;
}

function copyJudgeURL(judgeId) {
    const judge = (state.judges || []).find(j => j.id == judgeId);
    if (!judge) return;

    if (!state.judgeTokens[judgeId]) {
        showNotification('Please generate URL first', 'error');
        return;
    }

    const url = getJudgeURL(judgeId);
    navigator.clipboard.writeText(url).then(() => {
        showNotification(`✅ ${judge.name}'s URL copied! Share for all rounds.`, 'success');
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = url; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        showNotification(`${judge.name}'s URL copied!`, 'success');
    });
}

function generateJudgeURL(judgeId) {
    const judge = (state.judges || []).find(j => j.id == judgeId);
    if (!judge) return;

    state.judgeTokens[judgeId] = generateJudgeToken();
    // No manual save needed

    if (typeof window.displayJudges === 'function') window.displayJudges();
    showNotification(`Private URL generated for ${judge.name}!`, 'success');
    setTimeout(() => copyJudgeURL(judgeId), 500);
}

function regenerateJudgeURL(judgeId) {
    const judge = (state.judges || []).find(j => j.id == judgeId);
    if (!judge) return;

    if (!confirm(`Regenerate URL for ${judge.name}?\n\nThe old URL will stop working.`)) return;

    state.judgeTokens[judgeId] = generateJudgeToken();
    // No manual save needed

    if (typeof window.displayJudges === 'function') window.displayJudges();
    showNotification(`New URL for ${judge.name}! Old URL now invalid.`, 'success');
    setTimeout(() => copyJudgeURL(judgeId), 500);
}

function generateAllJudgeURLs() {
    if ((state.judges || []).length === 0) {
        showNotification('No judges to generate URLs for', 'error'); return;
    }

    const noURL = (state.judges || []).filter(j => !state.judgeTokens[j.id]);
    if (noURL.length === 0) {
        showNotification('All judges already have URLs!', 'info'); return;
    }

    if (!confirm(`Generate URLs for ${noURL.length} judge(s)?`)) return;

    noURL.forEach(j => { state.judgeTokens[j.id] = generateJudgeToken(); });
    // No manual save needed

    if (typeof window.renderJudges === 'function') window.renderJudges();
    else if (typeof window.displayJudges === 'function') window.displayJudges();

    showNotification(`Generated URLs for ${noURL.length} judge(s)!`, 'success');
}

// ============================================
// JUDGE DASHBOARD
// ============================================

function showJudgeDashboard(judgeData) {
    let judge, assignments;

    if (typeof judgeData === 'object' && judgeData !== null) {
        judge = judgeData.judge;
        assignments = judgeData.assignments || [];
    } else {
        const judgeId = judgeData;
        judge = (state.judges || []).find(j => j.id == judgeId);
        assignments = getJudgeCurrentAssignment(judgeId) || [];
    }

    if (!judge) { showNotification('Judge not found', 'error'); return; }

    closeAllModals();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,.7);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
    overlay.onclick = e => { if (e.target === overlay) closeAllModals(); };

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.cssText = 'background:white;border-radius:16px;max-width:900px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);border-top:5px solid #f97316;animation:slideUp .3s ease;';

    const pending   = assignments.filter(a => !a.entered);
    const completed = assignments.filter(a =>  a.entered);

    modal.innerHTML = `
        <style>@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}</style>
        <div style="background:linear-gradient(135deg,#f97316,#ea580c);color:white;padding:30px;border-radius:16px 16px 0 0">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px">
                <h2 style="margin:0;font-size:28px;color:white">⚖️ ${escapeHTML(judge.name)}</h2>
                <button onclick="window.closeAllModals()" style="background:rgba(255,255,255,.2);border:none;color:white;font-size:20px;width:40px;height:40px;border-radius:50%;cursor:pointer">✕</button>
            </div>
            <div style="display:flex;gap:15px;flex-wrap:wrap">
                <span style="background:rgba(255,255,255,.2);padding:6px 14px;border-radius:40px;font-size:14px">${(judge.role || 'wing').toUpperCase()} JUDGE</span>
                <span style="background:rgba(255,255,255,.2);padding:6px 14px;border-radius:40px;font-size:14px">📋 ${assignments.length} Assignment${assignments.length!==1?'s':''}</span>
                <span style="background:rgba(255,255,255,.2);padding:6px 14px;border-radius:40px;font-size:14px">⏳ ${pending.length} Pending</span>
                <span style="background:rgba(255,255,255,.2);padding:6px 14px;border-radius:40px;font-size:14px">✅ ${completed.length} Complete</span>
            </div>
        </div>
        <div style="padding:30px">
            ${assignments.length === 0 ? `
                <div style="text-align:center;padding:60px 20px">
                    <div style="font-size:64px;margin-bottom:20px">📭</div>
                    <h3 style="margin:0 0 10px;color:#1e293b">No Assignments Yet</h3>
                    <p style="color:#64748b;margin:0">This judge hasn't been assigned to any rooms.</p>
                </div>
            ` : `
                ${pending.length > 0 ? `
                    <div style="margin-bottom:30px">
                        <h3 style="margin:0 0 20px;color:#1e293b;display:flex;align-items:center;gap:10px">
                            <span style="background:#f59e0b;color:white;padding:8px 16px;border-radius:8px">Pending Submissions</span>
                            <span style="color:#64748b;font-size:16px;font-weight:normal">${pending.length} room${pending.length!==1?'s':''}</span>
                        </h3>
                        <div style="display:grid;gap:15px">${pending.map(a => generateAssignmentCard(a, judge, true)).join('')}</div>
                    </div>
                ` : ''}
                ${completed.length > 0 ? `
                    <div>
                        <h3 style="margin:0 0 20px;color:#1e293b;display:flex;align-items:center;gap:10px">
                            <span style="background:#10b981;color:white;padding:8px 16px;border-radius:8px">✅ Completed</span>
                            <span style="color:#64748b;font-size:16px;font-weight:normal">${completed.length} room${completed.length!==1?'s':''}</span>
                        </h3>
                        <div style="display:grid;gap:15px">${completed.map(a => generateAssignmentCard(a, judge, false)).join('')}</div>
                    </div>
                ` : ''}
            `}
        </div>
        <div style="padding:20px 30px;border-top:1px solid #e2e8f0;text-align:center">
            <button onclick="window.closeAllModals()" style="background:#64748b;color:white;border:none;padding:12px 30px;border-radius:8px;font-weight:600;cursor:pointer">Close</button>
        </div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

function generateAssignmentCard(assignment, judge, isPending) {
    const isChair = assignment.role === 'chair';
    const otherJudges = (assignment.panel || []).filter(p => p.id != judge.id);
    // Build a Map once instead of calling state.judges.find() inside every template interpolation
    const judgeById = new Map((state.judges || []).map(j => [String(j.id), j]));

    return `
        <div style="background:white;padding:20px;border-radius:12px;border-left:4px solid ${isPending?'#f59e0b':'#2e7d32'};box-shadow:0 2px 4px rgba(0,0,0,.05)">
            <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:15px">
                <div>
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                        <h4 style="margin:0;color:#1e293b;font-size:18px">Round ${assignment.roundId}: ${escapeHTML(assignment.roomName)}</h4>
                        <span style="background:${isChair?'#2e7d32':'#1a73e8'};color:white;padding:3px 10px;border-radius:40px;font-size:12px;font-weight:600">${isChair?'CHAIR':'WING'}</span>
                    </div>
                    <div style="padding:10px;background:#fef3c7;border-radius:6px;margin-bottom:10px">
                        <div style="font-size:13px;color:#92400e"><strong>Motion:</strong> ${escapeHTML(assignment.motion || '')}</div>
                    </div>
                </div>
                ${isPending ? `<button onclick="window.openRoomSubmission(${assignment.roundIdx},${assignment.debateIdx})" style="background:#1a73e8;color:white;border:none;padding:10px 20px;border-radius:8px;font-weight:600;cursor:pointer;white-space:nowrap">${isChair?'Submit Results':'💬 View Room'}</button>` : ''}
            </div>
            <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center;margin-bottom:12px">
                <div style="text-align:center;padding:12px;background:#e8f0fe;border-radius:8px;border:2px solid #1a73e8">
                    <div style="font-size:12px;color:#1565c0;font-weight:600;margin-bottom:3px">PROPOSITION</div>
                    <div style="font-size:15px;font-weight:600;color:#1a73e8">${escapeHTML(assignment.govTeam?.name || '?')}</div>
                    <div style="font-size:11px;color:#64748b">#${escapeHTML(assignment.govTeam?.code || '')}</div>
                </div>
                <div style="font-size:18px;font-weight:600;color:#64748b">VS</div>
                <div style="text-align:center;padding:12px;background:#fce7f3;border-radius:8px;border:2px solid #c2185b">
                    <div style="font-size:12px;color:#be123c;font-weight:600;margin-bottom:3px">OPPOSITION</div>
                    <div style="font-size:15px;font-weight:600;color:#c2185b">${escapeHTML(assignment.oppTeam?.name || '?')}</div>
                    <div style="font-size:11px;color:#64748b">#${escapeHTML(assignment.oppTeam?.code || '')}</div>
                </div>
            </div>
            ${otherJudges.length > 0 ? `
                <div style="padding:10px;background:#f8fafc;border-radius:6px;font-size:13px;color:#64748b">
                    <strong style="color:#1e293b">Panel:</strong>
                    ${otherJudges.map(p => { const j = judgeById.get(String(p.id)); return j ? `${escapeHTML(j.name)} (${p.role})` : ''; }).filter(Boolean).join(' • ')}
                </div>
            ` : ''}
            ${!isPending ? `
                <div style="margin-top:12px;padding:10px;background:#e6f4ea;border-radius:6px;display:flex;align-items:center;gap:8px">
                    <span style="font-size:20px">✅</span>
                    <span style="color:#1e7e34;font-weight:600;font-size:14px">Results submitted and recorded</span>
                </div>
            ` : ''}
        </div>`;
}

function openRoomSubmission(roundIdx, debateIdx) {
    const round  = (state.rounds || [])[roundIdx];
    const debate = round?.debates?.[debateIdx];
    if (!round || !debate) return;
    showJudgeSubmissionInterface({ roundIdx, debateIdx, judges: (debate.panel || []).map(p => p.id) });
}

// ============================================
// PRIVATE ROOM URL SYSTEM
// ============================================

function generateRoomToken() {
    return _secureToken('rm');
}

function getOrCreateRoomURL(roundIdx, debateIdx) {
    const key = `${roundIdx}-${debateIdx}`;
    if (!state.roomURLs[key]) {
        const round  = (state.rounds || [])[roundIdx];
        const debate = round?.debates?.[debateIdx];
        if (!round || !debate) return null;
        state.roomURLs[key] = {
            token: generateRoomToken(),
            roundIdx, debateIdx,
            judges: debate.panel || [],
            createdAt: new Date().toISOString(),
            active: true
        };
        // No manual save needed
    }
    return state.roomURLs[key];
}

function validateRoomToken(token) {
    for (const [, roomData] of Object.entries(state.roomURLs || {})) {
        if (roomData.token === token && roomData.active) return roomData;
    }
    return null;
}

function isJudgeInRoom(roomData) {
    if (state.auth?.currentUser?.role === 'admin') return true;
    if (!state.auth?.currentUser || state.auth.currentUser.role !== 'judge') return false;
    return (roomData.judges || []).includes(state.auth.currentUser.associatedId);
}

function deactivateRoomURL(roundIdx, debateIdx) {
    const key = `${roundIdx}-${debateIdx}`;
    if (state.roomURLs?.[key]) { 
        state.roomURLs[key].active = false; 
        // No manual save needed
    }
}

// ============================================
// JUDGE SUBMISSION INTERFACE
// ============================================

function showJudgeSubmissionInterface(roomData) {
    if (!state.auth.isAuthenticated) {
        showNotification('Please login to access this room', 'error');
        setTimeout(() => window.showLoginModal?.(), 1000);
        return;
    }
    if (state.auth.currentUser.role !== 'judge' && state.auth.currentUser.role !== 'admin') {
        showNotification('Only judges and admins can access room submission links', 'error'); return;
    }
    if (state.auth.currentUser.role !== 'admin' && !isJudgeInRoom(roomData)) {
        showNotification('You are not assigned to this room', 'error'); return;
    }

    const round    = (state.rounds || [])[roomData.roundIdx];
    const debate   = round?.debates?.[roomData.debateIdx];
    if (!round || !debate) return;
    
    const roomName = round.rooms?.[roomData.debateIdx] || `Room ${roomData.debateIdx + 1}`;
    const gov      = (state.teams || []).find(t => t.id === debate.gov);
    const opp      = (state.teams || []).find(t => t.id === debate.opp);
    if (!gov || !opp) return;

    let isChair = false, userRole = 'Admin';
    if (state.auth.currentUser.role === 'admin') {
        isChair = true; userRole = 'Administrator';
    } else {
        const judgePanel = (debate.panel || []).find(p => p.id === state.auth.currentUser.associatedId);
        isChair = judgePanel?.role === 'chair';
        userRole = isChair ? 'Chair' : 'Wing Judge';
    }

    closeAllModals();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = e => { if (e.target === overlay) closeAllModals(); };

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.maxWidth  = '900px';
    modal.style.maxHeight = '90vh';
    modal.style.overflow  = 'auto';

    modal.innerHTML = `
        <div style="background:linear-gradient(135deg,#1a73e8,#0d47a1);color:white;padding:25px;border-radius:12px 12px 0 0;margin:-20px -20px 20px -20px">
            <h2 style="margin:0 0 10px;font-size:28px">Judge Portal</h2>
            <p style="margin:0;opacity:.9;font-size:16px">${escapeHTML(roomName)} • Round ${round.id} • ${userRole}</p>
        </div>
        <div style="background:#f8fafc;padding:20px;border-radius:8px;margin-bottom:20px">
            <h3 style="margin:0 0 15px;color:#1e293b">📋 Debate Information</h3>
            <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:15px;align-items:center">
                <div style="text-align:center;padding:15px;background:white;border-radius:8px;border:2px solid #1a73e8">
                    <div style="font-size:14px;color:#64748b;margin-bottom:5px">PROPOSITION</div>
                    <div style="font-size:18px;font-weight:600;color:#1a73e8">${escapeHTML(gov.name)}</div>
                    <div style="font-size:12px;color:#64748b;margin-top:3px">#${escapeHTML(gov.code || '')}</div>
                </div>
                <div style="font-size:24px;font-weight:600;color:#64748b">VS</div>
                <div style="text-align:center;padding:15px;background:white;border-radius:8px;border:2px solid #c2185b">
                    <div style="font-size:14px;color:#64748b;margin-bottom:5px">OPPOSITION</div>
                    <div style="font-size:18px;font-weight:600;color:#c2185b">${escapeHTML(opp.name)}</div>
                    <div style="font-size:12px;color:#64748b;margin-top:3px">#${escapeHTML(opp.code || '')}</div>
                </div>
            </div>
            <div style="margin-top:15px;padding:12px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px">
                <strong style="color:#92400e">Motion:</strong> <span style="color:#78350f">${escapeHTML(round.motion || '')}</span>
            </div>
        </div>
        ${isChair ? `
            <div style="margin-bottom:20px">
                <h3 style="margin:0 0 15px;color:#1e293b">Enter Results ${state.auth.currentUser.role==='admin'?'(Admin Access)':'(Chair Only)'}</h3>
                <div id="chairResultsForm">${generateResultsForm(gov, opp, roomData.roundIdx, roomData.debateIdx)}</div>
            </div>
        ` : `
            <div style="padding:20px;background:#e0f2fe;border-radius:8px;border-left:4px solid #0284c7;margin-bottom:20px">
                <p style="margin:0;color:#075985"><strong>Wing Judge:</strong> Only the Chair can submit results.</p>
            </div>
        `}
        ${state.auth.currentUser.role === 'judge' ? `
            <div style="margin-bottom:20px">
                <h3 style="margin:0 0 15px;color:#1e293b">💬 Judge Feedback</h3>
                <div id="feedbackSection">${generateFeedbackForm(debate.panel, state.auth.currentUser.associatedId)}</div>
            </div>
        ` : `
            <div style="padding:20px;background:#f0fdf4;border-radius:8px;border-left:4px solid #22c55e;margin-bottom:20px">
                <p style="margin:0;color:#166534"><strong>Admin Access:</strong> You have full access to submit results for this room.</p>
            </div>
        `}
        <div style="margin-top:20px;text-align:center">
            <button onclick="window.closeAllModals()" style="background:#64748b;color:white;border:none;padding:12px 30px;border-radius:8px;font-weight:600;cursor:pointer">Close</button>
        </div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

function generateResultsForm(gov, opp, roundIdx, debateIdx) {
    return `
        <form id="judgeResultsForm" onsubmit="window.submitJudgeResults(${roundIdx},${debateIdx});return false">
            <div style="display:grid;gap:20px">
                <div style="background:white;padding:20px;border-radius:8px;border:2px solid #1a73e8">
                    <h4 style="margin:0 0 15px;color:#1a73e8">🔵 ${escapeHTML(gov.name)} Scores</h4>
                    ${(gov.speakers || []).slice(0,3).map((speaker,i) => `
                        <div style="margin-bottom:12px">
                            <label style="display:block;margin-bottom:5px;font-weight:600">${escapeHTML(speaker.name)}</label>
                            <input type="number" id="gov_speaker_${i}" min="60" max="80" step="0.5" required placeholder="60-80"
                                   style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:6px">
                        </div>`).join('')}
                </div>
                <div style="background:white;padding:20px;border-radius:8px;border:2px solid #c2185b">
                    <h4 style="margin:0 0 15px;color:#c2185b">🔴 ${escapeHTML(opp.name)} Scores</h4>
                    ${(opp.speakers || []).slice(0,3).map((speaker,i) => `
                        <div style="margin-bottom:12px">
                            <label style="display:block;margin-bottom:5px;font-weight:600">${escapeHTML(speaker.name)}</label>
                            <input type="number" id="opp_speaker_${i}" min="60" max="80" step="0.5" required placeholder="60-80"
                                   style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:6px">
                        </div>`).join('')}
                </div>
                <button type="submit" style="width:100%;background:#2e7d32;color:white;border:none;padding:16px;border-radius:8px;font-weight:600;cursor:pointer;font-size:16px">Submit Results</button>
            </div>
        </form>`;
}

function generateFeedbackForm(panel, currentJudgeId) {
    const others = (panel || []).filter(p => p.id !== currentJudgeId);
    if (others.length === 0) return '<p style="color:#64748b;text-align:center;padding:20px">No other judges in this panel</p>';

    return `
        <div style="background:white;padding:20px;border-radius:8px">
            <p style="color:#64748b;margin:0 0 15px">Provide constructive feedback to your fellow judges:</p>
            ${others.map(pj => {
                const j = (state.judges || []).find(jj => jj.id == pj.id);
                if (!j) return '';
                return `
                    <div style="margin-bottom:20px;padding:15px;background:#f8fafc;border-radius:8px">
                        <div style="margin-bottom:10px">
                            <strong style="color:#1e293b">${escapeHTML(j.name)}</strong>
                            <span style="margin-left:8px;background:${pj.role==='chair'?'#2e7d32':'#1a73e8'};color:white;padding:2px 8px;border-radius:40px;font-size:11px">${pj.role.toUpperCase()}</span>
                        </div>
                        <div style="margin-bottom:10px">
                            <label style="display:block;margin-bottom:5px;font-size:14px;color:#64748b">Rating</label>
                            <select id="feedback_rating_${pj.id}" style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:6px">
                                <option value="">Select rating</option>
                                <option value="5">⭐⭐⭐⭐⭐ Excellent</option>
                                <option value="4">⭐⭐⭐⭐ Very Good</option>
                                <option value="3">⭐⭐⭐ Good</option>
                                <option value="2">⭐⭐ Fair</option>
                                <option value="1">⭐ Needs Improvement</option>
                            </select>
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:5px;font-size:14px;color:#64748b">Comments (Optional)</label>
                            <textarea id="feedback_comment_${pj.id}" rows="3" placeholder="Share constructive feedback…" style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:6px;resize:vertical"></textarea>
                        </div>
                        <button onclick="window.submitJudgeFeedback(${pj.id})" style="margin-top:10px;background:#1a73e8;color:white;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer">Submit Feedback</button>
                    </div>`;
            }).join('')}
        </div>`;
}

function submitJudgeResults(roundIdx, debateIdx) {
    const round  = (state.rounds || [])[roundIdx];
    const debate = round?.debates?.[debateIdx];
    const gov    = (state.teams || []).find(t => t.id === debate?.gov);
    const opp    = (state.teams || []).find(t => t.id === debate?.opp);
    if (!round || !debate || !gov || !opp) return;

    const govScores = (gov.speakers || []).slice(0,3).map((_,i) => parseFloat(document.getElementById(`gov_speaker_${i}`)?.value) || 0);
    const oppScores = (opp.speakers || []).slice(0,3).map((_,i) => parseFloat(document.getElementById(`opp_speaker_${i}`)?.value) || 0);

    if (govScores.some(s => s < 60 || s > 80) || oppScores.some(s => s < 60 || s > 80)) {
        showNotification('All scores must be between 60 and 80', 'error'); return;
    }

    debate.govResults = { scores: govScores, total: govScores.reduce((a,b) => a+b, 0) };
    debate.oppResults = { scores: oppScores, total: oppScores.reduce((a,b) => a+b, 0) };
    debate.entered    = true;
    debate.enteredBy  = state.auth.currentUser.name;
    debate.enteredAt  = new Date().toISOString();

    updateTeamStats(roundIdx, debateIdx);
    deactivateRoomURL(roundIdx, debateIdx);
    // No manual save needed - proxy handles it
    
    showNotification('Results submitted successfully!', 'success');
    closeAllModals();
    if (typeof window.displayRounds === 'function') window.displayRounds();
}

function submitJudgeFeedback(toJudgeId) {
    const rating  = document.getElementById(`feedback_rating_${toJudgeId}`)?.value;
    const comment = document.getElementById(`feedback_comment_${toJudgeId}`)?.value.trim() || '';

    if (!rating) { showNotification('Please select a rating', 'error'); return; }

    if (!state.feedback) state.feedback = [];
    
    state.feedback.push({
        id: Date.now(),
        fromJudgeId:   state.auth.currentUser.associatedId,
        fromJudgeName: state.auth.currentUser.name,
        toJudgeId,
        rating: parseInt(rating),
        comment,
        timestamp: new Date().toISOString()
    });
    // No manual save needed
    
    showNotification('Feedback submitted!', 'success');
    
    // Clear the form
    const ratingEl = document.getElementById(`feedback_rating_${toJudgeId}`);
    const commentEl = document.getElementById(`feedback_comment_${toJudgeId}`);
    if (ratingEl) ratingEl.value = '';
    if (commentEl) commentEl.value = '';
}

function updateTeamStats(roundIdx, debateIdx) {
    const round  = (state.rounds || [])[roundIdx];
    const debate = round?.debates?.[debateIdx];
    const gov    = (state.teams || []).find(t => t.id === debate?.gov);
    const opp    = (state.teams || []).find(t => t.id === debate?.opp);
    if (!round || !debate || !gov || !opp || !debate.govResults || !debate.oppResults) return;

    // Guard: reverse previous tally if this debate was already counted,
    // preventing wins/points from doubling on a result re-entry.
    const roundKey = round.id;
    if (gov.roundScores?.[roundKey] !== undefined) {
        const prevGov = gov.roundScores[roundKey] || 0;
        const prevOpp = opp.roundScores?.[roundKey] || 0;
        gov.total = (gov.total || 0) - prevGov;
        opp.total = (opp.total || 0) - prevOpp;
        // Reverse win if it was previously recorded
        if (prevGov > prevOpp && gov.wins > 0) gov.wins -= 1;
        if (prevOpp > prevGov && opp.wins > 0) opp.wins -= 1;
    }

    if (debate.govResults.total > debate.oppResults.total) gov.wins = (gov.wins||0) + 1;
    else if (debate.oppResults.total > debate.govResults.total) opp.wins = (opp.wins||0) + 1;

    gov.total = (gov.total||0) + debate.govResults.total;
    opp.total = (opp.total||0) + debate.oppResults.total;

    gov.roundScores = gov.roundScores || {}; 
    opp.roundScores = opp.roundScores || {};
    gov.roundScores[round.id] = debate.govResults.total;
    opp.roundScores[round.id] = debate.oppResults.total;

    (debate.govResults.scores || []).forEach((score,i) => {
        if (gov.speakers && gov.speakers[i]) {
            gov.speakers[i].substantiveTotal = (gov.speakers[i].substantiveTotal||0) + score;
            gov.speakers[i].substantiveCount = (gov.speakers[i].substantiveCount||0) + 1;
            gov.speakers[i].substantiveScores = gov.speakers[i].substantiveScores || {};
            gov.speakers[i].substantiveScores[round.id] = score;
        }
    });
    (debate.oppResults.scores || []).forEach((score,i) => {
        if (opp.speakers && opp.speakers[i]) {
            opp.speakers[i].substantiveTotal = (opp.speakers[i].substantiveTotal||0) + score;
            opp.speakers[i].substantiveCount = (opp.speakers[i].substantiveCount||0) + 1;
            opp.speakers[i].substantiveScores = opp.speakers[i].substantiveScores || {};
            opp.speakers[i].substantiveScores[round.id] = score;
        }
    });
}

// ============================================
// RESET FUNCTIONS
// ============================================

/** Reset only draws/rounds/results — preserves teams & judges */
function resetTournamentDrawOnly() {
    const t = _state.tournaments[_state.activeTournamentId];
    if (!t) return;

    // Clear rounds
    t.rounds = [];

    // Reset team win/point tallies
    (t.teams || []).forEach(team => {
        team.wins = 0;
        team.total = 0;
        team.roundScores = {};
        team.eliminated = false;
        team.broke = false;
        team.seed = undefined;
        team.breakIneligible = false;
        team.breakIneligibleReason = '';
        // Reset speaker stats
        (team.speakers || []).forEach(sp => {
            sp.substantiveTotal = 0;
            sp.substantiveCount = 0;
            sp.substantiveScores = {};
            sp.replyTotal = 0;
            sp.replyCount = 0;
            sp.replyScores = {};
        });
    });

    // Reset tournament bracket state
    if (t.tournament) {
        t.tournament.active = false;
        t.tournament.bracket = [];
        t.tournament.currentRound = 0;
        t.tournament.champion = null;
        t.tournament.breakingTeams = [];
    }

    // Clear room URLs (those are round-specific)
    t.roomURLs = {};

    // Reset publish flags for draw-specific tabs
    if (t.publish) {
        t.publish.draw = false;
        t.publish.standings = false;
        t.publish.speakers = false;
        t.publish.break = false;
        t.publish.knockout = false;
        t.publish.results = false;
    }

    // No manual save needed - proxy handles it
    showNotification('✅ Draw reset — teams and judges preserved', 'success');
}

/** Full tournament wipe (teams+judges+rounds) */
function fullTournamentWipe() {
    const id = _state.activeTournamentId;
    _state.tournaments[id] = _newTournamentData(_state.tournaments[id]?.name || 'My Tournament');
    // No manual save needed
    showNotification('💣 Full tournament wipe complete', 'info');
}

// escapeHTML is imported from utils.js — single source of truth

function refreshAll() {
    notifyAll();
}

// ============================================
// EXPORTS
// ============================================

export {
    state,
    refreshAll,
        watch,
    notify,

    // Tournament management
    activeTournament,
    createTournament,
    switchTournament,
    renameTournament,
    deleteTournament,

    // Judge URL system
    generateJudgeToken,
    getOrCreateJudgeToken,
    getJudgeCurrentAssignment,
    validateJudgeToken,
    getJudgeURL,
    copyJudgeURL,
    generateJudgeURL,
    regenerateJudgeURL,
    generateAllJudgeURLs,

    // Judge dashboard
    showJudgeDashboard,
    openRoomSubmission,

    // Room URL system
    generateRoomToken,
    getOrCreateRoomURL,
    validateRoomToken,
    isJudgeInRoom,
    deactivateRoomURL,

    // Judge submission
    showJudgeSubmissionInterface,
    submitJudgeResults,
    submitJudgeFeedback,

    // Reset functions
    resetTournamentDrawOnly,
    fullTournamentWipe,

    // Helpers
    escapeHTML
};