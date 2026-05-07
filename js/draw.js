// ============================================
// DRAW.JS — Rounds, pairing, judge allocation, results
// ============================================

import { state, save, saveNow, watch } from './state.js';
import { getOrCreateRoomURL } from './state.js';
import { showNotification, escapeHTML, closeAllModals, hasConflict, getPreviousMeetings } from './utils.js';
import { renderStandings } from './tab.js';


// ─── Format detection ────────────────────────────────────────────────────────
function getFormat() {
    const activeId = state.activeTournamentId;
    return state.tournaments?.[activeId]?.format || 'standard';
}
function isBP() { return getFormat() === 'bp'; }
function isSpeech() { return getFormat() === 'speech'; }


// ─── CSS — injected once into <head>, not on every render ────────────────────
let _cssInjected = false;
function _injectDrawCSS() {
    if (_cssInjected) return;
    _cssInjected = true;
    const style = document.createElement('style');
    style.textContent = `
  .dnd-judge-chip{display:inline-flex;align-items:center;gap:5px;background:#f1f5f9;border:1px solid #cbd5e1;padding:3px 8px 3px 10px;border-radius:20px;font-size:12px;color:#1e293b;font-weight:500;cursor:grab;user-select:none;transition:all .15s;margin:2px}
  .dnd-judge-chip:hover{background:#e0f2fe;border-color:#7dd3fc;color:#0369a1}
  .dnd-judge-chip.dragging{opacity:.4;cursor:grabbing}
  .dnd-judge-chip .chip-role{font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;background:white;padding:1px 5px;border-radius:8px;border:1px solid #e2e8f0}
  .dnd-judge-chip .chip-role.chair{color:#1e40af;border-color:#bfdbfe;background:#eff6ff}
  .chip-remove{background:none;border:none;cursor:pointer;color:#94a3b8;font-size:14px;line-height:1;padding:0 2px;border-radius:50%;flex-shrink:0}
  .chip-remove:hover{color:#ef4444;background:#fee2e2}
  .dnd-team-chip{display:block;width:100%;cursor:grab;user-select:none;transition:all .15s;border-radius:8px}
  .dnd-team-chip:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.12)}
  .dnd-team-chip.dragging{opacity:.35;cursor:grabbing;transform:scale(.97)}
  .dnd-judge-zone{min-height:34px;padding:5px;border-radius:8px;border:2px dashed transparent;transition:all .15s;display:flex;flex-wrap:wrap;align-items:center;gap:2px}
  .dnd-judge-zone.drag-over{border-color:#3b82f6;background:#eff6ff}
  .dnd-judge-zone.drag-over-conflict{border-color:#f59e0b;background:#fffbeb}
  .dnd-team-zone{transition:all .15s;border-radius:8px}
  .dnd-team-zone.drag-over{outline:2px dashed #3b82f6;outline-offset:2px;background:#eff6ff !important}
  .dnd-team-zone.drag-over-warn{outline:2px dashed #f59e0b;outline-offset:2px;background:#fffbeb !important}
  .judge-add-select{font-size:12px;border:1px dashed #cbd5e1;border-radius:14px;padding:3px 10px;color:#3b82f6;background:#f0f9ff;cursor:pointer;transition:all .15s;outline:none;max-width:150px}
  .judge-add-select:hover{border-color:#3b82f6;background:#dbeafe}
  .draw-room{background:#f8fafc;border-radius:10px;border-left:4px solid #e2e8f0;padding:14px;margin-bottom:10px;transition:border-color .2s}
  .draw-room.done{border-left-color:#10b981}
  .draw-room.pending-partial{border-left-color:#f59e0b}
  .draw-room.no-judges{border-left-color:#ef4444}
  .draw-create-panel{background:white;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:20px;display:none}
  .draw-create-panel.open{display:block}
  .knockout-bracket{display:flex;justify-content:space-around;margin:20px 0;overflow-x:auto;padding:20px 0;gap:20px}
  .bracket-round{display:flex;flex-direction:column;gap:20px;min-width:280px;background:#f8fafc;padding:16px;border-radius:12px;border:1px solid #e2e8f0}
  .bracket-match{background:white;border-radius:8px;padding:12px;box-shadow:0 2px 4px rgba(0,0,0,.1);border:1px solid #e2e8f0;transition:all .2s}
  .bracket-match:hover{box-shadow:0 4px 12px rgba(0,0,0,.15);transform:translateY(-2px)}
  .bracket-winner{background:#d1fae5;border-left:4px solid #10b981}
  .bracket-winner .team-name{font-weight:700}
  .bracket-current{border:2px solid #3b82f6;background:#eff6ff}
    `;
    document.head.appendChild(style);
}

// ─── Reusable judge allocation pill — replaces 3 identical IIFEs ─────────────
function _judgePillHtml(debate, icon = '⚖️') {
    const names = (debate.panel || [])
        .map(p => { const j = (state.judges || []).find(j => j.id == p.id); return j ? escapeHTML(j.name) : null; })
        .filter(Boolean);
    return names.length
        ? `<span style="display:inline-flex;align-items:center;gap:5px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:20px;padding:3px 10px;font-size:12px;color:#334155;font-weight:500">${icon} ${names.join(' · ')}</span>`
        : `<span style="background:#fee2e2;color:#b91c1c;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;border:1px solid #fca5a5">⚖️ No judge</span>`;
}


// ============================================================================
// Team name / code toggle
// ============================================================================
let _hideTeamNames = false;

/** Returns display label for a team.
 *  In code mode, guarantees uniqueness: if multiple teams share the same base
 *  code a stable numeric suffix is appended (SEN → SEN1, SEN2 …). */
function teamLabel(team) {
    if (!team) return '?';
    if (!_hideTeamNames) return escapeHTML(team.name);

    const baseCode = team.code || team.name.substring(0, 3).toUpperCase();
    const sharing = (state.teams || [])
        .filter(t => (t.code || t.name.substring(0, 3).toUpperCase()) === baseCode)
        .sort((a, b) => a.id - b.id);   // stable order by creation time

    if (sharing.length <= 1) return baseCode;
    const idx = sharing.findIndex(t => t.id === team.id);
    return baseCode + (idx + 1);        // SEN1, SEN2 …
}

window._toggleTeamNames = function () {
    _hideTeamNames = !_hideTeamNames;
    const btn = document.getElementById('toggle-team-names-btn');
    if (btn) btn.textContent = _hideTeamNames ? '🏷️ Show Names' : '🔤 Hide Names';
    displayRounds();
};

// ============================================================================
export function renderDraw() {
    const container = document.getElementById('draw');
    if (!container) return;

    const isAdmin = state.auth?.currentUser?.role === 'admin';
    const rounds = state.rounds || [];
    const entered = rounds.flatMap(r => r.debates || []).filter(d => d.entered).length;
    const total = rounds.flatMap(r => r.debates || []).length;

    // Load saved selector preferences
    let savedPrefs = {};
    try { savedPrefs = JSON.parse(localStorage.getItem('orion_draw_prefs') || '{}'); } catch (e) { }

    const savedPairMethod = savedPrefs['cr-pair'] || 'random';
    const savedSideMethod = savedPrefs['cr-sides'] || 'random';
    const savedFilter = savedPrefs['round-filter'] || 'all';

    // Pre-compute speech-conditional fragments (avoids nested backticks)
    const _speechMode = isSpeech();
    const _drawTitle = _speechMode ? '🎤 Speech Draw' : '🎲 Draw';
    const _resultsLabel = _speechMode
        ? (entered + '/' + total + ' scored')
        : (entered + '/' + total + ' results');
    const _motionPlaceholder = _speechMode
        ? 'e.g. Prepared Speech — Persuasion'
        : 'e.g. This House Would ban social media for under-16s';
    const _pairingLabel = _speechMode ? 'Room Draw' : 'Pairing';
    const _powerLabel = _speechMode ? '⚡ Power (strong together)' : '⚡ Power';
    const _foldLabel = _speechMode ? '📊 Balanced (spread ability)' : '📊 Fold';
    const _extraPairOpts = _speechMode ? '' : [
        '<option value="roundrobin" ' + (savedPairMethod === 'roundrobin' ? 'selected' : '') + '>🔄 Round Robin</option>',
        '<option value="knockout"   ' + (savedPairMethod === 'knockout' ? 'selected' : '') + '>🏆 Knockout</option>'
    ].join('');
    const _sidesOrRoomSize = _speechMode
        ? '<div><label style="display:block;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px">Speakers per Room</label>' +
        '<select id="cr-room-size" style="width:100%;padding:9px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;font-family:inherit">' +
        '<option value="3">3 speakers</option>' +
        '<option value="4" selected>4 speakers</option>' +
        '<option value="5">5 speakers</option>' +
        '<option value="6">6 speakers</option>' +
        '</select></div>'
        : '<div><label style="display:block;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px">Sides</label>' +
        '<select id="cr-sides" style="width:100%;padding:9px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;font-family:inherit" onchange="window._saveDrawPref(\'cr-sides\',this.value)">' +
        '<option value="random"        ' + (savedSideMethod === 'random' ? 'selected' : '') + '>🎲 Random</option>' +
        '<option value="manual"        ' + (savedSideMethod === 'manual' ? 'selected' : '') + '>✋ Manual</option>' +
        '<option value="seed-high-gov" ' + (savedSideMethod === 'seed-high-gov' ? 'selected' : '') + '>🔼 High Seed = Gov</option>' +
        '<option value="seed-low-gov"  ' + (savedSideMethod === 'seed-low-gov' ? 'selected' : '') + '>🔽 Low Seed = Gov</option>' +
        '</select></div>';
    const _replyCheckbox = _speechMode ? '' :
        '<label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px">' +
        '<input type="checkbox" id="cr-disable-reply"> 🚫 No Reply Speeches</label>';

    _injectDrawCSS();
    container.innerHTML = `
    <div class="section">
    <h2>Draw</h2>
        <!-- Grouped controls bar -->
        <div class="draw-controls-bar">
            <div class="draw-controls-left">
                <strong style="font-size:15px;color:#1e293b;white-space:nowrap">${_drawTitle}</strong>
                <span style="font-size:13px;color:#94a3b8">${rounds.length} rounds · ${_resultsLabel}</span>
                <select id="round-filter" onchange="window.displayRounds(); window._saveDrawPref('round-filter',this.value)"
                        style="width:auto;min-width:130px;padding:6px 10px;font-size:13px;border-radius:8px;border:1.5px solid #e2e8f0;background:#f8fafc;font-family:inherit;cursor:pointer">
                    <option value="all" ${savedFilter === 'all' ? 'selected' : ''}>All Rounds</option>
                    <option value="pending" ${savedFilter === 'pending' ? 'selected' : ''}>Pending Results</option>
                    <option value="completed" ${savedFilter === 'completed' ? 'selected' : ''}>Submitted</option>
                    <option value="blinded" ${savedFilter === 'blinded' ? 'selected' : ''}>Blinded</option>
                </select>
                <button id="toggle-team-names-btn" onclick="window._toggleTeamNames()"
                        class="secondary" style="padding:6px 12px;font-size:13px">🔤 Hide Names</button>
            </div>
            <div class="draw-controls-right">
                ${isAdmin ? `<button onclick="window._toggleCreateRound()" id="draw-new-btn"
                        class="primary" style="padding:7px 16px;font-size:13px">➕ New Round</button>` : ''}
            </div>
        </div>

        ${isAdmin ? `
        <!-- Collapsible create round form -->
        <div class="draw-create-panel" id="draw-create-panel">
            <h3 style="margin:0 0 14px;font-size:15px;color:#1e293b">Create Round</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
                <div style="grid-column:1/-1">
                    <label style="display:block;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px">Motion / Topic</label>
                    <input id="cr-motion" placeholder="${_motionPlaceholder}"
                        style="width:100%;padding:9px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px;box-sizing:border-box;font-family:inherit"
                        onkeydown="if(event.key==='Enter') window._submitNewRound()">
                </div>
                <div>
                    <label style="display:block;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px">${_pairingLabel}</label>
                    <select id="cr-pair" style="width:100%;padding:9px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;font-family:inherit"
                            onchange="window._saveDrawPref('cr-pair',this.value)">
                        <option value="random"     ${savedPairMethod === 'random' ? 'selected' : ''}>🎲 Random</option>
                        <option value="power"      ${savedPairMethod === 'power' ? 'selected' : ''} >${_powerLabel}</option>
                        <option value="fold"       ${savedPairMethod === 'fold' ? 'selected' : ''}  >${_foldLabel}</option>
                        ${_extraPairOpts}
                    </select>
                </div>
                ${_sidesOrRoomSize}
                <div style="display:flex;flex-direction:column;justify-content:flex-end;gap:8px">
                    <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px">
                        <input type="checkbox" id="cr-autojudge" checked> Auto-allocate Judges
                    </label>
                    <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px">
                        <input type="checkbox" id="cr-blind"> 🔒 Blind Round
                    </label>
                    ${_replyCheckbox}
                </div>
            </div>
            <div style="display:flex;gap:8px">
                <button onclick="window._submitNewRound()" class="primary" style="padding:9px 22px">🎯 Create Round</button>
                <button onclick="window._toggleCreateRound()" class="secondary" style="padding:9px 16px">Cancel</button>
            </div>
        </div>` : ''}

        <div id="rounds-list"></div>
    </div>`;

    // Expose pref saver on window
    window._saveDrawPref = function (key, val) {
        try {
            const p = JSON.parse(localStorage.getItem('orion_draw_prefs') || '{}');
            p[key] = val;
            localStorage.setItem('orion_draw_prefs', JSON.stringify(p));
        } catch (e) { }
    };

    displayRounds();
}

window._toggleCreateRound = function () {
    const panel = document.getElementById('draw-create-panel');
    if (!panel) return;
    panel.classList.toggle('open');
    const btn = document.getElementById('draw-new-btn');
    if (btn) btn.textContent = panel.classList.contains('open') ? '✕ Cancel' : '➕ New Round';
};

window._submitNewRound = function () {
    const motion = document.getElementById('cr-motion')?.value.trim() || 'Debate Round';
    const method = document.getElementById('cr-pair')?.value || 'random';
    const sideMethod = document.getElementById('cr-sides')?.value || 'random';
    const autoAllocate = document.getElementById('cr-autojudge')?.checked ?? true;
    const blind = document.getElementById('cr-blind')?.checked ?? false;
    const disableReply = document.getElementById('cr-disable-reply')?.checked ?? false;
    createRound({ motion, method, sideMethod, autoAllocate, blind, disableReply });
    // Collapse form after creation
    const panel = document.getElementById('draw-create-panel');
    if (panel) panel.classList.remove('open');
    const btn = document.getElementById('draw-new-btn');
    if (btn) btn.textContent = '➕ New Round';
};

// ============================================================================
// ROUND ROBIN PAIRING FUNCTION
// ============================================================================
function generateRoundRobinPairs(teams, previousRounds = []) {
    if (teams.length < 2) return [];

    // If odd number of teams, we need a "bye" team (but we'll handle by filtering)
    const hasBye = teams.length % 2 !== 0;
    let workingTeams = [...teams];

    // Build a set of existing matchups to avoid
    const existingMatchups = new Set();
    previousRounds.forEach(round => {
        (round.debates || []).forEach(debate => {
            const key = [debate.gov, debate.opp].sort().join('-');
            existingMatchups.add(key);
        });
    });

    // Sort teams by record (wins, then points) for better pairing
    workingTeams.sort((a, b) => (b.wins || 0) - (a.wins || 0) || (b.total || 0) - (a.total || 0));

    // Round robin algorithm - try to create pairs where teams haven't met
    const pairs = [];
    const used = new Set();

    for (let i = 0; i < workingTeams.length; i++) {
        if (used.has(workingTeams[i].id)) continue;

        // Find best opponent: highest-ranked unused team that hasn't met current team
        let bestOpponent = null;
        let bestOpponentIndex = -1;

        for (let j = i + 1; j < workingTeams.length; j++) {
            if (used.has(workingTeams[j].id)) continue;

            const teamA = workingTeams[i];
            const teamB = workingTeams[j];
            const matchupKey = [teamA.id, teamB.id].sort().join('-');

            // If they haven't met before, this is ideal
            if (!existingMatchups.has(matchupKey)) {
                bestOpponent = teamB;
                bestOpponentIndex = j;
                break;
            }

            // Otherwise, remember this as a fallback
            if (!bestOpponent) {
                bestOpponent = teamB;
                bestOpponentIndex = j;
            }
        }

        if (bestOpponent) {
            pairs.push([workingTeams[i], bestOpponent]);
            used.add(workingTeams[i].id);
            used.add(bestOpponent.id);
        }
    }

    return pairs;
}

// ============================================================================
export function createRound(params) {
    const motion = params?.motion ?? document.getElementById('cr-motion')?.value.trim() ?? 'Debate Round';
    const method = params?.method ?? document.getElementById('cr-pair')?.value ?? 'random';
    const sideMethod = params?.sideMethod ?? document.getElementById('cr-sides')?.value ?? 'random';
    const autoAllocate = params?.autoAllocate ?? document.getElementById('cr-autojudge')?.checked ?? true;
    const blind = params?.blind ?? document.getElementById('cr-blind')?.checked ?? false;
    const disableReply = params?.disableReply ?? document.getElementById('cr-disable-reply')?.checked ?? false;
    const roomSize = params?.roomSize ?? parseInt(document.getElementById('cr-room-size')?.value || '4', 10);
    const isKnockout = method === 'knockout';
    const isRoundRobin = method === 'roundrobin';
    const bpMode = isBP();

    const activeTeams = (state.teams || []).filter(t => !t.eliminated);
    const minTeams = bpMode ? 4 : 2;
    if (activeTeams.length < minTeams) {
        showNotification(`Need at least ${minTeams} active teams${bpMode ? ' for BP' : ''}`, 'error');
        return;
    }

    let debates = [];

    // ── BP: group teams into rooms of 4 (OG / OO / CG / CO) ─────────────────
    if (bpMode && !isKnockout) {
        let tc = [...activeTeams];
        if (method === 'power' || method === 'fold') {
            tc.sort((a, b) => (b.wins || 0) - (a.wins || 0) || (b.total || 0) - (a.total || 0));
        } else if (method === 'roundrobin') {
            // try to avoid repeat matchups across all 4 positions
            tc.sort((a, b) => (b.wins || 0) - (a.wins || 0) || (b.total || 0) - (a.total || 0));
        } else {
            tc.sort(() => Math.random() - 0.5);
        }
        const rem = tc.length % 4;
        if (rem !== 0) {
            showNotification(`${rem} team${rem > 1 ? 's' : ''} given a bye (BP needs multiples of 4)`, 'warning');
            tc = tc.slice(0, tc.length - rem);
        }
        for (let i = 0; i < tc.length; i += 4) {
            let [og, oo, cg, co] = tc.slice(i, i + 4);
            // For power/fold: interleave — 1st/3rd as Gov bench, 2nd/4th as Opp bench
            if (method === 'fold') {
                // fold: 1st vs mid-high in same room
                const positions = [tc[i], tc[tc.length - 1 - i / 4 * 2], tc[i + 1], tc[tc.length - 1 - (i / 4 * 2 + 1)]];
                [og, oo, cg, co] = positions;
            }
            debates.push({ format: 'bp', og: og.id, oo: oo.id, cg: cg.id, co: co.id, entered: false, panel: [] });
        }
        if (autoAllocate) allocateJudgesToDebates(debates, false);
        const roundId = state.rounds.length > 0 ? Math.max(...state.rounds.map(r => r.id)) + 1 : 1;
        const rooms = debates.map((_, i) => `Room ${i + 1}`);
        state.rounds.push({ id: roundId, motion, debates, rooms, format: 'bp', type: 'prelim', blinded: blind, sideMethod: 'bp', nextRoundCreated: false });
        saveNow();
        const label = method.charAt(0).toUpperCase() + method.slice(1);
        showNotification(`Round ${roundId} BP (${label}) — ${debates.length} rooms created${blind ? ' [BLINDED]' : ''}`, 'success');
        renderDraw();
        return;
    }

    // ── BP: knockout round (4-team rooms) ────────────────────────────────────
    if (bpMode && isKnockout) {
        let tc = [...activeTeams].sort((a, b) => (b.wins || 0) - (a.wins || 0) || (b.total || 0) - (a.total || 0));
        const rem = tc.length % 4;
        if (rem !== 0) {
            showNotification(`${rem} team${rem > 1 ? 's' : ''} given a bye (BP knockout needs multiples of 4)`, 'warning');
            tc = tc.slice(0, tc.length - rem);
        }
        for (let i = 0; i < tc.length; i += 4) {
            const [og, oo, cg, co] = tc.slice(i, i + 4);
            debates.push({ format: 'bp', og: og.id, oo: oo.id, cg: cg.id, co: co.id, entered: false, panel: [] });
        }
        if (autoAllocate) allocateJudgesToDebates(debates, true);
        const roundId = state.rounds.length > 0 ? Math.max(...state.rounds.map(r => r.id)) + 1 : 1;
        const rooms = debates.map((_, i) => `Room ${i + 1}`);
        state.rounds.push({ id: roundId, motion, debates, rooms, format: 'bp', type: 'knockout', blinded: blind, sideMethod: 'bp', nextRoundCreated: false });
        saveNow();
        showNotification(`Round ${roundId} BP Knockout — ${debates.length} rooms created${blind ? ' [BLINDED]' : ''}`, 'success');
        renderDraw();
        return;
    }

    // ── SPEECH mode: pair individual speakers into rooms ────────────────────
    if (isSpeech()) {
        const allSpks = [];
        (state.teams || []).forEach(team => {
            (team.speakers || []).forEach(spk => {
                if (spk.name) allSpks.push({
                    speakerId: spk.id || null,
                    speakerName: spk.name,
                    teamId: team.id,
                    teamName: team.name,
                    total: spk.substantiveTotal || 0
                });
            });
        });

        if (allSpks.length < roomSize) {
            showNotification('Need at least ' + roomSize + ' registered speakers for a speech round', 'error');
            return;
        }

        let ordered = [...allSpks];
        if (method === 'power') {
            ordered.sort((a, b) => b.total - a.total);
        } else if (method === 'fold') {
            ordered.sort((a, b) => b.total - a.total);
            const n = ordered.length;
            const result = [];
            for (let i = 0; i < Math.ceil(n / 2); i++) {
                result.push(ordered[i]);
                if (n - 1 - i !== i) result.push(ordered[n - 1 - i]);
            }
            ordered = result;
        } else {
            ordered.sort(() => Math.random() - 0.5);
        }

        const rem = ordered.length % roomSize;
        if (rem !== 0) {
            showNotification(rem + ' speaker' + (rem > 1 ? 's' : '') + ' given a bye (need multiples of ' + roomSize + ')', 'warning');
            ordered = ordered.slice(0, ordered.length - rem);
        }

        const speechDebates = [];
        for (let i = 0; i < ordered.length; i += roomSize) {
            speechDebates.push({
                format: 'speech',
                roomSpeakers: ordered.slice(i, i + roomSize),
                entered: false,
                panel: [],
                speechResults: null
            });
        }

        if (autoAllocate) allocateJudgesToDebates(speechDebates, false);

        const roundId = state.rounds.length > 0
            ? Math.max(...state.rounds.map(r => r.id)) + 1 : 1;
        const rooms = speechDebates.map((_, i) => `Room ${i + 1}`);

        state.rounds.push({
            id: roundId,
            motion,
            debates: speechDebates,
            rooms,
            format: 'speech',
            type: 'prelim',
            blinded: blind,
            nextRoundCreated: false,
            roomSize
        });
        saveNow();

        const label = method === 'power' ? 'Power' : method === 'fold' ? 'Balanced' : 'Random';
        showNotification(
            'Round ' + roundId + ' Speech (' + label + ') — ' + speechDebates.length +
            ' room' + (speechDebates.length !== 1 ? 's' : '') + ', ' + ordered.length +
            ' speakers' + (blind ? ' [BLINDED]' : ''),
            'success'
        );
        renderDraw();
        return;
    }

    let pairs = [];

    if (isKnockout) {
        let tc = [...activeTeams].sort((a, b) => (b.wins || 0) - (a.wins || 0) || (b.total || 0) - (a.total || 0));
        if (tc.length % 2 !== 0) tc.pop();
        const half = Math.floor(tc.length / 2);
        const top = tc.slice(0, half);
        const bottom = tc.slice(half).reverse();
        for (let i = 0; i < top.length; i++) pairs.push([top[i], bottom[i]]);
    } else if (isRoundRobin) {
        pairs = generateRoundRobinPairs(activeTeams, state.rounds);
        if (pairs.length === 0) {
            showNotification('Could not generate fresh round robin pairs, using power pairing', 'warning');
            let tc = [...activeTeams].sort((a, b) => (b.wins || 0) - (a.wins || 0) || (b.total || 0) - (a.total || 0));
            if (tc.length % 2 !== 0) tc.pop();
            for (let i = 0; i < tc.length; i += 2) pairs.push([tc[i], tc[i + 1]]);
        }
    } else if (method === 'fold') {
        let tc = [...activeTeams].sort((a, b) => (b.wins || 0) - (a.wins || 0) || (b.total || 0) - (a.total || 0));
        if (tc.length % 2 !== 0) { showNotification(`Odd teams — bye given`, 'warning'); tc.pop(); }
        const mid = Math.floor(tc.length / 2);
        for (let i = 0; i < mid; i++) pairs.push([tc[i], tc[tc.length - 1 - i]]);
    } else if (method === 'power') {
        let tc = [...activeTeams].sort((a, b) => (b.wins || 0) - (a.wins || 0) || (b.total || 0) - (a.total || 0));
        if (tc.length % 2 !== 0) { showNotification(`Odd teams — bye given`, 'warning'); tc.pop(); }
        for (let i = 0; i < tc.length; i += 2) pairs.push([tc[i], tc[i + 1]]);
    } else {
        let tc = [...activeTeams].sort(() => Math.random() - .5);
        if (tc.length % 2 !== 0) { showNotification(`Odd teams — bye given`, 'warning'); tc.pop(); }
        for (let i = 0; i < tc.length; i += 2) pairs.push([tc[i], tc[i + 1]]);
    }

    debates = pairs.map(([tA, tB], idx) => {
        const { gov, opp } = assignSides(tA, tB, sideMethod, idx);
        return { gov, opp, entered: false, panel: [], attendance: { gov: true, opp: true }, sidesPending: sideMethod === 'manual' };
    });

    if (autoAllocate) allocateJudgesToDebates(debates, isKnockout);

    const roundId = state.rounds.length > 0 ? Math.max(...state.rounds.map(r => r.id)) + 1 : 1;
    const rooms = debates.map((_, i) => `Room ${i + 1}`);
    state.rounds.push({ id: roundId, motion, debates, rooms, type: isKnockout ? 'knockout' : 'prelim', blinded: blind, disableReply: disableReply, sideMethod, nextRoundCreated: false });
    saveNow();

    const label = isKnockout ? 'Knockout' : isRoundRobin ? 'Round Robin' : (method || 'random').charAt(0).toUpperCase() + (method || 'random').slice(1);
    showNotification(`Round ${roundId} (${label}) created with ${debates.length} debates${blind ? ' [BLINDED]' : ''}`, 'success');

    renderDraw();   // refresh the draw tab
}


function displayRounds() {
    const list = document.getElementById('rounds-list');
    if (!list) return;

    const filter = document.getElementById('round-filter')?.value || 'all';
    const isJudge = state.auth?.currentUser?.role === 'judge';
    const myJudgeId = isJudge ? String(state.auth?.currentUser?.associatedId ?? '') : null;

    let filteredRounds = state.rounds.map(r => ({ ...r })); // shallow copy so we can filter debates

    if (filter === 'pending') {
        filteredRounds = filteredRounds.filter(r => r.debates.some(d => !d.entered));
    } else if (filter === 'completed') {
        filteredRounds = filteredRounds.filter(r => r.debates.every(d => d.entered));
    } else if (filter === 'blinded') {
        filteredRounds = filteredRounds.filter(r => r.blinded);
    }

    // ── Judge portal: show only the debates this judge is allocated to ────────
    if (isJudge && myJudgeId) {
        filteredRounds = filteredRounds
            .map(r => ({
                ...r,
                debates: (r.debates || []).filter(d =>
                    (d.panel || []).some(p => String(p.id) === myJudgeId)
                )
            }))
            .filter(r => r.debates.length > 0);

        if (filteredRounds.length === 0) {
            list.innerHTML = `
            <div style="text-align:center;padding:60px 20px;color:#64748b">
                <div style="font-size:48px;margin-bottom:12px">📋</div>
                <h3 style="margin:0 0 8px;color:#1e293b">No Assignments Yet</h3>
                <p style="margin:0">You have not been allocated to any rounds yet. Check back after the draw is published.</p>
            </div>`;
            return;
        }
    }

    if (filteredRounds.length === 0) {
        list.innerHTML = '<p style="color: #64748b; text-align: center; padding: 40px;">No rounds match the current filter</p>';
        return;
    }

    const previousMeetings = getPreviousMeetings();

    // Group rounds by bracket for knockout rounds
    const knockoutRounds = filteredRounds.filter(r => r.type === 'knockout');
    const prelimRounds = filteredRounds.filter(r => r.type !== 'knockout').slice().reverse();

    let html = '';

    // ── Judge banner ──────────────────────────────────────────────────────────
    if (isJudge && myJudgeId) {
        const myJudge = (state.judges || []).find(j => String(j.id) === myJudgeId);
        html += `
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 18px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
            <span style="font-size:28px">⚖️</span>
            <div>
                <div style="font-weight:700;color:#1e40af;font-size:15px">Welcome, ${escapeHTML(myJudge?.name || 'Judge')}</div>
                <div style="font-size:13px;color:#3b82f6">Showing only your assigned rooms. Submit ballots using the button in each room.</div>
            </div>
        </div>`;
    }

    // Display prelim rounds — newest first
    prelimRounds.forEach(round => {
        html += renderRoundCard(round, state.rounds.findIndex(r => r.id === round.id), previousMeetings);
    });

    // Display knockout rounds in bracket format
    if (knockoutRounds.length > 0) {
        html += renderKnockoutBracket(knockoutRounds);
    }

    list.innerHTML = html;
}


function renderRoundCard(round, actualRoundIdx, previousMeetings) {
    const entered = round.debates.filter(d => d.entered).length;
    const total = round.debates.length;
    const isBlinded = round.blinded || false;
    const isNoReply = round.disableReply || false;
    const isAdmin = state.auth?.currentUser?.role === 'admin';
    const allDone = entered === total && total > 0;
    const badgeStyle = allDone
        ? 'background:#d1fae5;color:#065f46'
        : 'background:#fef3c7;color:#92400e';

    return `
    <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:18px;margin-bottom:18px;box-shadow:0 1px 4px rgba(0,0,0,.06)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:14px">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <strong style="font-size:16px;color:#1e293b">Round ${round.id}</strong>
                ${round.type === 'knockout' ? '<span style="background:#fee2e2;color:#991b1b;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700">🏆 KNOCKOUT</span>' : ''}
                ${isBlinded ? '<span style="background:#f1f5f9;color:#475569;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700">🔒 BLIND</span>' : ''}
                ${isNoReply ? '<span style="background:#fff7ed;color:#c2410c;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700">🚫 NO REPLY</span>' : ''}
                <span style="font-size:13px;color:#64748b">${escapeHTML(round.motion || '')}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span style="${badgeStyle};padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700">${entered}/${total} results</span>
                ${isAdmin ? `<button onclick="window.showEditMotionModal(${actualRoundIdx})" class="secondary" style="padding:5px 10px;font-size:12px">✏️ Motion</button>` : ''}
                ${isAdmin && round.type !== 'knockout' ? `
                <button onclick="window.toggleBlindRound(${actualRoundIdx});window.displayRounds()" class="secondary" style="padding:5px 10px;font-size:12px">
                    ${isBlinded ? '👁️ Unblind' : '🔒 Blind'}
                </button>` : ''}
                ${isAdmin ? `
                <button onclick="window.redrawRound(${actualRoundIdx})"
                        title="${entered > 0 ? 'Cannot redraw — results already entered' : 'Shuffle pairings and re-allocate judges'}"
                        ${entered > 0 ? 'disabled' : ''}
                        style="display:inline-flex;align-items:center;gap:5px;padding:6px 14px;font-size:13px;font-weight:700;border-radius:8px;border:none;cursor:${entered > 0 ? 'not-allowed' : 'pointer'};background:${entered > 0 ? '#e2e8f0' : '#f59e0b'};color:${entered > 0 ? '#94a3b8' : 'white'};box-shadow:${entered > 0 ? 'none' : '0 2px 6px rgba(245,158,11,0.4)'};opacity:${entered > 0 ? '0.55' : '1'};transition:all .15s;">
                    🔀 Redraw
                </button>
                <button onclick="window.adminDeleteRound(${round.id})" class="danger" style="padding:6px 10px;font-size:13px">🗑️</button>
                ` : ''}
            </div>
        </div>
        <div style="display:grid;gap:10px">
            ${round.debates.map((debate, i) => renderDebateCard(round, debate, actualRoundIdx, i, previousMeetings)).join('')}
        </div>
    </div>`;
}


function renderKnockoutBracket(rounds) {
    // Sort rounds by ID
    const sortedRounds = [...rounds].sort((a, b) => a.id - b.id);

    // Get the latest round
    const latestRound = sortedRounds[sortedRounds.length - 1];

    // If there's only one round, generate the full bracket structure
    if (sortedRounds.length === 1) {
        return renderFullKnockoutBracket(sortedRounds[0]);
    }

    // Multiple rounds - group debates by round
    const roundsByStage = sortedRounds.map(round => ({
        roundId: round.id,
        name: getKnockoutStageName(round.debates.length),
        debates: round.debates,
        motion: round.motion,
        isComplete: round.debates.every(d => d.entered),
        isLatest: round.id === latestRound.id
    }));

    // Generate the complete bracket structure
    let bracketHtml = `
        <div class="section">
            <h2 style="margin-bottom: 20px;">🏆 Knockout Bracket</h2>
            <div class="knockout-bracket">
    `;

    // Generate all possible rounds from current number of debates down to final
    const totalDebates = latestRound.debates.length;
    const allStages = generateAllBracketStages(totalDebates);

    allStages.forEach(stage => {
        const existingRound = roundsByStage.find(r => r.name === stage.name);

        bracketHtml += `
            <div class="bracket-round">
                <h3 style="text-align: center; margin-bottom: 15px; ${existingRound?.isLatest ? 'color: #2563eb; font-weight: 700;' : ''}">
                    ${stage.name}
                    ${existingRound?.isLatest ? ' (Current)' : ''}
                </h3>
        `;

        if (existingRound) {
            // Show actual debates from existing round
            existingRound.debates.forEach(debate => {
                bracketHtml += renderBracketMatch(debate);
            });

            // Add "Next Round" button if this round is complete and next doesn't exist
            if (existingRound.isComplete && !roundsByStage.find(r => r.name === stage.nextStage)) {
                bracketHtml += `
                    <div style="margin-top: 20px; text-align: center;">
                        <button onclick="window.createNextKnockoutRound(${existingRound.roundId})" 
                                class="primary" 
                                style="padding: 10px 16px; border-radius: 8px; font-size: 13px; background: #7c3aed;">
                            ➡️ Advance to ${stage.nextStage || 'Next Round'}
                        </button>
                    </div>
                `;
            }
        } else {
            // Show placeholder brackets
            for (let i = 0; i < stage.numDebates; i++) {
                bracketHtml += `
                    <div class="bracket-match" style="opacity: 0.5;">
                        <div style="padding: 12px; color: #94a3b8; text-align: center;">
                            TBD
                        </div>
                        <div style="border-top: 1px solid #e2e8f0; margin: 4px 0;"></div>
                        <div style="padding: 12px; color: #94a3b8; text-align: center;">
                            TBD
                        </div>
                    </div>
                `;
            }
        }

        bracketHtml += `</div>`;
    });

    bracketHtml += `</div></div>`;
    return bracketHtml;
}

function renderFullKnockoutBracket(currentRound) {
    // Get all teams in the current round with their seeds
    const teams = [];
    currentRound.debates.forEach(debate => {
        const gov = state.teams.find(t => t.id === debate.gov);
        const opp = state.teams.find(t => t.id === debate.opp);
        if (gov) teams.push({ team: gov, seed: gov.seed || 999, id: gov.id });
        if (opp) teams.push({ team: opp, seed: opp.seed || 999, id: opp.id });
    });

    // Sort by seed
    teams.sort((a, b) => a.seed - b.seed);

    // Generate all bracket stages
    const stages = generateAllBracketStages(currentRound.debates.length);

    // Get all knockout rounds
    const allKnockoutRounds = state.rounds.filter(r => r.type === 'knockout');

    let html = `
        <div class="section">
            <h2 style="margin-bottom: 20px;">🏆 Knockout Bracket</h2>
            <div class="knockout-bracket">
    `;

    stages.forEach((stage, index) => {
        const isCurrentRound = index === 0;
        const existingRound = allKnockoutRounds.find(r => {
            if (isCurrentRound) return r.id === currentRound.id;
            return r.debates?.length === stage.numDebates;
        });

        html += `
            <div class="bracket-round">
                <h3 style="text-align: center; margin-bottom: 15px; ${isCurrentRound ? 'color: #2563eb; font-weight: 700;' : ''}">
                    ${stage.name}
                    ${isCurrentRound ? ' (Current)' : ''}
                </h3>
        `;

        if (existingRound) {
            // Show existing debates
            existingRound.debates.forEach(debate => {
                html += renderBracketMatch(debate);
            });
        } else {
            // Show seeded placeholders
            const debatesNeeded = stage.numDebates;
            for (let i = 0; i < debatesNeeded; i++) {
                const team1 = teams[i * 2]?.team;
                const team2 = teams[i * 2 + 1]?.team;

                html += `
                    <div class="bracket-match" style="opacity: ${team1 && team2 ? '1' : '0.5'};">
                        <div style="padding: 12px; color: ${team1 ? '#1e293b' : '#94a3b8'}; text-align: center; font-weight: ${team1 ? '600' : '400'};">
                            ${team1 ? teamLabel(team1) : `Seed #${i * 2 + 1}`}
                        </div>
                        <div style="border-top: 1px solid #e2e8f0; margin: 4px 0;"></div>
                        <div style="padding: 12px; color: ${team2 ? '#1e293b' : '#94a3b8'}; text-align: center; font-weight: ${team2 ? '600' : '400'};">
                            ${team2 ? teamLabel(team2) : `Seed #${i * 2 + 2}`}
                        </div>
                    </div>
                `;
            }
        }

        html += `</div>`;
    });

    html += `</div>`;

    // Add "Create Next Round" button if current round is complete and next doesn't exist
    if (currentRound.debates.every(d => d.entered) && !currentRound.nextRoundCreated) {
        html += `
            <div style="text-align: center; margin-top: 30px;">
                <button onclick="window.createNextKnockoutRound(${currentRound.id})" 
                        class="primary" 
                        style="padding: 14px 32px; border-radius: 8px; font-size: 16px; background: #7c3aed;">
                    ➡️ Create ${getNextStageName(currentRound.debates.length)}
                </button>
            </div>
        `;
    }

    html += `</div>`;
    return html;
}

function renderBracketMatch(debate) {
    const gov = state.teams.find(t => t.id === debate.gov);
    const opp = state.teams.find(t => t.id === debate.opp);

    // New/empty room — teams not yet assigned. Render a placeholder card.
    if (!gov || !opp) {
        const isAdmin = state.auth?.currentUser?.role === 'admin';
        const roomLabel = round.rooms?.[debateIdx] || `Room ${debateIdx + 1}`;
        return `
        <div class="draw-room pending-partial" style="background:white;border-radius:10px;border-left:4px solid #94a3b8;padding:14px;margin-bottom:10px;opacity:0.85;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <strong style="font-size:14px;color:#1e293b;">${escapeHTML(roomLabel)}</strong>
                    ${isAdmin ? `
                        <button onclick="window.renameRoom(${roundIdx},${debateIdx})" style="background:none;border:none;cursor:pointer;padding:0 4px;font-size:13px;color:#94a3b8;" title="Rename room">✏️</button>
                        <button onclick="window.deleteDebate(${roundIdx},${debateIdx})" style="background:none;border:none;cursor:pointer;padding:0 4px;font-size:13px;color:#94a3b8;" title="Delete room">🗑️</button>
                        <button onclick="window.addDebate(${roundIdx},${debateIdx})" style="background:none;border:none;cursor:pointer;padding:0 4px;font-size:13px;color:#94a3b8;" title="Add room after this">➕</button>
                    ` : ''}
                    <span style="font-size:12px;color:#94a3b8;font-weight:600;">⚪ Unassigned</span>
                </div>
                ${isAdmin ? `<button onclick="window.showMoveTeamModal(${roundIdx},${debateIdx})" class="secondary" style="padding:4px 12px;font-size:12px;">🔀 Assign Teams</button>` : ''}
            </div>
            <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;">
                <div style="padding:14px;border-radius:8px;border:2px dashed #cbd5e1;text-align:center;color:#94a3b8;font-size:13px;">${gov ? escapeHTML(gov.name) : 'TBD'}</div>
                <div style="font-size:14px;font-weight:700;color:#cbd5e1;">vs</div>
                <div style="padding:14px;border-radius:8px;border:2px dashed #cbd5e1;text-align:center;color:#94a3b8;font-size:13px;">${opp ? escapeHTML(opp.name) : 'TBD'}</div>
            </div>
        </div>`;
    }

    const govWon = debate.entered && debate.govResults?.total > debate.oppResults?.total;
    const oppWon = debate.entered && debate.oppResults?.total > debate.govResults?.total;

    return `
        <div class="bracket-match ${debate.entered ? 'bracket-winner' : ''}">
            <div style="font-weight: ${govWon ? '700' : '400'}; color: ${govWon ? '#10b981' : '#1e293b'}; padding: 8px; display: flex; justify-content: space-between; background: ${govWon ? '#f0fdf4' : 'transparent'};">
                <span class="team-name">${teamLabel(gov)}</span>
                ${govWon ? '<span>🏆</span>' : ''}
            </div>
            <div style="border-top: 1px solid #e2e8f0; margin: 0 8px;"></div>
            <div style="font-weight: ${oppWon ? '700' : '400'}; color: ${oppWon ? '#10b981' : '#1e293b'}; padding: 8px; display: flex; justify-content: space-between; background: ${oppWon ? '#f0fdf4' : 'transparent'};">
                <span class="team-name">${teamLabel(opp)}</span>
                ${oppWon ? '<span>🏆</span>' : ''}
            </div>
            ${debate.entered ? `
                <div style="margin-top: 8px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px dashed #e2e8f0; padding-top: 8px;">
                    ${Math.max(govWon ? debate.govResults?.total : debate.oppResults?.total,
        oppWon ? debate.oppResults?.total : debate.govResults?.total).toFixed(1)} - 
                    ${Math.min(govWon ? debate.oppResults?.total : debate.govResults?.total,
            oppWon ? debate.govResults?.total : debate.oppResults?.total).toFixed(1)}
                </div>
            ` : `
                <div style="margin-top: 8px; font-size: 11px; color: #f59e0b; text-align: center;">
                    ⏳ Results Pending
                </div>
            `}
        </div>
    `;
}

function generateAllBracketStages(startingDebates) {
    const stages = [];
    let numDebates = startingDebates;
    let roundNames = [];

    // Build round names from current down to final
    while (numDebates >= 1) {
        roundNames.push({
            name: getKnockoutStageName(numDebates),
            numDebates: numDebates,
            nextStage: numDebates > 1 ? getKnockoutStageName(numDebates / 2) : null
        });
        numDebates = numDebates / 2;
        if (numDebates < 1) break;
    }

    return roundNames;
}

function getKnockoutStageName(numDebates) {
    const stages = {
        1: 'Final',
        2: 'Semi-Finals',
        4: 'Quarter-Finals',
        8: 'Round of 16',
        16: 'Round of 32',
        32: 'Round of 64',
        64: 'Round of 128'
    };
    return stages[numDebates] || `Round of ${numDebates * 2}`;
}

function getNextStageName(currentNumDebates) {
    const nextNum = currentNumDebates / 2;
    return getKnockoutStageName(nextNum);
}


// ============================================================================
// BP DEBATE CARD — 4-team room (OG / OO / CG / CO)
// ============================================================================
function renderBPDebateCard(round, debate, roundIdx, debateIdx) {
    const positions = [
        { key: 'og', label: 'OG', color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
        { key: 'oo', label: 'OO', color: '#be185d', bg: '#fdf2f8', border: '#fbcfe8' },
        { key: 'cg', label: 'CG', color: '#065f46', bg: '#f0fdf4', border: '#86efac' },
        { key: 'co', label: 'CO', color: '#7c3aed', bg: '#faf5ff', border: '#e9d5ff' },
    ];

    const isAdmin = state.auth?.currentUser?.role === 'admin';
    const isJudge = state.auth?.currentUser?.role === 'judge';
    const myJudgeId = isJudge ? String(state.auth?.currentUser?.associatedId ?? '') : null;
    const isMyRoom = isJudge && (debate.panel || []).some(p => String(p.id) === myJudgeId);
    const isBlinded = round.blinded || false;
    const room = round.rooms?.[debateIdx] || `Room ${debateIdx + 1}`;

    // Build team cells
    const teamCells = positions.map(pos => {
        const team = state.teams.find(t => t.id === debate[pos.key]);
        if (!team) return `<div style="padding:10px;background:#f8fafc;border-radius:8px;border:1px dashed #cbd5e1;text-align:center;color:#94a3b8;font-size:12px;">TBD</div>`;
        const rank = debate.entered && debate.ranks ? debate.ranks[pos.key] : null;
        const pts = rank != null ? [3, 2, 1, 0][rank - 1] : null;
        const rankColors = ['#f59e0b', '#94a3b8', '#b45309', '#64748b'];
        const rankLabels = ['🥇 1st', '🥈 2nd', '🥉 3rd', '4th'];
        return `
        <div style="padding:10px;background:${pos.bg};border-radius:8px;border:1.5px solid ${pos.border};text-align:center;">
            <div style="font-size:10px;font-weight:700;color:${pos.color};text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">${pos.label}</div>
            <div style="font-weight:700;color:#1e293b;font-size:13px;word-break:break-word;">${escapeHTML(team.name)}</div>
            ${rank != null && !isBlinded ? `
                <div style="margin-top:6px;font-size:12px;font-weight:700;color:${rankColors[rank - 1]}">${rankLabels[rank - 1]}</div>
                <div style="font-size:11px;color:#64748b;">${pts}pts · ${debate[pos.key + 'Score']?.toFixed(1) || '—'} spk</div>
            ` : ''}
        </div>`;
    }).join('');

    const judgeNames = (debate.panel || []).map(p => {
        const j = (state.judges || []).find(j => j.id == p.id);
        return j ? escapeHTML(j.name) : '';
    }).filter(Boolean).join(', ');

    const statusDot = debate.entered ? '#10b981' : (debate.panel?.length ? '#f59e0b' : '#ef4444');
    const statusLabel = debate.entered ? '✅ Done' : '⏳ Pending';

    return `
    <div class="draw-room ${debate.entered ? 'done' : 'pending-partial'}" style="background:white;border-radius:10px;border-left:4px solid ${statusDot};padding:14px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <strong style="font-size:14px;color:#1e293b;">${escapeHTML(room)}</strong>
                ${isAdmin ? `<button onclick="window.renameRoom(${roundIdx},${debateIdx})" style="background:none;border:none;cursor:pointer;padding:0 4px;font-size:13px;color:#94a3b8;line-height:1" title="Rename room">✏️</button><button onclick="window.deleteDebate(${roundIdx},${debateIdx})" style="background:none;border:none;cursor:pointer;padding:0 4px;font-size:13px;color:#94a3b8;line-height:1" title="Add room">🗑️</button>
                <button onclick="window.addDebate(${roundIdx},${debateIdx})" style="background:none;border:none;cursor:pointer;padding:0 4px;font-size:13px;color:#94a3b8;line-height:1" title="Delete room">✏️✏️✏️</button>` : ''}
                
                <span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">BP</span>
                <span style="font-size:12px;font-weight:600;color:${debate.entered ? '#10b981' : '#f59e0b'}">${statusLabel}</span>
                ${_judgePillHtml(debate)}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${!debate.entered && isAdmin ? `
                    <button onclick="window.showEnterResults(${roundIdx},${debateIdx})" class="primary" style="padding:4px 12px;font-size:12px;">📝 Results</button>
                ` : !debate.entered && isMyRoom ? `
                    <button onclick="window.showEnterResults(${roundIdx},${debateIdx})" class="primary" style="padding:4px 12px;font-size:12px;background:#7c3aed">📝 Submit Ballot</button>
                ` : debate.entered && !isBlinded ? `
                    ${isAdmin ? `<button onclick="window.editResults(${roundIdx},${debateIdx})" class="secondary" style="padding:4px 10px;font-size:12px;">✏️ Edit</button>` : ''}
                ` : ''}
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
            ${teamCells}
        </div>
        <!-- Judge names now shown in header pill above -->
    </div>`;
}

function renderDebateCard(round, debate, roundIdx, debateIdx, previousMeetings) {
    // Dispatch to BP card if this is a BP debate
    if (debate.format === 'bp') return renderBPDebateCard(round, debate, roundIdx, debateIdx);
    if (debate.format === 'speech') return renderSpeechDebateCard(round, debate, roundIdx, debateIdx);

    const gov = state.teams.find(t => t.id === debate.gov);
    const opp = state.teams.find(t => t.id === debate.opp);
    // New/empty room — teams not yet assigned. Render a placeholder card.
    if (!gov || !opp) {
        const isAdmin = state.auth?.currentUser?.role === 'admin';
        const roomLabel = round.rooms?.[debateIdx] || `Room ${debateIdx + 1}`;
        return `
        <div class="draw-room pending-partial" style="background:white;border-radius:10px;border-left:4px solid #94a3b8;padding:14px;margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <strong style="font-size:14px;color:#1e293b;">${escapeHTML(roomLabel)}</strong>
                    ${isAdmin ? `
                        <button onclick="window.renameRoom(${roundIdx},${debateIdx})" style="background:none;border:none;cursor:pointer;padding:0 4px;font-size:13px;color:#94a3b8;" title="Rename room">✏️</button>
                        <button onclick="window.deleteDebate(${roundIdx},${debateIdx})" style="background:none;border:none;cursor:pointer;padding:0 4px;font-size:13px;color:#94a3b8;" title="Delete room">🗑️</button>
                        <button onclick="window.addDebate(${roundIdx},${debateIdx})" style="background:none;border:none;cursor:pointer;padding:0 4px;font-size:13px;color:#94a3b8;" title="Add room after this">➕</button>
                    ` : ''}
                    <span style="font-size:12px;color:#94a3b8;font-weight:600;">⚪ Unassigned</span>
                </div>
                ${isAdmin ? `<button onclick="window.showMoveTeamModal(${roundIdx},${debateIdx})" class="secondary" style="padding:4px 12px;font-size:12px;">🔀 Assign Teams</button>` : ''}
            </div>
            <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;">
                <div style="padding:14px;border-radius:8px;border:2px dashed #cbd5e1;text-align:center;color:#94a3b8;font-size:13px;">${gov ? escapeHTML(gov.name) : 'TBD'}</div>
                <div style="font-size:14px;font-weight:700;color:#cbd5e1;">vs</div>
                <div style="padding:14px;border-radius:8px;border:2px dashed #cbd5e1;text-align:center;color:#94a3b8;font-size:13px;">${opp ? escapeHTML(opp.name) : 'TBD'}</div>
            </div>
        </div>`;
    }

    const isAdmin = state.auth?.currentUser?.role === 'admin';
    const isJudge = state.auth?.currentUser?.role === 'judge';
    const myJudgeId = isJudge ? String(state.auth?.currentUser?.associatedId ?? '') : null;
    const isMyRoom = isJudge && (debate.panel || []).some(p => String(p.id) === myJudgeId);
    const isBlinded = round.blinded || false;
    const govPresent = debate.attendance?.gov !== false;
    const oppPresent = debate.attendance?.opp !== false;
    const room = round.rooms?.[debateIdx] || `Room ${debateIdx + 1}`;

    // Judges always see real team names; admin respects the hide-toggle
    const govLabel = (isJudge && !isAdmin) ? escapeHTML(gov.name) : teamLabel(gov);
    const oppLabel = (isJudge && !isAdmin) ? escapeHTML(opp.name) : teamLabel(opp);

    // Rematch detection — count only rounds that came BEFORE this one (lower id)
    // so round 2 can never show "3rd meeting" due to future pairings being included
    const priorMeetings = (state.rounds || []).filter(r => r.id < round.id).reduce((count, r) => {
        const met = (r.debates || []).some(d =>
            (d.gov === debate.gov && d.opp === debate.opp) ||
            (d.gov === debate.opp && d.opp === debate.gov)
        );
        return count + (met ? 1 : 0);
    }, 0);
    const isRepeat = priorMeetings > 0;
    const meetingNum = priorMeetings + 1; // 2 = "2nd meeting", 3 = "3rd meeting"
    const meetingOrd = meetingNum === 2 ? '2nd' : meetingNum === 3 ? '3rd' : meetingNum + 'th';

    // Room status class
    let roomClass = 'pending-partial';
    if (debate.entered) roomClass = 'done';
    else if (!debate.panel || debate.panel.length === 0) roomClass = 'no-judges';

    // ── Inline judge zone ────────────────────────────────────────────────
    const availableJudges = (state.judges || []).filter(j => {
        if (debate.panel?.some(p => p.id == j.id)) return false; // already in panel
        return true;
    });
    const freeJudges = availableJudges.filter(j => {
        // not assigned to any other debate in this round
        const inOther = round.debates.some((d, di) => di !== debateIdx && (d.panel || []).some(p => p.id == j.id));
        return !inOther;
    });
    const otherJudges = availableJudges.filter(j => {
        const inOther = round.debates.some((d, di) => di !== debateIdx && (d.panel || []).some(p => p.id == j.id));
        return inOther;
    });

    const judgeChips = (debate.panel || []).map(p => {
        const j = (state.judges || []).find(j => j.id == p.id);
        if (!j) return '';
        const conflict = hasConflict(j.id, debate.gov, debate.opp);
        return `<span class="dnd-judge-chip ${conflict ? 'style="border-color:#f59e0b;background:#fffbeb"' : ''}"
                    ${!debate.entered && isAdmin ? `draggable="true"
                    ondragstart="window.dndJudgeDragStart(event,'${j.id}',${roundIdx},${debateIdx})"
                    ondragend="window.dndDragEnd(event)"` : ''}>
            <span class="chip-role ${p.role === 'chair' ? 'chair' : ''}">${p.role}</span>
            ${escapeHTML(j.name)}${conflict ? ' ⚠️' : ''}
            ${!debate.entered && isAdmin ? `<button class="chip-remove" onclick="window.removeJudgeFromPanel(${roundIdx},${debateIdx},'${j.id}')" title="Remove">×</button>` : ''}
        </span>`;
    }).join('');

    // Build judge add dropdown
    const addJudgeDropdown = (!debate.entered && isAdmin && availableJudges.length > 0) ? `
        <select class="judge-add-select"
                onchange="if(this.value){window.addJudgeToPanel(${roundIdx},${debateIdx},this.value);this.value=''}"
                title="Add judge to this room">
            <option value="">+ Add Judge</option>
            ${freeJudges.length ? `<optgroup label="Available">
                ${freeJudges.map(j => {
        const c = hasConflict(j.id, debate.gov, debate.opp);
        return `<option value="${j.id}" ${c ? 'style="color:#ef4444"' : ''}>${escapeHTML(j.name)} (${j.role})${c ? ' ⚠️' : ''}</option>`;
    }).join('')}
            </optgroup>` : ''}
            ${otherJudges.length ? `<optgroup label="In other rooms">
                ${otherJudges.map(j => {
        const c = hasConflict(j.id, debate.gov, debate.opp);
        return `<option value="${j.id}" ${c ? 'style="color:#ef4444"' : ''}>${escapeHTML(j.name)} (${j.role})${c ? ' ⚠️' : ''}</option>`;
    }).join('')}
            </optgroup>` : ''}
        </select>` : '';

    return `
    <div class="draw-room ${roomClass}">
        <!-- Room header row -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <strong style="font-size:14px;color:#1e293b">${escapeHTML(room)}</strong>
                ${isAdmin ? `<button onclick="window.renameRoom(${roundIdx},${debateIdx})" style="background:none;border:none;cursor:pointer;padding:0 4px;font-size:13px;color:#94a3b8;line-height:1" title="Rename room">✏️</button><button onclick="window.deleteDebate(${roundIdx},${debateIdx})" style="background:none;border:none;cursor:pointer;padding:0 4px;font-size:13px;color:#94a3b8;line-height:1" title="Delete room">🗑️</button>
                <button onclick="window.addDebate(${roundIdx},${debateIdx})" style="background:none;border:none;cursor:pointer;padding:0 4px;font-size:13px;color:#94a3b8;line-height:1" title="Delete room">✏️</button>` : ''}
                ${isRepeat ? `<span style="background:#f97316;color:white;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:700;box-shadow:0 1px 4px rgba(249,115,22,0.4)">🔄 ${meetingOrd} meeting</span>` : ''}
                ${!govPresent || !oppPresent ? '<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">⚠️ Absent</span>' : ''}
                ${debate.sidesPending ? '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">✋ Sides Pending</span>' : ''}
                ${debate.entered ? '<span style="color:#10b981;font-size:12px;font-weight:600">✅ Done</span>' : '<span style="color:#f59e0b;font-size:12px;font-weight:600">⏳ Pending</span>'}
                <!-- Judge allocation pill — always visible -->
                ${_judgePillHtml(debate)}
            </div>
            <!-- Action buttons - compact row -->
            <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${!debate.entered && isAdmin ? `
                <button onclick="window.swapTeams(${roundIdx},${debateIdx})" class="secondary" style="padding:4px 10px;font-size:12px" title="Swap sides">⇄</button>
                <button onclick="window.showMoveTeamModal(${roundIdx},${debateIdx})" class="secondary" style="padding:4px 10px;font-size:12px" title="Move team to another room">↔</button>
                <button onclick="window.copyRoomURL(${roundIdx},${debateIdx})" class="secondary" style="padding:4px 10px;font-size:12px" title="Copy room link">🔗</button>
                <button onclick="window.showEnterResults(${roundIdx},${debateIdx})" class="primary" style="padding:4px 12px;font-size:12px"
                        ${!govPresent || !oppPresent ? 'disabled' : ''}>📝 Results</button>
                ` : !debate.entered && isMyRoom ? `
                <button onclick="window.showEnterResults(${roundIdx},${debateIdx})" class="primary" style="padding:4px 12px;font-size:12px;background:#7c3aed"
                        ${!govPresent || !oppPresent ? 'disabled title="Both teams must be present"' : ''}>📝 Submit Ballot</button>
                ` : debate.entered && !isBlinded ? `
                <button onclick="window.viewDebateDetails(${roundIdx},${debateIdx})" class="secondary" style="padding:4px 10px;font-size:12px">📊 Details</button>
                ${isAdmin ? `<button onclick="window.editResults(${roundIdx},${debateIdx})" class="secondary" style="padding:4px 10px;font-size:12px">✏️ Edit</button>` : ''}
                ` : ''}
            </div>
        </div>

        <!-- Teams row -->
        <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;margin-bottom:10px">
            <!-- Government -->
            <div class="${!debate.entered && isAdmin ? 'dnd-team-zone dnd-team-chip' : ''}"
                 data-zone-type="team" data-zone-side="gov"
                 data-round="${roundIdx}" data-debate="${debateIdx}"
                 ${!debate.entered && isAdmin ? `draggable="true"
                 ondragstart="window.dndTeamDragStart(event,${roundIdx},${debateIdx},'gov')"
                 ondragend="window.dndDragEnd(event)"
                 ondragover="window.dndTeamDragOver(event,${roundIdx},${debateIdx},'gov')"
                 ondragleave="window.dndDragLeave(event)"
                 ondrop="window.dndTeamDrop(event,${roundIdx},${debateIdx},'gov')"` : ''}
                 style="text-align:center;padding:10px;background:${debate.entered && debate.govResults?.total > debate.oppResults?.total ? '#d1fae5' : govPresent ? 'white' : '#fee2e2'};border-radius:8px;border:1px solid ${!govPresent ? '#fca5a5' : '#e2e8f0'}">
                <div style="display:flex;justify-content:center;align-items:center;gap:6px">
                    <span style="font-size:10px;color:#1e40af;font-weight:700;background:#dbeafe;padding:1px 6px;border-radius:8px">GOV</span>
                    <strong style="font-size:14px;color:#1e293b">${govLabel}</strong>
                    ${!debate.entered && !isBlinded && isAdmin ? `
                    <button onclick="window.toggleAttendance(${roundIdx},${debateIdx},'gov')"
                            style="padding:1px 6px;font-size:11px;border-radius:4px;border:1px solid #cbd5e1;background:white;cursor:pointer"
                            title="${govPresent ? 'Mark absent' : 'Mark present'}">${govPresent ? '✓' : '✗'}</button>` : ''}
                </div>
                <div style="font-size:11px;color:#64748b;margin-top:2px">${(_hideTeamNames && !isJudge) ? '' : (gov.code || '')}</div>
                ${debate.entered && !isBlinded ? `<div style="font-size:17px;font-weight:700;color:#1e293b;margin-top:4px">${debate.govResults?.total?.toFixed(1) || '?'}</div>` : ''}
                ${debate.entered && debate.govResults?.total > debate.oppResults?.total ? '<div style="font-size:11px;color:#10b981;margin-top:2px">🏆 Winner</div>' : ''}
                ${!debate.entered && isAdmin ? '<div style="font-size:10px;color:#94a3b8;margin-top:3px">⠿ drag</div>' : ''}
            </div>

            <div style="text-align:center;font-weight:700;color:#94a3b8;font-size:13px">VS</div>

            <!-- Opposition -->
            <div class="${!debate.entered && isAdmin ? 'dnd-team-zone dnd-team-chip' : ''}"
                 data-zone-type="team" data-zone-side="opp"
                 data-round="${roundIdx}" data-debate="${debateIdx}"
                 ${!debate.entered && isAdmin ? `draggable="true"
                 ondragstart="window.dndTeamDragStart(event,${roundIdx},${debateIdx},'opp')"
                 ondragend="window.dndDragEnd(event)"
                 ondragover="window.dndTeamDragOver(event,${roundIdx},${debateIdx},'opp')"
                 ondragleave="window.dndDragLeave(event)"
                 ondrop="window.dndTeamDrop(event,${roundIdx},${debateIdx},'opp')"` : ''}
                 style="text-align:center;padding:10px;background:${debate.entered && debate.oppResults?.total > debate.govResults?.total ? '#d1fae5' : oppPresent ? 'white' : '#fee2e2'};border-radius:8px;border:1px solid ${!oppPresent ? '#fca5a5' : '#e2e8f0'}">
                <div style="display:flex;justify-content:center;align-items:center;gap:6px">
                    <span style="font-size:10px;color:#be185d;font-weight:700;background:#fce7f3;padding:1px 6px;border-radius:8px">OPP</span>
                    <strong style="font-size:14px;color:#1e293b">${oppLabel}</strong>
                    ${!debate.entered && !isBlinded && isAdmin ? `
                    <button onclick="window.toggleAttendance(${roundIdx},${debateIdx},'opp')"
                            style="padding:1px 6px;font-size:11px;border-radius:4px;border:1px solid #cbd5e1;background:white;cursor:pointer"
                            title="${oppPresent ? 'Mark absent' : 'Mark present'}">${oppPresent ? '✓' : '✗'}</button>` : ''}
                </div>
                <div style="font-size:11px;color:#64748b;margin-top:2px">${(_hideTeamNames && !isJudge) ? '' : (opp.code || '')}</div>
                ${debate.entered && !isBlinded ? `<div style="font-size:17px;font-weight:700;color:#1e293b;margin-top:4px">${debate.oppResults?.total?.toFixed(1) || '?'}</div>` : ''}
                ${debate.entered && debate.oppResults?.total > debate.govResults?.total ? '<div style="font-size:11px;color:#10b981;margin-top:2px">🏆 Winner</div>' : ''}
                ${!debate.entered && isAdmin ? '<div style="font-size:10px;color:#94a3b8;margin-top:3px">⠿ drag</div>' : ''}
            </div>
        </div>

        <!-- Judge zone — inline chips + add dropdown -->
        <div class="dnd-judge-zone"
             data-round="${roundIdx}" data-debate="${debateIdx}"
             ${!debate.entered && isAdmin ? `
             ondragover="window.dndJudgeDragOver(event,${roundIdx},${debateIdx})"
             ondragleave="window.dndDragLeave(event)"
             ondrop="window.dndJudgeDrop(event,${roundIdx},${debateIdx})"` : ''}
             style="background:white;border-radius:6px;padding:6px;margin-top:2px">
            <span style="font-size:11px;font-weight:600;color:#64748b;margin-right:4px">⚖️</span>
            ${judgeChips || '<span style="font-size:12px;color:#94a3b8;font-style:italic">No judges assigned</span>'}
            ${addJudgeDropdown}
        </div>
    </div>`;
}


function toggleBlindRound(roundIdx) {
    const round = state.rounds[roundIdx];
    if (!round) return;

    round.blinded = !round.blinded;
    saveNow();
    displayRounds();
    renderStandings();

    showNotification(
        round.blinded ? 'Round blinded - results hidden from teams' : 'Round unblinded - results visible',
        'success'
    );
}

// ============================================
// REDRAW ROUND (SWAP TEAMS)
// ============================================

function redrawRound(roundIdx) {
    const round = state.rounds[roundIdx];
    if (!round) return;

    // Check if any results entered
    if (round.debates.some(d => d.entered)) {
        showNotification('Cannot redraw round after results have been entered', 'error');
        return;
    }

    if (!confirm('Are you sure you want to redraw this round? This will create new matchups.')) {
        return;
    }

    const isKnockout = round.type === 'knockout';
    const activeTeams = state.teams.filter(t => !t.eliminated);

    let debates = [];
    let pairs = [];
    let teamsCopy = [...activeTeams];

    if (isKnockout) {
        // Re-apply knockout bracket fold
        teamsCopy.sort((a, b) => (b.wins || 0) - (a.wins || 0) || (b.total || 0) - (a.total || 0));
        if (teamsCopy.length % 2 !== 0) teamsCopy.pop();
        const half = Math.floor(teamsCopy.length / 2);
        const top = teamsCopy.slice(0, half);
        const bottom = teamsCopy.slice(half).reverse();
        for (let i = 0; i < top.length; i++) pairs.push([top[i], bottom[i]]);
    } else {
        // Fisher-Yates shuffle for truly random prelim pairings
        for (let i = teamsCopy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [teamsCopy[i], teamsCopy[j]] = [teamsCopy[j], teamsCopy[i]];
        }
        if (teamsCopy.length % 2 !== 0) teamsCopy.pop();
        for (let i = 0; i < teamsCopy.length; i += 2) pairs.push([teamsCopy[i], teamsCopy[i + 1]]);
    }

    // Always use random sides on redraw
    pairs.forEach(([teamA, teamB]) => {
        const govFirst = Math.random() < 0.5;
        debates.push({
            gov: govFirst ? teamA.id : teamB.id,
            opp: govFirst ? teamB.id : teamA.id,
            entered: false,
            panel: [],
            attendance: { gov: true, opp: true }
        });
    });

    // Re-allocate judges
    allocateJudgesToDebates(debates, isKnockout);

    round.debates = debates;
    // Reset rooms to default names so stale custom names don't persist
    round.rooms = debates.map((_, i) => `Room ${i + 1}`);
    saveNow();
    displayRounds();

    showNotification(isKnockout ? 'Round redrawn with bracket seeding' : '🎲 Round redrawn with fresh random pairings', 'success');
}

// ============================================
// SWAP TEAMS IN DEBATE
// ============================================

function swapTeams(roundIdx, debateIdx) {
    const round = state.rounds[roundIdx];
    const debate = round.debates[debateIdx];

    if (debate.entered) {
        showNotification('Cannot swap teams after results entered', 'error');
        return;
    }

    // Swap government and opposition
    [debate.gov, debate.opp] = [debate.opp, debate.gov];

    // Also swap attendance if tracked
    if (debate.attendance) {
        [debate.attendance.gov, debate.attendance.opp] = [debate.attendance.opp, debate.attendance.gov];
    }

    // Clear sidesPending flag — user has explicitly set sides now
    debate.sidesPending = false;

    saveNow();
    displayRounds();
    showNotification('Teams swapped successfully', 'success');
}

// ============================================
// MOVE TEAM ACROSS ROOMS
// ============================================

function showMoveTeamModal(roundIdx, debateIdx) {
    const round = state.rounds[roundIdx];
    const debate = round.debates[debateIdx];

    if (debate.entered) {
        showNotification('Cannot move teams after results are entered', 'error');
        return;
    }

    const gov = state.teams.find(t => t.id === debate.gov);
    const opp = state.teams.find(t => t.id === debate.opp);
    const roomLabel = round.rooms?.[debateIdx] || `Room ${debateIdx + 1}`;

    // Other rooms available to swap with
    const otherRooms = round.debates
        .map((d, idx) => ({ d, idx }))
        .filter(({ d, idx }) => idx !== debateIdx && !d.entered);

    if (otherRooms.length === 0) {
        showNotification('No other rooms available to move teams to', 'info');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px;';

    modal.innerHTML = `
        <div style="background: white; border-radius: 16px; max-width: 580px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
            <div style="padding: 24px; border-bottom: 1px solid #e2e8f0;">
                <h2 style="margin: 0 0 4px 0; color: #1e293b;">↔ Move Team to Another Room</h2>
                <p style="margin: 0; color: #64748b; font-size: 14px;">
                    <strong>${escapeHTML(roomLabel)}</strong>: ${escapeHTML(gov.name)} <span style="color: #94a3b8;">vs</span> ${escapeHTML(opp.name)}
                </p>
            </div>

            <div style="padding: 24px;">
                <p style="margin: 0 0 16px 0; color: #475569; font-size: 14px;">
                    Select a team from this room and a target room. The selected team will swap places with one team from the target room.
                </p>

                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #1e293b; font-size: 14px;">Team to Move</label>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <label style="display: flex; align-items: center; gap: 10px; padding: 14px; background: #eff6ff; border: 2px solid #bfdbfe; border-radius: 10px; cursor: pointer;">
                            <input type="radio" name="move-team" value="gov" style="accent-color: #3b82f6;">
                            <div>
                                <div style="font-weight: 600; color: #1e40af;">${escapeHTML(gov.name)}</div>
                                <div style="font-size: 11px; color: #64748b;">Currently Gov</div>
                            </div>
                        </label>
                        <label style="display: flex; align-items: center; gap: 10px; padding: 14px; background: #fdf2f8; border: 2px solid #fbcfe8; border-radius: 10px; cursor: pointer;">
                            <input type="radio" name="move-team" value="opp" style="accent-color: #be185d;">
                            <div>
                                <div style="font-weight: 600; color: #be185d;">${escapeHTML(opp.name)}</div>
                                <div style="font-size: 11px; color: #64748b;">Currently Opp</div>
                            </div>
                        </label>
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #1e293b; font-size: 14px;">Target Room</label>
                    <select id="move-target-room" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 14px;">
                        <option value="">— Select target room —</option>
                        ${otherRooms.map(({ d, idx }) => {
        const tGov = state.teams.find(t => t.id === d.gov);
        const tOpp = state.teams.find(t => t.id === d.opp);
        const rLabel = round.rooms?.[idx] || `Room ${idx + 1}`;
        return `<option value="${idx}">${escapeHTML(rLabel)}: ${escapeHTML(tGov?.name || '?')} vs ${escapeHTML(tOpp?.name || '?')}</option>`;
    }).join('')}
                    </select>
                </div>

                <div id="move-target-side-row" style="display: none; margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #1e293b; font-size: 14px;">Which team do they replace?</label>
                    <select id="move-target-side" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 14px;">
                        <option value="gov">Replace Gov team (they become Gov)</option>
                        <option value="opp">Replace Opp team (they become Opp)</option>
                    </select>
                    <p style="margin: 8px 0 0 0; font-size: 12px; color: #64748b;">
                        The displaced team will move to <strong>${escapeHTML(roomLabel)}</strong> and take the vacant side.
                    </p>
                </div>

                <div id="move-preview" style="display: none; padding: 14px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; font-size: 13px; color: #166534; margin-bottom: 16px;"></div>
            </div>

            <div style="padding: 16px 24px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                <button onclick="window.closeAllModals()" class="secondary" style="padding: 10px 20px; border-radius: 8px;">
                    Cancel
                </button>
                <button onclick="window.executeMoveTeam(${roundIdx}, ${debateIdx})" class="primary" style="padding: 10px 24px; border-radius: 8px; font-weight: 600;">
                    Confirm Move
                </button>
            </div>
        </div>
    `;

    // Show side selector when target room is chosen and update preview
    function updateMovePreview() {
        const targetIdx = parseInt(document.getElementById('move-target-room')?.value);
        const teamSide = document.querySelector('input[name="move-team"]:checked')?.value;
        const targetSide = document.getElementById('move-target-side')?.value;
        const sideRow = document.getElementById('move-target-side-row');
        const preview = document.getElementById('move-preview');

        if (!isNaN(targetIdx) && document.getElementById('move-target-room').value !== '') {
            sideRow.style.display = 'block';
        } else {
            sideRow.style.display = 'none';
            preview.style.display = 'none';
            return;
        }

        if (!teamSide || !targetSide || isNaN(targetIdx)) {
            preview.style.display = 'none';
            return;
        }

        const targetDebate = round.debates[targetIdx];
        const movingTeam = state.teams.find(t => t.id === debate[teamSide]);
        const displacedTeam = state.teams.find(t => t.id === targetDebate[targetSide]);
        const vacatedSide = teamSide; // side left behind in source room
        const targetRoomLabel = round.rooms?.[targetIdx] || `Room ${targetIdx + 1}`;

        preview.style.display = 'block';
        preview.innerHTML = `
            <strong>Preview:</strong><br>
            • <strong>${escapeHTML(movingTeam?.name || '?')}</strong> → ${escapeHTML(targetRoomLabel)} as <strong>${targetSide}</strong><br>
            • <strong>${escapeHTML(displacedTeam?.name || '?')}</strong> → ${escapeHTML(roomLabel)} as <strong>${vacatedSide}</strong>
        `;
    }

    modal.addEventListener('change', updateMovePreview);
    modal.addEventListener('click', e => { if (e.target === modal) closeAllModals(); });
    document.body.appendChild(modal);
}

function executeMoveTeam(roundIdx, debateIdx) {
    const round = state.rounds[roundIdx];
    const srcDebate = round.debates[debateIdx];

    const movingSide = document.querySelector('input[name="move-team"]:checked')?.value;
    const targetIdxRaw = document.getElementById('move-target-room')?.value;
    const targetSide = document.getElementById('move-target-side')?.value;

    if (!movingSide) { showNotification('Select a team to move', 'error'); return; }
    if (!targetIdxRaw) { showNotification('Select a target room', 'error'); return; }

    const targetIdx = parseInt(targetIdxRaw);
    const tgtDebate = round.debates[targetIdx];

    if (!tgtDebate || tgtDebate.entered) { showNotification('Target room results already entered', 'error'); return; }

    // The team being moved
    const movingTeamId = srcDebate[movingSide];
    // The team being displaced from the target room
    const displacedTeamId = tgtDebate[targetSide];

    // Swap: moving team goes to target room (targetSide), displaced team comes back to source (movingSide)
    tgtDebate[targetSide] = movingTeamId;
    srcDebate[movingSide] = displacedTeamId;

    // Sync attendance flags
    if (!srcDebate.attendance) srcDebate.attendance = { gov: true, opp: true };
    if (!tgtDebate.attendance) tgtDebate.attendance = { gov: true, opp: true };
    // Keep attendance for the positions (not the teams) — reset both affected slots to present
    srcDebate.attendance[movingSide] = true;
    tgtDebate.attendance[targetSide] = true;

    // Clear sidesPending flags
    srcDebate.sidesPending = false;
    tgtDebate.sidesPending = false;

    saveNow();
    closeAllModals();
    displayRounds();

    const movingTeam = state.teams.find(t => t.id === movingTeamId);
    const displacedTeam = state.teams.find(t => t.id === displacedTeamId);
    const targetRoomLabel = round.rooms?.[targetIdx] || `Room ${targetIdx + 1}`;
    const srcRoomLabel = round.rooms?.[debateIdx] || `Room ${debateIdx + 1}`;
    showNotification(`✅ ${movingTeam?.name} → ${targetRoomLabel}, ${displacedTeam?.name} → ${srcRoomLabel}`, 'success');
}

// ============================================
// DRAG AND DROP ENGINE
// ============================================

// Shared drag state — stored on window so inline handlers can read it
// (innerHTML string templates cannot close over local variables)
window._dnd = {
    type: null,       // 'judge' | 'team'
    judgeId: null,    // judge being dragged
    fromRound: null,  // source round index
    fromDebate: null, // source debate index
    fromSide: null,   // 'gov' | 'opp' (teams only)
};

// ── Generic helpers ──────────────────────────────────────────────────────────

function dndDragEnd(event) {
    event.target.classList.remove('dragging');
    // Clear all drop-zone highlights
    document.querySelectorAll('.dnd-judge-zone, .dnd-team-zone').forEach(el => {
        el.classList.remove('drag-over', 'drag-over-conflict', 'drag-over-warn');
    });
    window._dnd = { type: null, judgeId: null, fromRound: null, fromDebate: null, fromSide: null };
}

function dndDragLeave(event) {
    // Only clear if leaving the zone itself (not a child)
    if (!event.currentTarget.contains(event.relatedTarget)) {
        event.currentTarget.classList.remove('drag-over', 'drag-over-conflict', 'drag-over-warn');
    }
}

// ── JUDGE drag handlers ──────────────────────────────────────────────────────

function dndJudgeDragStart(event, judgeId, fromRound, fromDebate) {
    window._dnd = { type: 'judge', judgeId, fromRound, fromDebate, fromSide: null };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', judgeId); // required for Firefox
    event.currentTarget.classList.add('dragging');
}

function dndJudgeDragOver(event, toRound, toDebate) {
    if (window._dnd.type !== 'judge') return;
    event.preventDefault();

    const zone = event.currentTarget;
    zone.classList.remove('drag-over', 'drag-over-conflict');

    // Highlight differently if there's a conflict
    const round = state.rounds[toRound];
    const debate = round?.debates[toDebate];
    if (!debate) return;

    const alreadyHere = (debate.panel || []).some(p => p.id === window._dnd.judgeId);
    if (alreadyHere) return; // don't highlight own panel

    const conflict = hasConflict(window._dnd.judgeId, debate.gov, debate.opp);
    zone.classList.add(conflict ? 'drag-over-conflict' : 'drag-over');
    event.dataTransfer.dropEffect = 'move';
}

function dndJudgeDrop(event, toRound, toDebate) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over', 'drag-over-conflict');

    const { judgeId, fromRound, fromDebate } = window._dnd;
    if (!judgeId || window._dnd.type !== 'judge') return;

    // Same room — no-op
    if (fromRound === toRound && fromDebate === toDebate) return;

    const round = state.rounds[toRound];
    const toDebateObj = round?.debates[toDebate];
    if (!toDebateObj || toDebateObj.entered) {
        showNotification('Cannot move judge — target room results already entered', 'error');
        return;
    }

    const judge = state.judges.find(j => j.id === judgeId);
    const fromDebateObj = state.rounds[fromRound]?.debates[fromDebate];
    const fromRoomLabel = state.rounds[fromRound]?.rooms?.[fromDebate] || `Room ${fromDebate + 1}`;
    const toRoomLabel = round.rooms?.[toDebate] || `Room ${toDebate + 1}`;

    // Check for conflict in target room
    const conflict = hasConflict(judgeId, toDebateObj.gov, toDebateObj.opp);

    // Build confirmation message
    const fromMsg = fromDebateObj ? ` from ${fromRoomLabel}` : '';
    const conflictMsg = conflict ? `\n\n⚠️ WARNING: ${judge?.name} has a conflict with a team in ${toRoomLabel}.` : '';
    const alreadyAssignedMsg = fromDebateObj ? `\n\nThis will remove them from ${fromRoomLabel}.` : '';

    const confirmed = confirm(
        `Move ${judge?.name || judgeId}${fromMsg} → ${toRoomLabel}?${alreadyAssignedMsg}${conflictMsg}\n\nConfirm?`
    );
    if (!confirmed) return;

    // Execute: remove from source panel
    if (fromDebateObj) {
        fromDebateObj.panel = (fromDebateObj.panel || []).filter(p => p.id !== judgeId);
        // Re-promote chair if needed
        if (fromDebateObj.panel.length > 0 && !fromDebateObj.panel.some(p => p.role === 'chair')) {
            fromDebateObj.panel[0].role = 'chair';
        }
    }

    // Add to target panel
    if (!toDebateObj.panel) toDebateObj.panel = [];
    if (!toDebateObj.panel.some(p => p.id === judgeId)) {
        const role = toDebateObj.panel.length === 0 ? 'chair' : 'wing';
        toDebateObj.panel.push({ id: judgeId, role });
    }

    saveNow();
    displayRounds();
    showNotification(`⚖️ ${judge?.name} moved → ${toRoomLabel}${conflict ? ' (conflict warning noted)' : ''}`, conflict ? 'warning' : 'success');
}

// ── TEAM drag handlers ───────────────────────────────────────────────────────

function dndTeamDragStart(event, fromRound, fromDebate, fromSide) {
    window._dnd = { type: 'team', judgeId: null, fromRound, fromDebate, fromSide };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `${fromRound}-${fromDebate}-${fromSide}`);
    event.currentTarget.classList.add('dragging');
}

function dndTeamDragOver(event, toRound, toDebate, toSide) {
    if (window._dnd.type !== 'team') return;
    event.preventDefault();

    const zone = event.currentTarget;
    zone.classList.remove('drag-over', 'drag-over-warn');

    const { fromRound, fromDebate, fromSide } = window._dnd;

    // Same slot — ignore
    if (fromRound === toRound && fromDebate === toDebate && fromSide === toSide) return;

    const srcDebate = state.rounds[fromRound]?.debates[fromDebate];
    const tgtDebate = state.rounds[toRound]?.debates[toDebate];
    if (!srcDebate || !tgtDebate) return;

    const movingTeamId = srcDebate[fromSide];
    const displacedTeamId = tgtDebate[toSide];

    // Check if the two teams have met before (rematch warning)
    const otherTeamInTarget = toSide === 'gov' ? tgtDebate.opp : tgtDebate.gov;
    const previousMeetings = getPreviousMeetings();
    const wouldRematch = previousMeetings[movingTeamId]?.[otherTeamInTarget] > 0
        || previousMeetings[otherTeamInTarget]?.[movingTeamId] > 0;

    zone.classList.add(wouldRematch ? 'drag-over-warn' : 'drag-over');
    event.dataTransfer.dropEffect = 'move';
}

function dndTeamDrop(event, toRound, toDebate, toSide) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over', 'drag-over-warn');

    if (window._dnd.type !== 'team') return;

    const { fromRound, fromDebate, fromSide } = window._dnd;

    // Same slot — no-op
    if (fromRound === toRound && fromDebate === toDebate && fromSide === toSide) return;

    const round = state.rounds[toRound];
    const srcDebate = state.rounds[fromRound]?.debates[fromDebate];
    const tgtDebate = round?.debates[toDebate];

    if (!srcDebate || !tgtDebate) return;
    if (srcDebate.entered || tgtDebate.entered) {
        showNotification('Cannot move teams — one of the rooms has results entered', 'error');
        return;
    }

    const movingTeamId = srcDebate[fromSide];       // team being dragged
    const displacedTeamId = tgtDebate[toSide];      // team in the target slot

    const movingTeam = state.teams.find(t => t.id === movingTeamId);
    const displacedTeam = state.teams.find(t => t.id === displacedTeamId);

    const srcRoomLabel = state.rounds[fromRound]?.rooms?.[fromDebate] || `Room ${fromDebate + 1}`;
    const tgtRoomLabel = round.rooms?.[toDebate] || `Room ${toDebate + 1}`;

    // Rematch check
    const otherTeamInTarget = toSide === 'gov' ? tgtDebate.opp : tgtDebate.gov;
    const previousMeetings = getPreviousMeetings();
    const wouldRematch = previousMeetings[movingTeamId]?.[otherTeamInTarget] > 0
        || previousMeetings[otherTeamInTarget]?.[movingTeamId] > 0;

    const rematchMsg = wouldRematch
        ? `\n\n⚠️ This creates a REMATCH — these teams have debated before.`
        : '';

    // Same round cross-room swap
    const isCrossRoom = fromDebate !== toDebate || fromRound !== toRound;
    const swapMsg = isCrossRoom
        ? `\n\n${movingTeam?.name} (${fromSide.toUpperCase()}, ${srcRoomLabel}) will swap with ${displacedTeam?.name} (${toSide.toUpperCase()}, ${tgtRoomLabel}).`
        : `\n\nThis swaps ${movingTeam?.name} and ${displacedTeam?.name} within ${srcRoomLabel}.`;

    const confirmed = confirm(
        `Move ${movingTeam?.name || movingTeamId} to ${toSide.toUpperCase()} in ${tgtRoomLabel}?${swapMsg}${rematchMsg}\n\nConfirm?`
    );
    if (!confirmed) return;

    // Execute swap: the two slots exchange their team IDs
    srcDebate[fromSide] = displacedTeamId;
    tgtDebate[toSide] = movingTeamId;

    // Clear sidesPending flags on affected rooms
    srcDebate.sidesPending = false;
    tgtDebate.sidesPending = false;

    // Reset attendance for swapped slots to present
    if (!srcDebate.attendance) srcDebate.attendance = { gov: true, opp: true };
    if (!tgtDebate.attendance) tgtDebate.attendance = { gov: true, opp: true };
    srcDebate.attendance[fromSide] = true;
    tgtDebate.attendance[toSide] = true;

    saveNow();
    displayRounds();

    const actionLabel = isCrossRoom
        ? `${movingTeam?.name} → ${tgtRoomLabel} (${toSide}), ${displacedTeam?.name} → ${srcRoomLabel} (${fromSide})`
        : `${movingTeam?.name} and ${displacedTeam?.name} swapped sides`;

    showNotification(`✅ ${actionLabel}${wouldRematch ? ' ⚠️ Rematch!' : ''}`, wouldRematch ? 'warning' : 'success');
}

function toggleAttendance(roundIdx, debateIdx, side) {
    const round = state.rounds[roundIdx];
    const debate = round.debates[debateIdx];

    if (!debate.attendance) {
        debate.attendance = { gov: true, opp: true };
    }

    debate.attendance[side] = !debate.attendance[side];

    saveNow();
    displayRounds();

    const team = state.teams.find(t => t.id === debate[side]);
    showNotification(
        `${team.name} marked as ${debate.attendance[side] ? 'present' : 'absent'}`,
        debate.attendance[side] ? 'success' : 'warning'
    );
}

// ============================================
// IMPROVED JUDGE ALLOCATION (NO DUPLICATES, CONFLICT-AWARE)
// Guarantees: 1) every room gets at least one judge if possible
//             2) no judge double-booked in same round
//             3) conflict-free allocation when enough judges available
//             4) remaining judges distributed to top rooms for quality
// ============================================

function allocateJudgesToDebates(debates, isKnockout = false) {
    if (!state.judges.length) return;

    // Clear all panels first
    debates.forEach(d => { d.panel = []; });

    const previousAllocations = getPreviousJudgeAllocations(isKnockout);
    const assignedInRound = new Set(); // judges already used in this round

    // Sort judges by least-used historically so workload is spread
    const judgesByHistory = [...state.judges].sort((a, b) =>
        (previousAllocations[a.id] || 0) - (previousAllocations[b.id] || 0)
    );

    // Helper: pick the best available judge for a debate (no conflict, not yet used)
    function pickJudge(debate, excludeIds = new Set()) {
        return judgesByHistory.find(j =>
            !assignedInRound.has(j.id) &&
            !excludeIds.has(j.id) &&
            !hasConflict(j.id, debate.gov, debate.opp)
        ) || null;
    }

    // ── PASS 1: guarantee every room gets exactly one chair ──────────────────
    // First try conflict-free; if impossible for a room, fall back to a judge
    // who is available (not yet used) ignoring conflicts as last resort.
    debates.forEach(debate => {
        let chair = pickJudge(debate);

        if (!chair) {
            // Fallback: conflict-free not possible — pick any unused judge
            chair = judgesByHistory.find(j => !assignedInRound.has(j.id)) || null;
        }

        if (chair) {
            debate.panel.push({ id: chair.id, role: 'chair' });
            assignedInRound.add(chair.id);
        }
    });

    // ── PASS 2: fill wing judges with remaining unassigned judges ────────────
    // For knockout rounds prefer panels of 3-5; for prelims panels of 1-3.
    // Wings are added to rooms in order of their "importance":
    //   knockout rooms first, then rooms with fewest current wings.
    const maxWings = isKnockout ? 4 : 2; // additional wings beyond chair

    // Distribute remaining judges as wings, prioritising rooms needing more judges
    // (and optionally top rooms for quality)
    let debateOrder = debates.map((d, i) => i); // index order = room order (top rooms first)

    for (let wingSlot = 0; wingSlot < maxWings; wingSlot++) {
        debateOrder.forEach(idx => {
            const debate = debates[idx];
            if (debate.panel.length === 0) return; // skip rooms that got no chair

            const alreadyInPanel = new Set(debate.panel.map(p => p.id));
            const wing = pickJudge(debate, alreadyInPanel);

            if (wing) {
                debate.panel.push({ id: wing.id, role: 'wing' });
                assignedInRound.add(wing.id);
            }
        });
    }
}

// Helper: Get previous judge allocation counts
function getPreviousJudgeAllocations(isKnockout) {
    const allocations = {};

    state.rounds.forEach(round => {
        const matchesType = isKnockout ? round.type === 'knockout' : round.type !== 'knockout';
        if (!matchesType) return;

        round.debates.forEach(debate => {
            if (debate.panel) {
                debate.panel.forEach(p => {
                    allocations[p.id] = (allocations[p.id] || 0) + 1;
                });
            }
        });
    });

    return allocations;
}

// ============================================
// CREATE ROUND WITH ENHANCED FEATURES
// ============================================

// Helper: assign sides to a pair [teamA, teamB] based on sideMethod and their seed ranks
// seedRankA = position of teamA in sorted standings (lower = higher seed)
function assignSides(teamA, teamB, sideMethod, seedRankA) {
    if (sideMethod === 'seed-high-gov') {
        // Higher seed (lower rank number) = Gov
        return { gov: teamA.id, opp: teamB.id };
    }
    if (sideMethod === 'seed-low-gov') {
        // Lower seed (higher rank number) = Gov
        return { gov: teamB.id, opp: teamA.id };
    }
    if (sideMethod === 'manual') {
        // Default to teamA as gov; tab director will manually swap as needed
        return { gov: teamA.id, opp: teamB.id };
    }
    // Default: random
    return Math.random() < 0.5
        ? { gov: teamA.id, opp: teamB.id }
        : { gov: teamB.id, opp: teamA.id };
}

// ============================================
// SHOW JUDGE MANAGEMENT MODAL
// ============================================

function showJudgeManagement(roundIdx, debateIdx) {
    const round = state.rounds[roundIdx];
    const debate = round.debates[debateIdx];
    const isSpeechDebate = debate.format === 'speech';

    // For standard debates, look up gov/opp teams; for speech there are none
    const gov = isSpeechDebate ? null : state.teams.find(t => t.id === debate.gov);
    const opp = isSpeechDebate ? null : state.teams.find(t => t.id === debate.opp);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 9999; overflow-y: auto; padding: 20px;';

    const currentPanel = debate.panel || [];

    // Build a map of judgeId → { debateIdx, roomName, role } for every other debate in this round
    const judgeAssignments = {}; // judgeId → { debateIdx, roomLabel, role }
    round.debates.forEach((d, dIdx) => {
        if (dIdx === debateIdx) return;
        (d.panel || []).forEach(p => {
            judgeAssignments[p.id] = {
                debateIdx: dIdx,
                roomLabel: round.rooms?.[dIdx] || `Room ${dIdx + 1}`,
                role: p.role
            };
        });
    });

    // Categorise all judges
    // For speech debates there are no team conflicts, so all unassigned judges are free
    const allJudges = state.judges;
    const inCurrentPanel = new Set(currentPanel.map(p => p.id));

    const freeJudges = [];
    const conflictedJudges = [];
    const assignedElsewhere = [];

    allJudges.forEach(j => {
        if (inCurrentPanel.has(j.id)) return;
        const hasC = isSpeechDebate ? false : hasConflict(j.id, debate.gov, debate.opp);
        const elsewhere = judgeAssignments[j.id];
        if (elsewhere) {
            assignedElsewhere.push({ judge: j, assignment: elsewhere, hasConflict: hasC });
        } else if (hasC) {
            conflictedJudges.push(j);
        } else {
            freeJudges.push(j);
        }
    });

    const roomLabel = round.rooms?.[debateIdx] || `Room ${debateIdx + 1}`;

    // Subtitle line: show teams for standard, speaker count for speech
    const modalSubtitle = isSpeechDebate
        ? `${(debate.roomSpeakers || []).length} speakers`
        : `${escapeHTML(gov?.name || '?')} vs ${escapeHTML(opp?.name || '?')}`;

    modal.innerHTML = `
        <div style="background: white; border-radius: 16px; max-width: 640px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
            <div style="padding: 24px; border-bottom: 1px solid #e2e8f0;">
                <h2 style="margin: 0 0 4px 0; color: #1e293b;">${isSpeechDebate ? '⚖️ Judge Management' : '⚖️ Panel Management'}</h2>
                <p style="margin: 0; color: #64748b; font-size: 14px;">
                    <strong>${escapeHTML(roomLabel)}</strong>: ${modalSubtitle}
                </p>
            </div>

            <div style="padding: 24px;">
                <!-- Current Panel -->
                <div style="margin-bottom: 24px;">
                    <h3 style="margin: 0 0 12px 0; color: #1e293b; font-size: 16px;">Current Panel (${currentPanel.length})</h3>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        ${currentPanel.length === 0
            ? '<p style="color: #94a3b8; font-style: italic; padding: 16px; text-align: center; background: #f8fafc; border-radius: 8px;">No judges assigned</p>'
            : currentPanel.map(p => {
                const judge = state.judges.find(j => j.id === p.id);
                if (!judge) return '';
                return `
                                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8fafc; border-radius: 8px; border-left: 3px solid ${p.role === 'chair' ? '#3b82f6' : '#94a3b8'};">
                                        <div>
                                            <strong style="color: #1e293b;">${escapeHTML(judge.name)}</strong>
                                            <span style="margin-left: 8px; background: ${p.role === 'chair' ? '#dbeafe' : '#f1f5f9'}; color: ${p.role === 'chair' ? '#1e40af' : '#475569'}; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: uppercase;">${p.role}</span>
                                        </div>
                                        <button onclick="window.removeJudgeFromPanel(${roundIdx}, ${debateIdx}, '${p.id}')"
                                                style="padding: 6px 12px; background: #fee2e2; color: #991b1b; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">
                                            Remove
                                        </button>
                                    </div>`;
            }).join('')
        }
                    </div>
                </div>

                <!-- Free Judges -->
                ${freeJudges.length > 0 ? `
                <div style="margin-bottom: 20px;">
                    <h3 style="margin: 0 0 10px 0; color: #1e293b; font-size: 15px;">Available Judges (${freeJudges.length})</h3>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${freeJudges.map(j => `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f0fdf4; border-radius: 8px; border-left: 3px solid #10b981;">
                                <strong style="color: #1e293b;">${escapeHTML(j.name)}</strong>
                                <button onclick="window.addJudgeToPanel(${roundIdx}, ${debateIdx}, '${j.id}')"
                                        style="padding: 6px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">
                                    Add
                                </button>
                            </div>`).join('')}
                    </div>
                </div>` : '<p style="color: #94a3b8; font-style: italic; padding: 12px; background: #f8fafc; border-radius: 8px; margin-bottom: 20px; text-align: center;">No free judges available</p>'}

                <!-- Judges in other rooms (can be moved) -->
                ${assignedElsewhere.length > 0 ? `
                <div style="margin-bottom: 20px;">
                    <h3 style="margin: 0 0 10px 0; color: #1e293b; font-size: 15px;">Judges in Other Rooms</h3>
                    <p style="margin: 0 0 10px 0; font-size: 12px; color: #64748b;">Click <strong>Move Here</strong> to pull a judge from their current room into this one.</p>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${assignedElsewhere.map(({ judge: j, assignment: a, hasConflict: hc }) => `
                            <div style="background: ${hc ? '#fff7ed' : '#f8fafc'}; border-radius: 8px; border-left: 3px solid ${hc ? '#f59e0b' : '#94a3b8'}; overflow: hidden;">
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px;">
                                    <div>
                                        <strong style="color: #1e293b;">${escapeHTML(j.name)}</strong>
                                        <span style="margin-left: 8px; color: #64748b; font-size: 12px;">currently in <strong>${escapeHTML(a.roomLabel)}</strong> as ${a.role}</span>
                                        ${hc ? '<span style="margin-left: 6px; background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600;">⚠️ CONFLICT</span>' : ''}
                                    </div>
                                    ${!hc ? `
                                    <button onclick="
                                        var panel = document.getElementById('move-panel-${j.id}');
                                        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
                                    " style="padding: 6px 14px; background: #8b5cf6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">
                                        Move Here ▾
                                    </button>` : '<span style="font-size: 11px; color: #f59e0b; font-weight: 600;">Conflict — cannot assign</span>'}
                                </div>
                                ${!hc ? `
                                <div id="move-panel-${j.id}" style="display:none; padding: 0 12px 14px 12px;">
                                    <div style="background: #ede9fe; border-radius: 8px; padding: 14px;">
                                        <p style="margin: 0 0 10px 0; font-size: 13px; color: #4c1d95; font-weight: 600;">
                                            Move <strong>${escapeHTML(j.name)}</strong> from <strong>${escapeHTML(a.roomLabel)}</strong> → <strong>${escapeHTML(roomLabel)}</strong>
                                        </p>
                                        <p style="margin: 0 0 12px 0; font-size: 12px; color: #6d28d9;">
                                            They will be removed from ${escapeHTML(a.roomLabel)} and added to this panel.
                                            ${a.role === 'chair' ? ' A new chair will be auto-assigned in their old room.' : ''}
                                        </p>
                                        <div style="display: flex; gap: 8px;">
                                            <button onclick="window.moveJudgeToPanel(${roundIdx}, ${a.debateIdx}, ${debateIdx}, '${j.id}')"
                                                    style="padding: 8px 20px; background: #7c3aed; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 700;">
                                                ✓ Confirm Move
                                            </button>
                                            <button onclick="document.getElementById('move-panel-${j.id}').style.display='none'"
                                                    style="padding: 8px 14px; background: white; color: #64748b; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; font-size: 13px;">
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                </div>` : ''}
                            </div>`).join('')}
                    </div>
                </div>` : ''}

                <!-- Conflicted judges (info only) -->
                ${conflictedJudges.length > 0 ? `
                <div>
                    <h3 style="margin: 0 0 10px 0; color: #64748b; font-size: 14px;">Unavailable (Conflicts)</h3>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                        ${conflictedJudges.map(j => `
                            <span style="background: #fee2e2; color: #991b1b; padding: 4px 12px; border-radius: 12px; font-size: 12px;">
                                ${escapeHTML(j.name)}
                            </span>`).join('')}
                    </div>
                </div>` : ''}
            </div>

            <div style="padding: 16px 24px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end;">
                <button onclick="window.closeAllModals()" class="primary" style="padding: 10px 24px; border-radius: 8px;">
                    Done
                </button>
            </div>
        </div>
    `;

    modal.addEventListener('click', function (e) {
        if (e.target === modal) closeAllModals();
    });

    document.body.appendChild(modal);
}

// ============================================
// ADD/REMOVE/MOVE JUDGE FROM PANEL
// ============================================

function addJudgeToPanel(roundIdx, debateIdx, judgeId) {
    const round = state.rounds[roundIdx];
    const debate = round.debates[debateIdx];

    if (!debate.panel) debate.panel = [];

    // Prevent double-booking: remove from any other debate in this round first
    round.debates.forEach((d, dIdx) => {
        if (dIdx === debateIdx) return;
        if (!d.panel) return;
        const was = d.panel.find(p => p.id === judgeId);
        if (was) {
            d.panel = d.panel.filter(p => p.id !== judgeId);
            // Re-assign chair if needed
            if (d.panel.length > 0 && !d.panel.some(p => p.role === 'chair')) {
                d.panel[0].role = 'chair';
            }
        }
    });

    // Don't add if already in this panel
    if (debate.panel.some(p => p.id === judgeId)) return;

    const role = debate.panel.length === 0 ? 'chair' : 'wing';
    debate.panel.push({ id: judgeId, role });

    saveNow();
    closeAllModals();
    setTimeout(() => showJudgeManagement(roundIdx, debateIdx), 100);
}

function removeJudgeFromPanel(roundIdx, debateIdx, judgeId) {
    const round = state.rounds[roundIdx];
    const debate = round.debates[debateIdx];

    debate.panel = debate.panel.filter(p => p.id !== judgeId);

    // Promote first wing to chair if chair was removed
    if (debate.panel.length > 0 && !debate.panel.some(p => p.role === 'chair')) {
        debate.panel[0].role = 'chair';
    }

    saveNow();
    closeAllModals();
    setTimeout(() => showJudgeManagement(roundIdx, debateIdx), 100);
}

// Move a judge from one debate panel to another within the same round
function moveJudgeToPanel(roundIdx, fromDebateIdx, toDebateIdx, judgeId) {
    const round = state.rounds[roundIdx];
    const fromDebate = round.debates[fromDebateIdx];
    const toDebate = round.debates[toDebateIdx];

    if (!fromDebate || !toDebate) return;

    // Remove from source panel
    fromDebate.panel = (fromDebate.panel || []).filter(p => p.id !== judgeId);
    if (fromDebate.panel.length > 0 && !fromDebate.panel.some(p => p.role === 'chair')) {
        fromDebate.panel[0].role = 'chair';
    }

    // Add to destination panel
    if (!toDebate.panel) toDebate.panel = [];
    if (!toDebate.panel.some(p => p.id === judgeId)) {
        const role = toDebate.panel.length === 0 ? 'chair' : 'wing';
        toDebate.panel.push({ id: judgeId, role });
    }

    saveNow();
    closeAllModals();
    setTimeout(() => showJudgeManagement(roundIdx, toDebateIdx), 100);
}

// ============================================
// COPY ROOM URL
// ============================================

function copyRoomURL(roundIdx, debateIdx) {
    const roomURL = getOrCreateRoomURL(roundIdx, debateIdx);

    navigator.clipboard.writeText(roomURL).then(() => {
        showNotification('Room URL copied to clipboard!', 'success');
    }).catch(() => {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = roomURL;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showNotification('Room URL copied!', 'success');
    });
}

// ============================================
// SPEAKER COMBO WIDGET
// Replaces <input list> / <datalist> which locks up after first selection.
// Each slot has: <select> (known names + "new") → reveals <input text> → syncs to <input hidden id=id>
// All submit/duplicate logic reads the hidden input via the original ID.
// ============================================

/** Build HTML for a speaker combo slot.
 *  @param {string}   id         - canonical element ID (hidden input); select gets id+'-sel', text gets id+'-txt'
 *  @param {Array}    speakers   - array of {name} objects for the team roster
 *  @param {string}   accentClr  - border colour for the "new name" text input
 *  @param {string}   badgeId    - id for the NEW badge span
 */
function _buildSpeakerCombo(id, speakers, accentClr, badgeId) {
    const opts = (speakers || [])
        .map(s => `<option value="${escapeHTML(s.name)}">${escapeHTML(s.name)}</option>`)
        .join('');
    return `
    <div>
        <select id="${id}-sel"
                onchange="window._spkComboChange('${id}')"
                style="width:100%;padding:9px 10px;border-radius:8px;border:1.5px solid #cbd5e1;font-size:14px;box-sizing:border-box;background:white;cursor:pointer;">
            <option value="">— Select speaker —</option>
            ${opts}
            <option value="__new__">✏️ Enter new name…</option>
        </select>
        <input type="text" id="${id}-txt"
               placeholder="Type new speaker name…"
               oninput="window._spkComboNew('${id}')"
               style="display:none;width:100%;margin-top:5px;padding:9px 10px;border-radius:8px;border:1.5px solid ${accentClr};font-size:14px;box-sizing:border-box;">
        <input type="hidden" id="${id}" value="">
        <span id="${badgeId}" style="display:none;background:#dbeafe;color:#1e40af;font-size:10px;font-weight:700;padding:2px 6px;border-radius:8px;margin-top:3px;">NEW</span>
    </div>`;
}

// Called when any speaker <select> changes.
// Handles two patterns:
//   (A) Hidden-input combos (BP ballot, _buildSpeakerCombo): id = base id, select = id+'-sel', hidden = id
//   (B) Ballot modal selects (gov-sel-N / opp-sel-N / *-reply-sel): id = select element id directly
window._spkComboChange = function (id) {
    // ── Pattern A: hidden-input combo ────────────────────────────────────────
    const hidden = document.getElementById(id);
    if (hidden && hidden.type === 'hidden') {
        const sel = document.getElementById(id + '-sel');
        const txt = document.getElementById(id + '-txt');
        if (!sel) return;
        if (sel.value === '__new__') {
            if (txt) { txt.style.display = 'block'; txt.focus(); }
            hidden.value = '';
        } else {
            if (txt) { txt.style.display = 'none'; txt.value = ''; }
            hidden.value = sel.value;
        }
        hidden.dispatchEvent(new Event('input', { bubbles: true }));
        return;
    }

    // ── Pattern B: ballot modal select (id IS the select element's id) ──────
    const select = document.getElementById(id);
    if (!select) return;
    if (select.value === '__new__') {
        const txtId = id + '-txt';
        let txt = document.getElementById(txtId);
        if (!txt) {
            txt = document.createElement('input');
            txt.type = 'text'; txt.id = txtId;
            txt.placeholder = 'Enter new speaker name...';
            Object.assign(txt.style, {
                display: 'block', width: '100%', padding: '9px 10px',
                borderRadius: '8px', border: '1.5px solid #3b82f6', marginTop: '5px', boxSizing: 'border-box'
            });
            txt.oninput = () => window._spkComboChange(id);
            select.parentElement.appendChild(txt);
        } else {
            txt.style.display = 'block';
        }
        txt.focus();
    } else {
        const txt = document.getElementById(id + '-txt');
        if (txt) txt.style.display = 'none';
    }
    // ── Live duplicate detection for ballot modal ────────────────────────────
    const m = id.match(/^(gov|opp)/);
    if (m) checkDuplicateSpeakers(m[1], id.includes('reply'));
};

// Called when the free-text input changes
window._spkComboNew = function (id) {
    const txt = document.getElementById(id + '-txt');
    const hidden = document.getElementById(id);
    if (!txt || !hidden) return;
    hidden.value = txt.value.trim();
    hidden.dispatchEvent(new Event('input', { bubbles: true }));
};

/** Pre-populate a combo (used when editing existing results).
 *  If name is in the known roster → select it; otherwise → show text input. */
window._spkComboSetValue = function (id, name, knownSpeakers) {
    const sel = document.getElementById(id + '-sel');
    const txt = document.getElementById(id + '-txt');
    const hidden = document.getElementById(id);
    if (!hidden) return;
    hidden.value = name || '';
    if (!name) return;
    const isKnown = (knownSpeakers || []).some(s => s.name === name);
    if (isKnown && sel) {
        sel.value = name;
        if (txt) txt.style.display = 'none';
    } else if (sel) {
        sel.value = '__new__';
        if (txt) { txt.style.display = 'block'; txt.value = name; }
    }
};

// ============================================
// SHOW ENTER RESULTS MODAL
// ============================================

// ============================================
// SHOW ENTER RESULTS MODAL - FIXED SPEAKER LOADING
// ============================================

function showEnterResults(roundIdx, debateIdx) {
    const round = state.rounds[roundIdx];
    const debate = round.debates[debateIdx];

    // ── Dispatch to BP ballot if this is a BP debate ─────────────────────────
    if (debate.format === 'bp') { showBPEnterResults(roundIdx, debateIdx); return; }
    if (debate.format === 'speech') { showSpeechEnterResults(roundIdx, debateIdx); return; }

    const gov = state.teams.find(t => t.id === debate.gov);
    const opp = state.teams.find(t => t.id === debate.opp);

    if (!gov || !opp) {
        showNotification('Teams not found', 'error');
        return;
    }

    const isAdmin = state.auth?.currentUser?.role === 'admin';
    const isJudge = state.auth?.currentUser?.role === 'judge';
    const myJudgeId = isJudge ? String(state.auth?.currentUser?.associatedId ?? '') : null;
    const isMyRoom = isJudge && (debate.panel || []).some(p => String(p.id) === myJudgeId);

    // Only admin or the judge assigned to this room can submit
    if (!isAdmin && !isMyRoom) {
        showNotification('You are not assigned to this room', 'error');
        return;
    }

    // Check attendance
    const govPresent = debate.attendance?.gov !== false;
    const oppPresent = debate.attendance?.opp !== false;

    if (!govPresent || !oppPresent) {
        showNotification('Both teams must be marked present before entering results', 'error');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px;';

    // Check if reply speeches are disabled for this round
    const disableReply = round.disableReply || false;

    // Ensure speakers arrays exist
    const govSpeakers = gov.speakers || [];
    const oppSpeakers = opp.speakers || [];

    modal.innerHTML = `
        <div style="background: white; border-radius: 16px; max-width: 900px; width: 100%; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
            <div style="padding: 24px; border-bottom: 2px solid #e2e8f0; position: sticky; top: 0; background: white; border-radius: 16px 16px 0 0; z-index: 10;">
                <h2 style="margin: 0 0 8px 0; color: #1e293b; font-size: 24px;">📝 Enter Ballot Results</h2>
                <p style="margin: 0; color: #64748b; font-size: 14px;">
                    Round ${round.id}: ${escapeHTML(round.motion)}
                </p>
                <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">
                    <strong style="color: #1e40af;">🏛️ Government: ${escapeHTML(gov.name)}</strong> vs <strong style="color: #be185d;">⚔️ Opposition: ${escapeHTML(opp.name)}</strong>
                </p>
            </div>
            
            <div style="padding: 24px; overflow-y: auto; flex: 1;">
                <div id="results-error" style="display: none; background: #fee2e2; color: #991b1b; padding: 12px; border-radius: 8px; margin-bottom: 20px; font-weight: 600;"></div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px;">
                    <!-- Government Team -->
                    <div style="background: #eff6ff; padding: 20px; border-radius: 12px; border: 2px solid #bfdbfe;">
                        <h3 style="margin: 0 0 16px 0; color: #1e40af; font-size: 18px; display: flex; align-items: center; gap: 8px;">
                            <span>🏛️</span> Government: ${escapeHTML(gov.name)}
                        </h3>
                        
                        ${[1, 2, 3].map(i => {
        const speakerName = govSpeakers[i - 1]?.name || '';
        return `
                            <div style="margin-bottom: 16px;">
                                <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #1e293b; font-size: 13px;">
                                    Speaker ${i} *
                                </label>
                                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 8px;">
                                    <select id="gov-sel-${i - 1}" 
                                            onchange="window._spkComboChange('gov-sel-${i - 1}')"
                                            style="width:100%;padding:9px 10px;border-radius:8px;border:1.5px solid #cbd5e1;font-size:14px;box-sizing:border-box;background:white;cursor:pointer;">
                                        <option value="">— Select speaker —</option>
                                        ${govSpeakers.map(s => `<option value="${escapeHTML(s.name)}">${escapeHTML(s.name)}</option>`).join('')}
                                        <option value="__new__">✏️ Enter new name…</option>
                                    </select>
                                    <input type="number" id="gov-score-${i - 1}" min="60" max="80" step="0.5"
                                           placeholder="60-80"
                                           style="padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 14px; align-self: start;">
                                </div>
                                <div id="gov-duplicate-${i - 1}" style="display: none; color: #dc2626; font-size: 11px; margin-top: 4px; font-weight: 600;">
                                    ⚠️ Duplicate speaker detected
                                </div>
                            </div>`;
    }).join('')}
                        
                        ${!disableReply ? `
                            <div style="margin-top: 20px; padding-top: 16px; border-top: 2px solid #bfdbfe;">
                                <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #1e293b; font-size: 13px;">
                                    Reply Speaker *
                                </label>
                                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 8px;">
                                    <select id="gov-reply-sel"
                                            onchange="window._spkComboChange('gov-reply-sel')"
                                            style="width:100%;padding:9px 10px;border-radius:8px;border:1.5px solid #cbd5e1;font-size:14px;box-sizing:border-box;background:white;cursor:pointer;">
                                        <option value="">— Select speaker —</option>
                                        ${govSpeakers.map(s => `<option value="${escapeHTML(s.name)}">${escapeHTML(s.name)}</option>`).join('')}
                                        <option value="__new__">✏️ Enter new name…</option>
                                    </select>
                                    <input type="number" id="gov-reply-score" min="30" max="40" step="0.5" 
                                           placeholder="30-40" 
                                           style="padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 14px; align-self: start;">
                                </div>
                                <div id="gov-reply-duplicate" style="display: none; color: #dc2626; font-size: 11px; margin-top: 4px; font-weight: 600;">
                                    ⚠️ Reply speaker already listed as a substantive speaker — best score will be used in rankings
                                </div>
                            </div>
                        ` : '<p style="color: #64748b; font-size: 12px; margin-top: 12px; text-align: center; font-style: italic;">Reply speeches disabled for this round</p>'}
                    </div>
                    
                    <!-- Opposition Team -->
                    <div style="background: #fdf2f8; padding: 20px; border-radius: 12px; border: 2px solid #fbcfe8;">
                        <h3 style="margin: 0 0 16px 0; color: #be185d; font-size: 18px; display: flex; align-items: center; gap: 8px;">
                            <span>⚔️</span> Opposition: ${escapeHTML(opp.name)}
                        </h3>
                        
                        ${[1, 2, 3].map(i => {
        const speakerName = oppSpeakers[i - 1]?.name || '';
        return `
                            <div style="margin-bottom: 16px;">
                                <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #1e293b; font-size: 13px;">
                                    Speaker ${i} *
                                </label>
                                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 8px;">
                                    <select id="opp-sel-${i - 1}" 
                                            onchange="window._spkComboChange('opp-sel-${i - 1}')"
                                            style="width:100%;padding:9px 10px;border-radius:8px;border:1.5px solid #cbd5e1;font-size:14px;box-sizing:border-box;background:white;cursor:pointer;">
                                        <option value="">— Select speaker —</option>
                                        ${oppSpeakers.map(s => `<option value="${escapeHTML(s.name)}">${escapeHTML(s.name)}</option>`).join('')}
                                        <option value="__new__">✏️ Enter new name…</option>
                                    </select>
                                    <input type="number" id="opp-score-${i - 1}" min="60" max="80" step="0.5"
                                           placeholder="60-80"
                                           style="padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 14px; align-self: start;">
                                </div>
                                <div id="opp-duplicate-${i - 1}" style="display: none; color: #dc2626; font-size: 11px; margin-top: 4px; font-weight: 600;">
                                    ⚠️ Duplicate speaker detected
                                </div>
                            </div>`;
    }).join('')}
                        
                        ${!disableReply ? `
                            <div style="margin-top: 20px; padding-top: 16px; border-top: 2px solid #fbcfe8;">
                                <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #1e293b; font-size: 13px;">
                                    Reply Speaker *
                                </label>
                                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 8px;">
                                    <select id="opp-reply-sel"
                                            onchange="window._spkComboChange('opp-reply-sel')"
                                            style="width:100%;padding:9px 10px;border-radius:8px;border:1.5px solid #cbd5e1;font-size:14px;box-sizing:border-box;background:white;cursor:pointer;">
                                        <option value="">— Select speaker —</option>
                                        ${oppSpeakers.map(s => `<option value="${escapeHTML(s.name)}">${escapeHTML(s.name)}</option>`).join('')}
                                        <option value="__new__">✏️ Enter new name…</option>
                                    </select>
                                    <input type="number" id="opp-reply-score" min="30" max="40" step="0.5" 
                                           placeholder="30-40" 
                                           style="padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 14px; align-self: start;">
                                </div>
                                <div id="opp-reply-duplicate" style="display: none; color: #dc2626; font-size: 11px; margin-top: 4px; font-weight: 600;">
                                    ⚠️ Reply speaker already listed as a substantive speaker — best score will be used in rankings
                                </div>
                            </div>
                        ` : '<p style="color: #64748b; font-size: 12px; margin-top: 12px; text-align: center; font-style: italic;">Reply speeches disabled for this round</p>'}
                    </div>
                </div>
                
                <div style="background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.6;">
                        <strong style="color: #1e293b;">Scoring Guidelines:</strong><br>
                        Substantive speeches: 60-80 points${!disableReply ? ' | Reply speeches: 30-40 points' : ''}<br>
                        Ties are not permitted - ensure clear winner
                    </p>
                </div>

                <!-- ── Live score totals preview ────────────────────────── -->
                <div id="ballot-totals-bar" style="margin-top:16px;background:#f1f5f9;border:1.5px solid #e2e8f0;border-radius:10px;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                    <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:120px">
                        <span style="font-size:20px">🏛️</span>
                        <div>
                            <div style="font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:.04em">${escapeHTML(gov.name)}</div>
                            <div id="ballot-gov-total" style="font-size:22px;font-weight:800;color:#1e293b">—</div>
                        </div>
                    </div>
                    <div id="ballot-verdict" style="font-size:13px;font-weight:700;color:#64748b;text-align:center;flex-shrink:0;padding:6px 14px;border-radius:20px;background:#e2e8f0;white-space:nowrap">
                        Enter scores
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:120px;justify-content:flex-end">
                        <div style="text-align:right">
                            <div style="font-size:11px;font-weight:700;color:#be185d;text-transform:uppercase;letter-spacing:.04em">${escapeHTML(opp.name)}</div>
                            <div id="ballot-opp-total" style="font-size:22px;font-weight:800;color:#1e293b">—</div>
                        </div>
                        <span style="font-size:20px">⚔️</span>
                    </div>
                </div>
            </div>
            
            <div style="padding: 20px 24px; border-top: 2px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; position: sticky; bottom: 0; background: white; border-radius: 0 0 16px 16px;">
                <button onclick="window.closeAllModals()" class="secondary" style="padding: 12px 24px; border-radius: 8px; font-weight: 600;">
                    Cancel
                </button>
                <button onclick="window.submitResults(${roundIdx}, ${debateIdx})" class="primary" style="padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 15px;">
                    Submit Results
                </button>
            </div>
        </div>
    `;

    // Pre-populate if editing existing results
    if (debate.entered && debate.govResults && debate.oppResults) {
        setTimeout(() => {
            // Update modal title
            const titleEl = modal.querySelector('h2');
            if (titleEl) titleEl.textContent = '✏️ Edit Ballot Results';
            const submitBtn = modal.querySelector('button[onclick*="submitResults"]');
            if (submitBtn) submitBtn.textContent = '💾 Save Changes';

            // Pre-fill government speakers
            for (let i = 0; i < 3; i++) {
                const speaker = debate.govResults.substantive?.[i];
                if (speaker) {
                    const select = document.getElementById(`gov-sel-${i}`);
                    if (select) {
                        // Check if speaker exists in roster
                        const exists = govSpeakers.some(s => s.name === speaker.speaker);
                        if (exists) {
                            select.value = speaker.speaker;
                        } else {
                            select.value = '__new__';
                            // Could add text input here if needed
                        }
                    }
                    const scoreInput = document.getElementById(`gov-score-${i}`);
                    if (scoreInput) scoreInput.value = speaker.score;
                }
            }

            // Pre-fill government reply
            if (debate.govResults.reply && !disableReply) {
                const replySelect = document.getElementById('gov-reply-sel');
                if (replySelect) {
                    const exists = govSpeakers.some(s => s.name === debate.govResults.reply.speaker);
                    if (exists) {
                        replySelect.value = debate.govResults.reply.speaker;
                    } else {
                        replySelect.value = '__new__';
                    }
                }
                const replyScore = document.getElementById('gov-reply-score');
                if (replyScore) replyScore.value = debate.govResults.reply.score;
            }

            // Pre-fill opposition speakers
            for (let i = 0; i < 3; i++) {
                const speaker = debate.oppResults.substantive?.[i];
                if (speaker) {
                    const select = document.getElementById(`opp-sel-${i}`);
                    if (select) {
                        const exists = oppSpeakers.some(s => s.name === speaker.speaker);
                        if (exists) {
                            select.value = speaker.speaker;
                        } else {
                            select.value = '__new__';
                        }
                    }
                    const scoreInput = document.getElementById(`opp-score-${i}`);
                    if (scoreInput) scoreInput.value = speaker.score;
                }
            }

            // Pre-fill opposition reply
            if (debate.oppResults.reply && !disableReply) {
                const replySelect = document.getElementById('opp-reply-sel');
                if (replySelect) {
                    const exists = oppSpeakers.some(s => s.name === debate.oppResults.reply.speaker);
                    if (exists) {
                        replySelect.value = debate.oppResults.reply.speaker;
                    } else {
                        replySelect.value = '__new__';
                    }
                }
                const replyScore = document.getElementById('opp-reply-score');
                if (replyScore) replyScore.value = debate.oppResults.reply.score;
            }
        }, 100);
    }

    modal.addEventListener('click', function (e) {
        if (e.target === modal) {
            if (confirm('Discard unsaved results?')) {
                closeAllModals();
            }
        }
    });

    document.body.appendChild(modal);

    // ── Wire live score totals ────────────────────────────────────────────────
    function _updateBallotTotals() {
        let govTotal = 0, oppTotal = 0;
        let govFilled = 0, oppFilled = 0;

        for (let i = 0; i < 3; i++) {
            const g = parseFloat(document.getElementById(`gov-score-${i}`)?.value);
            const o = parseFloat(document.getElementById(`opp-score-${i}`)?.value);
            if (!isNaN(g)) { govTotal += g; govFilled++; }
            if (!isNaN(o)) { oppTotal += o; oppFilled++; }
        }
        if (!disableReply) {
            const gr = parseFloat(document.getElementById('gov-reply-score')?.value);
            const or = parseFloat(document.getElementById('opp-reply-score')?.value);
            if (!isNaN(gr)) { govTotal += gr; govFilled++; }
            if (!isNaN(or)) { oppTotal += or; oppFilled++; }
        }

        const maxSlots = disableReply ? 3 : 4;
        const govEl = document.getElementById('ballot-gov-total');
        const oppEl = document.getElementById('ballot-opp-total');
        const verdictEl = document.getElementById('ballot-verdict');
        if (!govEl || !oppEl || !verdictEl) return;

        govEl.textContent = govFilled > 0 ? govTotal.toFixed(1) : '—';
        oppEl.textContent = oppFilled > 0 ? oppTotal.toFixed(1) : '—';

        const bothComplete = govFilled === maxSlots && oppFilled === maxSlots;
        if (bothComplete) {
            const tie = Math.abs(govTotal - oppTotal) < 0.01;
            if (tie) {
                verdictEl.textContent = '\u26a0\ufe0f Tie — not allowed';
                verdictEl.style.background = '#fef3c7';
                verdictEl.style.color = '#92400e';
                govEl.style.color = '#1e293b';
                oppEl.style.color = '#1e293b';
            } else if (govTotal > oppTotal) {
                verdictEl.textContent = '\ud83c\udff7\ufe0f Government leads';
                verdictEl.style.background = '#dbeafe';
                verdictEl.style.color = '#1e40af';
                govEl.style.color = '#1e40af';
                oppEl.style.color = '#1e293b';
            } else {
                verdictEl.textContent = '\u2694\ufe0f Opposition leads';
                verdictEl.style.background = '#fce7f3';
                verdictEl.style.color = '#be185d';
                govEl.style.color = '#1e293b';
                oppEl.style.color = '#be185d';
            }
        } else {
            verdictEl.textContent = `${govFilled + oppFilled}/${maxSlots * 2} scores entered`;
            verdictEl.style.background = '#e2e8f0';
            verdictEl.style.color = '#64748b';
            govEl.style.color = '#1e293b';
            oppEl.style.color = '#1e293b';
        }
    }

    // Attach to all score inputs
    ['gov-score-0', 'gov-score-1', 'gov-score-2',
        'opp-score-0', 'opp-score-1', 'opp-score-2',
        ...(disableReply ? [] : ['gov-reply-score', 'opp-reply-score'])
    ].forEach(id => {
        document.getElementById(id)?.addEventListener('input', _updateBallotTotals);
    });

    // Run once immediately in case editing pre-populated results
    setTimeout(_updateBallotTotals, 150);
}


// Check for duplicate speakers (substantive slots only).
// Reply speakers are intentionally excluded — it is valid for Speaker 1 or 2
// to also deliver the reply speech; only Speaker 3 is prohibited from doing so,
// and that rule is enforced separately as a hard error in submitResults.
function checkDuplicateSpeakers(side, includeReply = false) {
    const speakers = [];
    let hasDuplicate = false;

    for (let i = 0; i < 3; i++) {
        const select = document.getElementById(`${side}-sel-${i}`);
        const dupDiv = document.getElementById(`${side}-duplicate-${i}`);
        const speaker = select?.value?.trim();

        if (speaker && speakers.includes(speaker)) {
            hasDuplicate = true;
            if (dupDiv) dupDiv.style.display = 'block';
        } else {
            if (dupDiv) dupDiv.style.display = 'none';
        }

        if (speaker) speakers.push(speaker);
    }

    // Clear any stale reply-duplicate indicator (no longer checked here)
    const replyDupDiv = document.getElementById(`${side}-reply-duplicate`);
    if (replyDupDiv) replyDupDiv.style.display = 'none';

    return hasDuplicate;
}

// ============================================
// SUBMIT RESULTS (WITH DUPLICATE WARNING)
// ============================================

// ============================================
// SUBMIT RESULTS - FIXED SPEAKER STATS
// ============================================

function submitResults(roundIdx, debateIdx) {
    const round = state.rounds[roundIdx];
    const debate = round.debates[debateIdx];
    const gov = state.teams.find(t => t.id === debate.gov);
    const opp = state.teams.find(t => t.id === debate.opp);

    if (!gov || !opp) {
        showNotification('Teams not found', 'error');
        return;
    }

    const isAdmin = state.auth?.currentUser?.role === 'admin';
    const isJudge = state.auth?.currentUser?.role === 'judge';
    const myJudgeId = isJudge ? String(state.auth?.currentUser?.associatedId ?? '') : null;
    const isMyRoom = isJudge && (debate.panel || []).some(p => String(p.id) === myJudgeId);

    if (!isAdmin && !isMyRoom) {
        showNotification('You are not authorised to submit this ballot', 'error');
        return;
    }

    const errorDiv = document.getElementById('results-error');
    const disableReply = round.disableReply || false;

    // ── Duplicate speaker warning (substantive slots only) ────────────────────
    // Speaker 3 doing reply is a hard error handled later; duplicates in the
    // substantive rows are flagged but the judge may override and still submit.
    const govHasDup = checkDuplicateSpeakers('gov', false);
    const oppHasDup = checkDuplicateSpeakers('opp', false);
    if (govHasDup || oppHasDup) {
        if (errorDiv) {
            errorDiv.style.display = 'block';
            errorDiv.textContent = '⚠️ Duplicate speakers detected — the same name appears more than once in a team\'s substantive slots.';
        }
        const proceed = window.confirm(
            'Warning: duplicate speakers detected in this ballot.\n\n' +
            'The same speaker name appears more than once in a team\'s substantive slots.\n\n' +
            'Do you want to submit anyway?'
        );
        if (!proceed) return;
        if (errorDiv) errorDiv.style.display = 'none';
    }

    try {
        // Get government scores
        const govSpeakers = [];
        const govScores = [];

        for (let i = 0; i < 3; i++) {
            const select = document.getElementById(`gov-sel-${i}`);
            const textInput = document.getElementById(`gov-sel-${i}-txt`);

            // Get speaker name from either select or text input
            let speaker = '';
            if (textInput && textInput.style.display !== 'none') {
                speaker = textInput.value.trim();
            } else if (select) {
                speaker = select.value;
            }

            const score = parseFloat(document.getElementById(`gov-score-${i}`)?.value);

            if (!speaker || isNaN(score)) {
                throw new Error(`Please fill all government speaker ${i + 1} fields`);
            }
            if (score < 60 || score > 80) {
                throw new Error(`Government speaker ${i + 1} score must be 60-80`);
            }
            govSpeakers.push(speaker);
            govScores.push(score);
        }

        let govReply = null;
        let govReplyScore = 0;

        if (!disableReply) {
            const replySelect = document.getElementById('gov-reply-sel');
            const replyText = document.getElementById('gov-reply-sel-txt');

            if (replyText && replyText.style.display !== 'none') {
                govReply = replyText.value.trim();
            } else if (replySelect) {
                govReply = replySelect.value;
            }

            govReplyScore = parseFloat(document.getElementById('gov-reply-score')?.value);

            if (!govReply || isNaN(govReplyScore)) {
                throw new Error('Please fill government reply fields');
            }
            if (govReplyScore < 30 || govReplyScore > 40) {
                throw new Error('Government reply score must be 30-40');
            }

            // Check speaker 3 not doing reply
            if (govReply === govSpeakers[2]) {
                throw new Error('Government speaker 3 cannot give reply speech');
            }
        }

        // Get opposition scores
        const oppSpeakers = [];
        const oppScores = [];

        for (let i = 0; i < 3; i++) {
            const select = document.getElementById(`opp-sel-${i}`);
            const textInput = document.getElementById(`opp-sel-${i}-txt`);

            let speaker = '';
            if (textInput && textInput.style.display !== 'none') {
                speaker = textInput.value.trim();
            } else if (select) {
                speaker = select.value;
            }

            const score = parseFloat(document.getElementById(`opp-score-${i}`)?.value);

            if (!speaker || isNaN(score)) {
                throw new Error(`Please fill all opposition speaker ${i + 1} fields`);
            }
            if (score < 60 || score > 80) {
                throw new Error(`Opposition speaker ${i + 1} score must be 60-80`);
            }
            oppSpeakers.push(speaker);
            oppScores.push(score);
        }

        let oppReply = null;
        let oppReplyScore = 0;

        if (!disableReply) {
            const replySelect = document.getElementById('opp-reply-sel');
            const replyText = document.getElementById('opp-reply-sel-txt');

            if (replyText && replyText.style.display !== 'none') {
                oppReply = replyText.value.trim();
            } else if (replySelect) {
                oppReply = replySelect.value;
            }

            oppReplyScore = parseFloat(document.getElementById('opp-reply-score')?.value);

            if (!oppReply || isNaN(oppReplyScore)) {
                throw new Error('Please fill opposition reply fields');
            }
            if (oppReplyScore < 30 || oppReplyScore > 40) {
                throw new Error('Opposition reply score must be 30-40');
            }

            // Check speaker 3 not doing reply
            if (oppReply === oppSpeakers[2]) {
                throw new Error('Opposition speaker 3 cannot give reply speech');
            }
        }

        // Calculate totals
        const govTotal = govScores.reduce((a, b) => a + b, 0) + (govReplyScore || 0);
        const oppTotal = oppScores.reduce((a, b) => a + b, 0) + (oppReplyScore || 0);

        if (Math.abs(govTotal - oppTotal) < 0.01) {
            throw new Error('Ties are not allowed - please adjust scores');
        }

        // Determine winner
        const govWon = govTotal > oppTotal;
        const winner = govWon ? gov : opp;
        const loser = govWon ? opp : gov;

        // ── Auto-create any new speakers typed into the ballot ───────────────
        function ensureSpeaker(team, name) {
            if (!name) return;
            const trimmed = name.trim();
            if (!trimmed) return;
            if (!team.speakers) team.speakers = [];

            // Check if speaker already exists (case-insensitive)
            const exists = team.speakers.some(s => s.name.toLowerCase() === trimmed.toLowerCase());
            if (!exists) {
                // Create new speaker object with proper structure
                const newSpeaker = {
                    name: trimmed,
                    substantiveTotal: 0,
                    substantiveCount: 0,
                    substantiveScores: {},
                    replyTotal: 0,
                    replyCount: 0,
                    replyScores: {}
                };
                team.speakers.push(newSpeaker);
                showNotification(`Added "${trimmed}" to ${team.name} roster`, 'info');
            }
        }

        govSpeakers.forEach(n => ensureSpeaker(gov, n));
        if (govReply) ensureSpeaker(gov, govReply);
        oppSpeakers.forEach(n => ensureSpeaker(opp, n));
        if (oppReply) ensureSpeaker(opp, oppReply);

        // Reverse previous stats if this debate was already entered (editing a result)
        if (debate.entered) {
            const prevGov = state.teams.find(t => t.id === debate.gov);
            const prevOpp = state.teams.find(t => t.id === debate.opp);
            const pg = debate.govResults;
            const po = debate.oppResults;

            if (prevGov && pg) {
                prevGov.wins = Math.max(0, (prevGov.wins || 0) - (pg.total > po.total ? 1 : 0));
                prevGov.total = Math.max(0, (prevGov.total || 0) - pg.total);
                delete prevGov.roundScores?.[round.id];

                // Subtract speaker stats
                pg.substantive.forEach(s => {
                    const sp = prevGov.speakers.find(x => x.name === s.speaker);
                    if (sp) {
                        sp.substantiveTotal = Math.max(0, (sp.substantiveTotal || 0) - s.score);
                        sp.substantiveCount = Math.max(0, (sp.substantiveCount || 0) - 1);
                        delete sp.substantiveScores?.[round.id];
                    }
                });
                if (pg.reply) {
                    const sp = prevGov.speakers.find(x => x.name === pg.reply.speaker);
                    if (sp) {
                        sp.replyTotal = Math.max(0, (sp.replyTotal || 0) - pg.reply.score);
                        sp.replyCount = Math.max(0, (sp.replyCount || 0) - 1);
                        delete sp.replyScores?.[round.id];
                    }
                }
            }

            if (prevOpp && po) {
                prevOpp.wins = Math.max(0, (prevOpp.wins || 0) - (po.total > pg.total ? 1 : 0));
                prevOpp.total = Math.max(0, (prevOpp.total || 0) - po.total);
                delete prevOpp.roundScores?.[round.id];

                po.substantive.forEach(s => {
                    const sp = prevOpp.speakers.find(x => x.name === s.speaker);
                    if (sp) {
                        sp.substantiveTotal = Math.max(0, (sp.substantiveTotal || 0) - s.score);
                        sp.substantiveCount = Math.max(0, (sp.substantiveCount || 0) - 1);
                        delete sp.substantiveScores?.[round.id];
                    }
                });
                if (po.reply) {
                    const sp = prevOpp.speakers.find(x => x.name === po.reply.speaker);
                    if (sp) {
                        sp.replyTotal = Math.max(0, (sp.replyTotal || 0) - po.reply.score);
                        sp.replyCount = Math.max(0, (sp.replyCount || 0) - 1);
                        delete sp.replyScores?.[round.id];
                    }
                }
            }

            // Restore elimination state if editing a knockout result
            if (round.type === 'knockout') {
                const prevLoser = pg.total > po.total ? prevOpp : prevGov;
                if (prevLoser) prevLoser.eliminated = false;
            }
        }

        // Update team stats
        gov.wins = (gov.wins || 0) + (govWon ? 1 : 0);
        opp.wins = (opp.wins || 0) + (govWon ? 0 : 1);

        gov.total = (gov.total || 0) + govTotal;
        opp.total = (opp.total || 0) + oppTotal;

        gov.roundScores = gov.roundScores || {};
        opp.roundScores = opp.roundScores || {};
        gov.roundScores[round.id] = govTotal;
        opp.roundScores[round.id] = oppTotal;

        // Update speaker stats - find speakers by name (case-insensitive)
        for (let i = 0; i < 3; i++) {
            const govSpeaker = gov.speakers.find(s => s.name.toLowerCase() === govSpeakers[i].toLowerCase());
            if (govSpeaker) {
                govSpeaker.substantiveTotal = (govSpeaker.substantiveTotal || 0) + govScores[i];
                govSpeaker.substantiveScores = govSpeaker.substantiveScores || {};
                govSpeaker.substantiveScores[round.id] = govScores[i];
                govSpeaker.substantiveCount = (govSpeaker.substantiveCount || 0) + 1;
            }

            const oppSpeaker = opp.speakers.find(s => s.name.toLowerCase() === oppSpeakers[i].toLowerCase());
            if (oppSpeaker) {
                oppSpeaker.substantiveTotal = (oppSpeaker.substantiveTotal || 0) + oppScores[i];
                oppSpeaker.substantiveScores = oppSpeaker.substantiveScores || {};
                oppSpeaker.substantiveScores[round.id] = oppScores[i];
                oppSpeaker.substantiveCount = (oppSpeaker.substantiveCount || 0) + 1;
            }
        }

        if (!disableReply) {
            const govReplySpeaker = gov.speakers.find(s => s.name.toLowerCase() === govReply.toLowerCase());
            if (govReplySpeaker) {
                govReplySpeaker.replyTotal = (govReplySpeaker.replyTotal || 0) + govReplyScore;
                govReplySpeaker.replyScores = govReplySpeaker.replyScores || {};
                govReplySpeaker.replyScores[round.id] = govReplyScore;
                govReplySpeaker.replyCount = (govReplySpeaker.replyCount || 0) + 1;
            }

            const oppReplySpeaker = opp.speakers.find(s => s.name.toLowerCase() === oppReply.toLowerCase());
            if (oppReplySpeaker) {
                oppReplySpeaker.replyTotal = (oppReplySpeaker.replyTotal || 0) + oppReplyScore;
                oppReplySpeaker.replyScores = oppReplySpeaker.replyScores || {};
                oppReplySpeaker.replyScores[round.id] = oppReplyScore;
                oppReplySpeaker.replyCount = (oppReplySpeaker.replyCount || 0) + 1;
            }
        }

        // Mark debate as entered
        debate.entered = true;
        debate.govResults = {
            teamName: gov.name,
            substantive: govSpeakers.map((name, i) => ({ speaker: name, score: govScores[i] })),
            reply: disableReply ? null : { speaker: govReply, score: govReplyScore },
            total: govTotal
        };
        debate.oppResults = {
            teamName: opp.name,
            substantive: oppSpeakers.map((name, i) => ({ speaker: name, score: oppScores[i] })),
            reply: disableReply ? null : { speaker: oppReply, score: oppReplyScore },
            total: oppTotal
        };

        // For knockout rounds: eliminate the losing team immediately
        if (round.type === 'knockout') {
            loser.eliminated = true;

            // Check if this is the final (only one debate)
            if (round.debates.length === 1) {
                showNotification(`🏆 Champion: ${winner.name}!`, 'success');
            }
        }

        saveNow();

        closeAllModals();
        renderDraw();
        renderStandings();

        // Force refresh of speaker standings
        if (typeof window.renderSpeakerStandings === 'function') {
            setTimeout(() => window.renderSpeakerStandings(), 100);
        }

        showNotification(
            `✅ Results saved! Winner: ${winner.name} (${Math.max(govTotal, oppTotal).toFixed(1)} - ${Math.min(govTotal, oppTotal).toFixed(1)})`,
            'success'
        );

    } catch (error) {
        if (errorDiv) {
            errorDiv.style.display = 'block';
            errorDiv.textContent = '❌ ' + error.message;
            errorDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

// ============================================================================
// SPEECH DRAW CARD
// ============================================================================

function renderSpeechDebateCard(round, debate, roundIdx, debateIdx) {
    const isAdmin = state.auth?.currentUser?.role === 'admin';
    const isJudge = state.auth?.currentUser?.role === 'judge';
    const myJudgeId = isJudge ? String(state.auth?.currentUser?.associatedId ?? '') : null;
    const isMyRoom = isJudge && (debate.panel || []).some(p => String(p.id) === myJudgeId);
    const isBlinded = round.blinded || false;
    const room = round.rooms?.[debateIdx] || (`Room ${debateIdx + 1}`);
    const speakers = debate.roomSpeakers || [];

    const statusDot = debate.entered ? '#10b981' : (debate.panel?.length ? '#f59e0b' : '#ef4444');
    const statusLabel = debate.entered ? '✅ Scored' : '⏳ Pending';

    const judgeNames = (debate.panel || []).map(p => {
        const j = (state.judges || []).find(j => j.id == p.id);
        return j ? escapeHTML(j.name) : '';
    }).filter(Boolean).join(', ');

    const speakerRows = speakers.map((spk, idx) => {
        let scoreHtml = '';
        if (debate.entered && debate.speechResults && !isBlinded) {
            const res = debate.speechResults.find(r => r.speakerName === spk.speakerName && r.teamId === spk.teamId);
            const score = res?.score;
            const rank = res?.rank;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : ('#' + rank);
            scoreHtml = score != null
                ? '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:18px;font-weight:800;color:#1e293b">' + score.toFixed(1) + '</span><span style="font-size:13px;color:#64748b">' + medal + '</span></div>'
                : '';
        }
        const bg = idx % 2 === 0 ? '#f8fafc' : 'white';
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:' + bg + ';border-radius:8px;margin-bottom:4px">' +
            '<div>' +
            '<div style="font-weight:700;color:#1e293b;font-size:14px">' + escapeHTML(spk.speakerName) + '</div>' +
            '<div style="font-size:11px;color:#94a3b8;margin-top:1px">' + escapeHTML(spk.teamName) + '</div>' +
            '</div>' + scoreHtml + '</div>';
    }).join('');

    const availableJudges = (state.judges || []).filter(j => !(debate.panel || []).some(p => p.id == j.id));
    const freeJudges = availableJudges.filter(j => !round.debates.some((d, di) => di !== debateIdx && (d.panel || []).some(p => p.id == j.id)));
    const otherJudges = availableJudges.filter(j => round.debates.some((d, di) => di !== debateIdx && (d.panel || []).some(p => p.id == j.id)));

    const judgeChips = (debate.panel || []).map(p => {
        const j = (state.judges || []).find(j => j.id == p.id);
        if (!j) return '';
        return '<span class="dnd-judge-chip"' +
            (!debate.entered && isAdmin ? ' draggable="true" ondragstart="window.dndJudgeDragStart(event,\'' + j.id + '\',' + roundIdx + ',' + debateIdx + ')" ondragend="window.dndDragEnd(event)"' : '') + '>' +
            '<span class="chip-role' + (p.role === 'chair' ? ' chair' : '') + '">' + p.role + '</span>' +
            escapeHTML(j.name) +
            (!debate.entered && isAdmin ? '<button class="chip-remove" onclick="window.removeJudgeFromPanel(' + roundIdx + ',' + debateIdx + ',\'' + j.id + '\')">×</button>' : '') +
            '</span>';
    }).join('');

    const freeOpts = freeJudges.map(j => '<option value="' + j.id + '">' + escapeHTML(j.name) + ' (' + j.role + ')</option>').join('');
    const otherOpts = otherJudges.map(j => '<option value="' + j.id + '">' + escapeHTML(j.name) + ' (' + j.role + ')</option>').join('');
    const addJudgeDropdown = (!debate.entered && isAdmin && availableJudges.length > 0)
        ? '<select class="judge-add-select" onchange="if(this.value){window.addJudgeToPanel(' + roundIdx + ',' + debateIdx + ',this.value);this.value=\'\'}">' +
        '<option value="">+ Add Judge</option>' +
        (freeOpts ? '<optgroup label="Available">' + freeOpts + '</optgroup>' : '') +
        (otherOpts ? '<optgroup label="In other rooms">' + otherOpts + '</optgroup>' : '') +
        '</select>'
        : '';

    const canScore = !debate.entered && (isAdmin || isMyRoom);
    const canEdit = debate.entered && !isBlinded;
    const managePanelBtn = (!debate.entered && isAdmin)
        ? '<button onclick="window.showJudgeManagement(' + roundIdx + ',' + debateIdx + ')" class="secondary" style="padding:4px 10px;font-size:12px" title="Manage judge panel">⚙️ Panel</button>'
        : '';
    const btnHtml = canScore
        ? managePanelBtn + '<button onclick="window.showEnterResults(' + roundIdx + ',' + debateIdx + ')" class="primary" style="padding:4px 12px;font-size:12px' + (isMyRoom && !isAdmin ? ';background:#7c3aed' : '') + '">📝 ' + (isAdmin ? 'Enter Scores' : 'Submit Scores') + '</button>'
        : (canEdit
            ? '<button onclick="window.viewDebateDetails(' + roundIdx + ',' + debateIdx + ')" class="secondary" style="padding:4px 10px;font-size:12px">📊 Details</button>' +
            (isAdmin ? '<button onclick="window.editResults(' + roundIdx + ',' + debateIdx + ')" class="secondary" style="padding:4px 10px;font-size:12px">✏️ Edit</button>' : '')
            : '');

    return '<div class="draw-room ' + (debate.entered ? 'done' : 'pending-partial') + '" style="background:white;border-radius:10px;border-left:4px solid ' + statusDot + ';padding:14px;margin-bottom:10px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<strong style="font-size:14px;color:#1e293b">' + escapeHTML(room) + '</strong>' +
        '<span style="background:#f0fdf4;color:#16a34a;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">🎤 SPEECH</span>' +
        '<span style="font-size:12px;font-weight:600;color:' + (debate.entered ? '#10b981' : '#f59e0b') + '">' + statusLabel + '</span>' +
        '<span style="font-size:12px;color:#94a3b8">' + speakers.length + ' speakers</span>' +
        _judgePillHtml(debate, "🎯") +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' + btnHtml + '</div>' +
        '</div>' +
        '<div style="margin-bottom:10px">' + speakerRows + '</div>' +
        '<div style="border-top:1px solid #f1f5f9;padding-top:10px;display:flex;flex-wrap:wrap;align-items:center;gap:6px">' +
        '<span style="font-size:11px;color:#94a3b8;font-weight:600">JUDGE</span>' +
        '<div class="dnd-judge-zone" style="flex:1"' +
        (!debate.entered && isAdmin ? ' ondragover="window.dndJudgeDragOver(event,' + roundIdx + ',' + debateIdx + ')" ondragleave="window.dndDragLeave(event)" ondrop="window.dndJudgeDrop(event,' + roundIdx + ',' + debateIdx + ')"' : '') + '>' +
        (judgeChips || '<span style="font-size:12px;color:' + (isAdmin ? '#ef4444' : '#94a3b8') + ';font-style:italic">' + (isAdmin ? 'No judge assigned' : '—') + '</span>') +
        addJudgeDropdown +
        '</div>' +
        '</div>' +
        '</div>';
}


// ============================================================================
// SPEECH ENTER SCORES MODAL
// ============================================================================

function showSpeechEnterResults(roundIdx, debateIdx) {
    const round = state.rounds[roundIdx];
    const debate = round.debates[debateIdx];
    const isAdmin = state.auth?.currentUser?.role === 'admin';
    const isJudge = state.auth?.currentUser?.role === 'judge';
    const myJudgeId = isJudge ? String(state.auth?.currentUser?.associatedId ?? '') : null;
    const isMyRoom = isJudge && (debate.panel || []).some(p => String(p.id) === myJudgeId);

    if (!isAdmin && !isMyRoom) { showNotification('You are not assigned to this room', 'error'); return; }

    const speakers = debate.roomSpeakers || [];
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px';

    const speakerFields = speakers.map((spk, idx) => {
        const existing = debate.speechResults?.find(r => r.speakerName === spk.speakerName && r.teamId === spk.teamId);
        return '<div style="display:grid;grid-template-columns:1fr auto;align-items:center;gap:14px;padding:14px 18px;background:' + (idx % 2 === 0 ? '#f8fafc' : 'white') + ';border-radius:10px;border:1.5px solid #e2e8f0;margin-bottom:8px">' +
            '<div>' +
            '<div style="font-weight:700;color:#1e293b;font-size:15px">' + escapeHTML(spk.speakerName) + '</div>' +
            '<div style="font-size:12px;color:#94a3b8;margin-top:2px">' + escapeHTML(spk.teamName) + '</div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:8px">' +
            '<label style="font-size:11px;font-weight:700;color:#64748b;white-space:nowrap">Score</label>' +
            '<input type="number" id="speech-score-' + idx + '" min="0" max="100" step="0.5"' +
            ' value="' + (existing?.score ?? '') + '" placeholder="0–100"' +
            ' style="width:90px;padding:9px 10px;border-radius:8px;border:1.5px solid #cbd5e1;font-size:16px;font-weight:700;text-align:center">' +
            '</div>' +
            '</div>';
    }).join('');

    modal.innerHTML =
        '<div style="background:white;border-radius:16px;max-width:540px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)">' +
        '<div style="padding:22px 24px;border-bottom:2px solid #e2e8f0;border-radius:16px 16px 0 0">' +
        '<h2 style="margin:0 0 6px;color:#1e293b;font-size:22px">🎤 Enter Speaker Scores</h2>' +
        '<p style="margin:0;color:#64748b;font-size:13px">Round ' + round.id + (round.motion ? ' · ' + escapeHTML(round.motion) : '') + '</p>' +
        '</div>' +
        '<div style="padding:20px 24px;overflow-y:auto;flex:1">' +
        '<div id="speech-score-error" style="display:none;background:#fee2e2;color:#991b1b;padding:10px 14px;border-radius:8px;margin-bottom:16px;font-weight:600"></div>' +
        '<p style="margin:0 0 14px;font-size:12px;color:#94a3b8">Score each speaker independently (0–100). Scores update the public speaker leaderboard directly.</p>' +
        speakerFields +
        '</div>' +
        '<div style="padding:18px 24px;border-top:2px solid #e2e8f0;display:flex;justify-content:space-between;border-radius:0 0 16px 16px;background:white">' +
        '<button onclick="window.closeAllModals()" class="secondary" style="padding:10px 22px;border-radius:8px;font-weight:600">Cancel</button>' +
        '<button onclick="window.submitSpeechResults(' + roundIdx + ',' + debateIdx + ')" class="primary" style="padding:10px 28px;border-radius:8px;font-weight:600;font-size:15px">💾 Save Scores</button>' +
        '</div>' +
        '</div>';

    modal.addEventListener('click', e => { if (e.target === modal && confirm('Discard unsaved scores?')) closeAllModals(); });
    document.body.appendChild(modal);
}


// ============================================================================
// SPEECH SUBMIT SCORES
// ============================================================================

function submitSpeechResults(roundIdx, debateIdx) {
    const round = state.rounds[roundIdx];
    const debate = round.debates[debateIdx];
    const speakers = debate.roomSpeakers || [];
    const errorDiv = document.getElementById('speech-score-error');

    try {
        const results = speakers.map((spk, idx) => {
            const raw = document.getElementById('speech-score-' + idx)?.value;
            const score = parseFloat(raw);
            if (raw === '' || raw == null || isNaN(score)) throw new Error('Please enter a score for ' + spk.speakerName);
            if (score < 0 || score > 100) throw new Error('Score for ' + spk.speakerName + ' must be 0–100');
            return { ...spk, score };
        });

        // Rank within room (1 = highest)
        const sorted = [...results].sort((a, b) => b.score - a.score);
        results.forEach(r => { r.rank = sorted.indexOf(r) + 1; });

        // Reverse previous stats if re-scoring
        if (debate.entered && debate.speechResults) {
            debate.speechResults.forEach(prev => {
                const team = (state.teams || []).find(t => t.id === prev.teamId);
                if (!team) return;
                const spk = (team.speakers || []).find(s => s.name === prev.speakerName);
                if (!spk) return;
                spk.substantiveTotal = Math.max(0, (spk.substantiveTotal || 0) - prev.score);
                spk.substantiveCount = Math.max(0, (spk.substantiveCount || 0) - 1);
                if (spk.substantiveScores) delete spk.substantiveScores[round.id];
            });
        }

        // Write scores to speaker objects
        results.forEach(r => {
            const team = (state.teams || []).find(t => t.id === r.teamId);
            if (!team) return;
            if (!team.speakers) team.speakers = [];
            let spk = team.speakers.find(s => s.name === r.speakerName);
            if (!spk) {
                spk = { name: r.speakerName, substantiveTotal: 0, substantiveCount: 0, substantiveScores: {}, replyTotal: 0, replyCount: 0, replyScores: {} };
                team.speakers.push(spk);
            }
            spk.substantiveTotal = (spk.substantiveTotal || 0) + r.score;
            spk.substantiveCount = (spk.substantiveCount || 0) + 1;
            spk.substantiveScores = spk.substantiveScores || {};
            spk.substantiveScores[round.id] = r.score;
        });

        debate.entered = true;
        debate.speechResults = results;

        saveNow();
        closeAllModals();
        renderDraw();
        if (typeof window.renderSpeechTab === 'function') window.renderSpeechTab('speech-tab-body');
        if (typeof window.renderSpeakerStandings === 'function') setTimeout(() => window.renderSpeakerStandings(), 100);

        const topScore = Math.max(...results.map(r => r.score));
        const winner = results.find(r => r.score === topScore);
        showNotification('✅ Scores saved! Top: ' + (winner?.speakerName || '') + ' (' + topScore.toFixed(1) + ')', 'success');

    } catch (err) {
        if (errorDiv) { errorDiv.style.display = 'block'; errorDiv.textContent = '❌ ' + err.message; errorDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    }
}
window.submitSpeechResults = submitSpeechResults;
window.showSpeechEnterResults = showSpeechEnterResults;

// ============================================================================
// BP BALLOT — enter results for a 4-team British Parliamentary room
// ============================================================================

function showBPEnterResults(roundIdx, debateIdx) {
    const round = state.rounds[roundIdx];
    const debate = round.debates[debateIdx];

    const isAdmin = state.auth?.currentUser?.role === 'admin';
    const isJudge = state.auth?.currentUser?.role === 'judge';
    const myJudgeId = isJudge ? String(state.auth?.currentUser?.associatedId ?? '') : null;
    const isMyRoom = isJudge && (debate.panel || []).some(p => String(p.id) === myJudgeId);

    if (!isAdmin && !isMyRoom) { showNotification('You are not assigned to this room', 'error'); return; }

    const positions = [
        { key: 'og', label: 'OG', fullLabel: 'Opening Government', color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
        { key: 'oo', label: 'OO', fullLabel: 'Opening Opposition', color: '#be185d', bg: '#fdf2f8', border: '#fbcfe8' },
        { key: 'cg', label: 'CG', fullLabel: 'Closing Government', color: '#065f46', bg: '#f0fdf4', border: '#86efac' },
        { key: 'co', label: 'CO', fullLabel: 'Closing Opposition', color: '#7c3aed', bg: '#faf5ff', border: '#e9d5ff' },
    ];

    // Build speaker combos per position
    function speakerPanel(pos) {
        const team = state.teams.find(t => t.id === debate[pos.key]);
        if (!team) return '';
        // BP: always exactly 2 speakers per team
        const panels = [0, 1].map(i => `
            <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px;margin-bottom:8px;align-items:start;">
                ${_buildSpeakerCombo(`bp-sel-${pos.key}-${i}`, team.speakers, pos.color, `bp-new-${pos.key}-${i}`)}
                <input type="number" id="bp-score-${pos.key}-${i}" min="50" max="100" step="0.5" placeholder="50–100"
                       oninput="window._bpUpdateLive()"
                       style="padding:9px;border-radius:8px;border:1px solid #cbd5e1;font-size:13px;">
            </div>`).join('');
        return `
        <div style="background:${pos.bg};border:2px solid ${pos.border};border-radius:10px;padding:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <div style="font-weight:700;color:${pos.color};font-size:13px;">${pos.label} — ${escapeHTML(team.name)}</div>
                <div id="bp-auto-rank-${pos.key}" style="font-size:12px;font-weight:700;color:#94a3b8;background:#f1f5f9;padding:3px 10px;border-radius:12px;">— pts</div>
            </div>
            <label style="font-size:11px;font-weight:700;color:#64748b;display:block;margin-bottom:4px;text-transform:uppercase;">Speaker Scores</label>
            ${panels}
        </div>`;
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';

    modal.innerHTML = `
    <div style="background:white;border-radius:16px;max-width:860px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3);">
        <div style="padding:20px 24px;border-bottom:2px solid #e2e8f0;position:sticky;top:0;background:white;border-radius:16px 16px 0 0;z-index:10;">
            <h2 style="margin:0 0 6px;color:#1e293b;font-size:22px;">🗳️ BP Ballot — Round ${round.id}</h2>
            <p style="margin:0;color:#64748b;font-size:13px;">${escapeHTML(round.motion || '')} · 2 speakers per team · Rankings auto-set by score totals</p>
        </div>
        <div style="padding:20px 24px;overflow-y:auto;flex:1;">
            <div id="bp-results-error" style="display:none;background:#fee2e2;color:#991b1b;padding:12px;border-radius:8px;margin-bottom:16px;font-weight:600;"></div>

            <!-- Live ranking summary -->
            <div id="bp-live-summary" style="background:#f8fafc;border:2px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:18px;">
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:8px;">Auto Rankings (by speaker total)</div>
                <div id="bp-rank-display" style="display:flex;gap:10px;flex-wrap:wrap;">
                    <span style="color:#94a3b8;font-size:13px;font-style:italic;">Enter scores to see rankings…</span>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
                ${positions.map(pos => speakerPanel(pos)).join('')}
            </div>
        </div>
        <div style="padding:16px 24px;border-top:2px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;position:sticky;bottom:0;background:white;border-radius:0 0 16px 16px;">
            <button onclick="window.closeAllModals()" class="secondary" style="padding:12px 24px;border-radius:8px;font-weight:600;">Cancel</button>
            <button onclick="window.submitBPResults(${roundIdx},${debateIdx})" class="primary" style="padding:12px 32px;border-radius:8px;font-weight:600;font-size:15px;">Submit BP Ballot</button>
        </div>
    </div>`;

    // Pre-fill if editing
    if (debate.entered && debate.bpRanks) {
        setTimeout(() => {
            positions.forEach(pos => {
                const team = state.teams.find(t => t.id === debate[pos.key]);
                (debate.bpSpeakers?.[pos.key] || []).forEach((s, i) => {
                    window._spkComboSetValue(`bp-sel-${pos.key}-${i}`, s.speaker || '', team?.speakers || []);
                    const inp = document.getElementById(`bp-score-${pos.key}-${i}`);
                    if (inp) inp.value = s.score || '';
                });
            });
            window._bpUpdateLive();
        }, 50);
    }

    // Wire up BP score inputs to also fire _bpUpdateLive (combos dispatch 'input' on hidden inputs — scores use oninput inline)
    modal.addEventListener('click', e => { if (e.target === modal && confirm('Discard unsaved results?')) closeAllModals(); });
    document.body.appendChild(modal);

    // Wire NEW badges for BP combos after DOM is ready
    setTimeout(() => {
        positions.forEach(pos => {
            const team = state.teams.find(t => t.id === debate[pos.key]);
            const knownNames = new Set((team?.speakers || []).map(s => s.name.toLowerCase()));
            for (let i = 0; i < 2; i++) {
                const hidden = document.getElementById(`bp-sel-${pos.key}-${i}`);
                const badge = document.getElementById(`bp-new-${pos.key}-${i}`);
                if (hidden && badge) {
                    hidden.addEventListener('input', () => {
                        const v = hidden.value.trim();
                        badge.style.display = (v && !knownNames.has(v.toLowerCase())) ? 'inline-block' : 'none';
                    });
                }
            }
        });
    }, 50);

    window._bpUpdateLive = function () {
        const display = document.getElementById('bp-rank-display');
        if (!display) return;

        const rankLabels = { 1: '🥇 1st', 2: '🥈 2nd', 3: '🥉 3rd', 4: '4th' };

        // Compute totals for each position from the 2 speaker scores
        const totals = {};
        positions.forEach(pos => {
            let sum = 0, filled = 0;
            for (let i = 0; i < 2; i++) {
                const v = parseFloat(document.getElementById(`bp-score-${pos.key}-${i}`)?.value);
                if (!isNaN(v)) { sum += v; filled++; }
            }
            totals[pos.key] = { sum, filled };
        });

        const allFilled = positions.every(p => totals[p.key].filled === 2);

        if (!allFilled) {
            // Show partial totals on each card badge
            positions.forEach(pos => {
                const badge = document.getElementById(`bp-auto-rank-${pos.key}`);
                if (!badge) return;
                const t = totals[pos.key];
                badge.textContent = t.filled > 0 ? `${t.sum.toFixed(1)} pts` : '— pts';
                badge.style.background = '#f1f5f9';
                badge.style.color = '#94a3b8';
            });
            display.innerHTML = '<span style="color:#94a3b8;font-size:13px;font-style:italic;">Enter all scores to see rankings…</span>';
            return;
        }

        // Sort positions by total descending to assign ranks
        const sorted = [...positions].sort((a, b) => totals[b.key].sum - totals[a.key].sum);
        const rankColors = ['#f59e0b', '#94a3b8', '#b45309', '#64748b'];
        const rankBgs = ['#fef3c7', '#f1f5f9', '#fef3c7', '#f1f5f9'];

        sorted.forEach((pos, rankIdx) => {
            const rank = rankIdx + 1;
            const badge = document.getElementById(`bp-auto-rank-${pos.key}`);
            if (!badge) return;
            badge.textContent = `${rankLabels[rank]} · ${totals[pos.key].sum.toFixed(1)}`;
            badge.style.background = rankBgs[rankIdx];
            badge.style.color = rankColors[rankIdx];
            badge.style.border = `1px solid ${rankColors[rankIdx]}`;
        });

        // Update summary bar
        display.innerHTML = sorted.map((pos, i) => {
            const team = state.teams.find(t => t.id === debate[pos.key]);
            return `<span style="padding:6px 12px;border-radius:16px;background:${pos.bg};border:1px solid ${pos.border};color:${pos.color};font-size:12px;font-weight:700;">${rankLabels[i + 1]} · ${escapeHTML(team?.name || pos.label)} (${totals[pos.key].sum.toFixed(1)})</span>`;
        }).join('');
    };
}

function submitBPResults(roundIdx, debateIdx) {
    const round = state.rounds[roundIdx];
    const debate = round.debates[debateIdx];
    const errorDiv = document.getElementById('bp-results-error');

    const positions = ['og', 'oo', 'cg', 'co'];
    const PTS_FOR_RANK = { 1: 3, 2: 2, 3: 1, 4: 0 };

    try {
        // Collect and validate speaker scores — always exactly 2 per team
        const speakers = {};
        const teamScoreTotals = {};
        positions.forEach(pos => {
            const team = state.teams.find(t => t.id === debate[pos]);
            if (!team) return;
            speakers[pos] = [];
            let posTotal = 0;
            for (let i = 0; i < 2; i++) {
                const spk = document.getElementById(`bp-sel-${pos}-${i}`)?.value?.trim();
                const scr = parseFloat(document.getElementById(`bp-score-${pos}-${i}`)?.value);
                if (!spk) throw new Error(`Enter speaker ${i + 1} name for ${pos.toUpperCase()}`);
                if (isNaN(scr) || scr < 50 || scr > 100) throw new Error(`${pos.toUpperCase()} speaker ${i + 1} score must be 50–100`);
                const speakerObj = team.speakers.find(s => s.name === spk);

                speakers[pos].push({
                    speakerId: speakerObj?.id,
                    score: scr
                });
                posTotal += scr;
            }
            teamScoreTotals[pos] = posTotal;
        });

        // Auto-derive ranks from speaker totals — highest total = 1st, no low-point wins
        const sortedByScore = [...positions].sort((a, b) => teamScoreTotals[b] - teamScoreTotals[a]);
        const ranks = {};
        sortedByScore.forEach((pos, i) => { ranks[pos] = i + 1; });

        // Detect ties — two teams with identical totals get the same numeric rank; warn
        const totalsArr = positions.map(p => teamScoreTotals[p]);
        const hasTiedTotal = totalsArr.some((v, i) => totalsArr.indexOf(v) !== i);
        if (hasTiedTotal) {
            throw new Error('Two or more teams have identical speaker totals — adjust scores to break the tie');
        }

        // Revert previous BP stats if editing
        if (debate.entered && debate.bpRanks) {
            positions.forEach(pos => {
                const team = state.teams.find(t => t.id === debate[pos]);
                if (!team) return;
                const oldRank = debate.bpRanks[pos];
                team.wins = Math.max(0, (team.wins || 0) - (oldRank <= 2 ? 1 : 0));
                team.total = Math.max(0, (team.total || 0) - (debate[`${pos}Score`] || 0));
                delete team.roundScores?.[round.id];
                (debate.bpSpeakers?.[pos] || []).forEach(s => {
                    const sp = team.speakers.find(x => x.name === s.speaker);
                    if (sp) {
                        sp.substantiveTotal = Math.max(0, (sp.substantiveTotal || 0) - s.score);
                        sp.substantiveCount = Math.max(0, (sp.substantiveCount || 0) - 1);
                        delete sp.substantiveScores?.[round.id];
                    }
                });
            });
        }

        // Auto-create any new speakers typed into the ballot
        positions.forEach(pos => {
            const team = state.teams.find(t => t.id === debate[pos]);
            if (!team) return;
            team.speakers = team.speakers || [];
            (speakers[pos] || []).forEach(s => {
                const trimmed = s.speaker?.trim();
                if (trimmed && !team.speakers.some(sp => sp.name === trimmed)) {
                    team.speakers.push({ name: trimmed });
                    showNotification(`Added "${trimmed}" to ${team.name} roster`, 'info');
                }
            });
        });

        // Apply new stats — rank awarded by score order (no low-point wins)
        positions.forEach(pos => {
            const team = state.teams.find(t => t.id === debate[pos]);
            if (!team) return;
            const spkTotal = teamScoreTotals[pos];
            // In BP, "wins" = count of 1st or 2nd place finishes (not raw points)
            team.wins = (team.wins || 0) + (ranks[pos] <= 2 ? 1 : 0);
            team.total = (team.total || 0) + spkTotal;
            team.roundScores = team.roundScores || {};
            team.roundScores[round.id] = spkTotal;
            speakers[pos].forEach(s => {
                const sp = team.speakers.find(x => x.name === s.speaker);
                if (sp) {
                    sp.substantiveTotal = (sp.substantiveTotal || 0) + s.score;
                    sp.substantiveCount = (sp.substantiveCount || 0) + 1;
                    sp.substantiveScores = sp.substantiveScores || {};
                    sp.substantiveScores[round.id] = s.score;
                }
            });
        });

        // Save results onto debate object
        debate.entered = true;
        debate.bpRanks = ranks;
        debate.bpSpeakers = speakers;
        positions.forEach(pos => { debate[`${pos}Score`] = teamScoreTotals[pos]; });

        saveNow();
        closeAllModals();
        renderDraw();
        renderStandings();
        if (typeof window.renderSpeakerStandings === 'function') window.renderSpeakerStandings();

        const winner = state.teams.find(t => t.id === debate[Object.keys(ranks).find(p => ranks[p] === 1)]);
        showNotification(`✅ BP ballot saved! 1st: ${winner?.name || '?'}`, 'success');

    } catch (err) {
        if (errorDiv) { errorDiv.style.display = 'block'; errorDiv.textContent = '❌ ' + err.message; errorDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    }
}
window.submitBPResults = submitBPResults;

// ============================================
// VIEW DEBATE DETAILS
// ============================================

function viewDebateDetails(roundIdx, debateIdx) {
    const round = state.rounds[roundIdx];
    const debate = round.debates[debateIdx];
    const gov = state.teams.find(t => t.id === debate.gov);
    const opp = state.teams.find(t => t.id === debate.opp);

    if (!debate.entered) {
        showNotification('No results entered yet', 'info');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px;';

    modal.innerHTML = `
        <div style="background: white; border-radius: 16px; max-width: 700px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
            <div style="padding: 24px; border-bottom: 1px solid #e2e8f0;">
                <h2 style="margin: 0 0 8px 0; color: #1e293b;">📊 Debate Results</h2>
                <p style="margin: 0; color: #64748b; font-size: 14px;">Round ${round.id}: ${escapeHTML(round.motion)}</p>
            </div>
            
            <div style="padding: 24px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
                    <div style="text-align: center; padding: 20px; background: ${debate.govResults.total > debate.oppResults.total ? '#d1fae5' : '#f8fafc'}; border-radius: 12px; border: 2px solid ${debate.govResults.total > debate.oppResults.total ? '#10b981' : '#e2e8f0'};">
                        <h3 style="margin: 0 0 8px 0; color: #1e40af; font-size: 18px;">${escapeHTML(gov.name)}</h3>
                        <div style="font-size: 36px; font-weight: 700; color: #1e293b;">${debate.govResults.total.toFixed(1)}</div>
                        ${debate.govResults.total > debate.oppResults.total ? '<div style="margin-top: 8px; color: #10b981; font-weight: 600; font-size: 14px;">🏆 WINNER</div>' : ''}
                    </div>
                    
                    <div style="text-align: center; padding: 20px; background: ${debate.oppResults.total > debate.govResults.total ? '#d1fae5' : '#f8fafc'}; border-radius: 12px; border: 2px solid ${debate.oppResults.total > debate.govResults.total ? '#10b981' : '#e2e8f0'};">
                        <h3 style="margin: 0 0 8px 0; color: #be185d; font-size: 18px;">${escapeHTML(opp.name)}</h3>
                        <div style="font-size: 36px; font-weight: 700; color: #1e293b;">${debate.oppResults.total.toFixed(1)}</div>
                        ${debate.oppResults.total > debate.govResults.total ? '<div style="margin-top: 8px; color: #10b981; font-weight: 600; font-size: 14px;">🏆 WINNER</div>' : ''}
                    </div>
                </div>
                
                <div style="background: #f8fafc; padding: 20px; border-radius: 12px;">
                    <h4 style="margin: 0 0 12px 0; color: #1e293b;">Speaker Breakdown</h4>
                    
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 2px solid #e2e8f0;">
                                <th style="padding: 8px; text-align: left; color: #64748b; font-size: 12px;">Speaker</th>
                                <th style="padding: 8px; text-align: center; color: #64748b; font-size: 12px;">Score</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${debate.govResults.substantive.map((s, i) => `
                                <tr style="border-bottom: 1px solid #e2e8f0;">
                                    <td style="padding: 10px; color: #1e293b;">🏛️ ${escapeHTML(s.speaker)} (G${i + 1})</td>
                                    <td style="padding: 10px; text-align: center; font-weight: 600;">${s.score.toFixed(1)}</td>
                                </tr>
                            `).join('')}
                            ${debate.govResults.reply ? `
                                <tr style="border-bottom: 1px solid #e2e8f0;">
                                    <td style="padding: 10px; color: #1e293b;">🏛️ ${escapeHTML(debate.govResults.reply.speaker)} (Reply)</td>
                                    <td style="padding: 10px; text-align: center; font-weight: 600;">${debate.govResults.reply.score.toFixed(1)}</td>
                                </tr>
                            ` : ''}
                            ${debate.oppResults.substantive.map((s, i) => `
                                <tr style="border-bottom: 1px solid #e2e8f0;">
                                    <td style="padding: 10px; color: #1e293b;">⚔️ ${escapeHTML(s.speaker)} (O${i + 1})</td>
                                    <td style="padding: 10px; text-align: center; font-weight: 600;">${s.score.toFixed(1)}</td>
                                </tr>
                            `).join('')}
                            ${debate.oppResults.reply ? `
                                <tr>
                                    <td style="padding: 10px; color: #1e293b;">⚔️ ${escapeHTML(debate.oppResults.reply.speaker)} (Reply)</td>
                                    <td style="padding: 10px; text-align: center; font-weight: 600;">${debate.oppResults.reply.score.toFixed(1)}</td>
                                </tr>
                            ` : ''}
                        </tbody>
                    </table>
                </div>
                
                ${debate.panel?.length > 0 ? `
                    <div style="margin-top: 16px; padding: 12px; background: #f8fafc; border-radius: 8px; font-size: 13px; color: #64748b;">
                        <strong style="color: #1e293b;">Panel:</strong> ${debate.panel.map(p => {
        const judge = state.judges.find(j => j.id === p.id);
        return judge ? judge.name : '';
    }).filter(Boolean).join(', ')}
                    </div>
                ` : ''}
            </div>
            
            <div style="padding: 16px 24px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end;">
                <button onclick="window.closeAllModals()" class="primary" style="padding: 10px 24px; border-radius: 8px;">
                    Close
                </button>
            </div>
        </div>
    `;

    modal.addEventListener('click', function (e) {
        if (e.target === modal) closeAllModals();
    });

    document.body.appendChild(modal);
}

// ============================================
// EDIT RESULTS (RE-OPEN RESULTS MODAL)
// ============================================

function editResults(roundIdx, debateIdx) {
    if (!confirm('Editing results will recalculate team and speaker stats. Continue?')) {
        return;
    }

    // Re-open the results modal
    showEnterResults(roundIdx, debateIdx);
}


// ============================================
// EDIT MOTION MODAL
// ============================================

function showEditMotionModal(roundIdx) {
    const round = state.rounds[roundIdx];
    if (!round) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
    modal.innerHTML = `
        <div style="background:white;border-radius:16px;max-width:560px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3);">
            <div style="padding:24px;border-bottom:1px solid #e2e8f0;">
                <h2 style="margin:0 0 4px;color:#1e293b;">✏️ Edit Round ${round.id} Motion</h2>
                <p style="margin:0;color:#64748b;font-size:14px;">Update the motion and optional info slide for this round.</p>
            </div>
            <div style="padding:24px;">
                <div style="margin-bottom:16px;">
                    <label style="display:block;font-weight:600;color:#1e293b;margin-bottom:6px;font-size:14px;">Motion *</label>
                    <textarea id="edit-motion-text" rows="3" style="width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;resize:vertical;box-sizing:border-box;">${escapeHTML(round.motion || '')}</textarea>
                </div>
                <div>
                    <label style="display:block;font-weight:600;color:#1e293b;margin-bottom:6px;font-size:14px;">Info Slide <span style="font-weight:400;color:#64748b;">(optional)</span></label>
                    <textarea id="edit-motion-infoslide" rows="3" style="width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;resize:vertical;box-sizing:border-box;">${escapeHTML(round.infoslide || '')}</textarea>
                </div>
            </div>
            <div style="padding:16px 24px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;">
                <button onclick="window.closeAllModals()" class="secondary" style="padding:10px 20px;border-radius:8px;">Cancel</button>
                <button onclick="window._saveMotion(${roundIdx})" class="primary" style="padding:10px 24px;border-radius:8px;font-weight:600;">💾 Save Motion</button>
            </div>
        </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) closeAllModals(); });
    document.body.appendChild(modal);
}

window._saveMotion = function (roundIdx) {
    const round = state.rounds[roundIdx];
    if (!round) return;
    const motion = document.getElementById('edit-motion-text')?.value.trim();
    const infoslide = document.getElementById('edit-motion-infoslide')?.value.trim();
    if (!motion) { showNotification('Motion cannot be empty', 'error'); return; }
    round.motion = motion;
    round.infoslide = infoslide || null;
    saveNow();
    closeAllModals();
    displayRounds();
    // Also refresh motions tab if visible
    if (typeof window.renderMotions === 'function') window.renderMotions();
    showNotification(`✅ Round ${round.id} motion updated`, 'success');
};

window.showEditMotionModal = showEditMotionModal;

// ============================================================================
// ADMIN FAST DRAW — displayAdminRounds()
// Used by the admin panel instead of displayRounds(). Skips DnD, judge
// conflict scanning, and per-debate dropdown building (was O(judges×debates)).
// Renders a compact list in O(debates) with one shared teamMap lookup.
// ============================================================================
function displayAdminRounds() {
    const list = document.getElementById('rounds-list');
    if (!list) return;

    const filter = document.getElementById('round-filter')?.value || 'all';
    const rounds = state.rounds || [];

    let filtered = rounds.slice().reverse();
    if (filter === 'pending') filtered = filtered.filter(r => r.debates.some(d => !d.entered));
    if (filter === 'completed') filtered = filtered.filter(r => r.debates.every(d => d.entered));
    if (filter === 'blinded') filtered = filtered.filter(r => r.blinded);

    if (filtered.length === 0) {
        list.innerHTML = rounds.length === 0
            ? `<div style="padding:32px;text-align:center;color:#94a3b8">No rounds yet — create one on the left.</div>`
            : `<div style="padding:32px;text-align:center;color:#94a3b8">No rounds match this filter.</div>`;
        return;
    }

    // Build team lookup once — O(teams), not repeated per debate
    const teamMap = Object.fromEntries((state.teams || []).map(t => [t.id, t]));

    const html = filtered.map(round => {
        const actualIdx = rounds.findIndex(r => r.id === round.id);
        const done = round.debates.filter(d => d.entered).length;
        const total = round.debates.length;
        const pct = total > 0 ? Math.round(done / total * 100) : 0;
        const allDone = done === total && total > 0;

        const rows = round.debates.map((debate, di) => {
            const room = round.rooms?.[di] || `Room ${di + 1}`;
            const entered = debate.entered;
            const panelNames = (debate.panel || []).map(p => {
                const j = (state.judges || []).find(j => j.id == p.id);
                return j ? escapeHTML(j.name) : '';
            }).filter(Boolean).join(', ');

            // ── Speech format ──────────────────────────────────────────────
            if (debate.format === 'speech') {
                const speakers = (debate.roomSpeakers || []);
                const speakerSummary = speakers.slice(0, 3).map(s => escapeHTML(s.speakerName)).join(', ') +
                    (speakers.length > 3 ? ` +${speakers.length - 3} more` : '');
                const topResult = debate.entered && debate.speechResults
                    ? debate.speechResults.reduce((best, r) => (!best || r.score > best.score) ? r : best, null)
                    : null;

                return `<div style="display:grid;grid-template-columns:90px 1fr auto auto;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;${entered ? 'background:#f0fdf4' : ''}">
                    <div style="display:flex;align-items:center;gap:5px">
                        <span style="width:7px;height:7px;border-radius:50%;background:${entered ? '#10b981' : '#f59e0b'};flex-shrink:0;display:inline-block"></span>
                        <span style="font-size:11px;font-weight:700;color:#64748b;white-space:nowrap">${escapeHTML(room)}</span>
                    </div>
                    <div style="min-width:0">
                        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                            <span style="background:#f0fdf4;color:#16a34a;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700">🎤 SPEECH</span>
                            <span style="color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px;font-size:12px">${speakerSummary || '<em style="color:#94a3b8">No speakers</em>'}</span>
                            ${topResult && !round.blinded ? `<span style="font-size:11px;font-weight:700;color:#10b981;white-space:nowrap">Top: ${escapeHTML(topResult.speakerName)} (${topResult.score.toFixed(1)})</span>` : ''}
                        </div>
                    </div>
                    <div style="font-size:11px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px">
                        ${panelNames ? `🎯 ${panelNames}` : '<span style="color:#ef4444;font-style:italic">No judge</span>'}
                    </div>
                    <div>
                        ${entered
                        ? `<button onclick="window.editResults(${actualIdx},${di})" class="secondary" style="padding:3px 8px;font-size:11px">✏️ Edit</button>`
                        : `<button onclick="window.showEnterResults(${actualIdx},${di})" class="primary" style="padding:3px 8px;font-size:11px">📝 Scores</button>`}
                    </div>
                </div>`;
            }

            // ── BP format ──────────────────────────────────────────────────
            if (debate.format === 'bp') {
                const positions = ['og', 'oo', 'cg', 'co'];
                const teamNames = positions.map(pos => {
                    const t = teamMap[debate[pos]];
                    return t ? escapeHTML(t.name) : '—';
                }).join(' · ');
                const winner = debate.entered && debate.bpRanks
                    ? teamMap[debate[Object.keys(debate.bpRanks).find(p => debate.bpRanks[p] === 1)]]
                    : null;
                return `<div style="display:grid;grid-template-columns:90px 1fr auto auto;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;${entered ? 'background:#f0fdf4' : ''}">
                    <div style="display:flex;align-items:center;gap:5px">
                        <span style="width:7px;height:7px;border-radius:50%;background:${entered ? '#10b981' : '#f59e0b'};flex-shrink:0;display:inline-block"></span>
                        <span style="font-size:11px;font-weight:700;color:#64748b;white-space:nowrap">${escapeHTML(room)}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;min-width:0">
                        <span style="background:#dbeafe;color:#1e40af;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700">BP</span>
                        <span style="color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px;font-size:12px">${teamNames}</span>
                        ${winner && !round.blinded ? `<span style="font-size:11px;font-weight:700;color:#10b981">🥇 ${escapeHTML(winner.name)}</span>` : ''}
                    </div>
                    <div style="font-size:11px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px">
                        ${panelNames ? `⚖️ ${panelNames}` : '<span style="color:#ef4444;font-style:italic">No judges</span>'}
                    </div>
                    <div>
                        ${entered
                        ? `<button onclick="window.editResults(${actualIdx},${di})" class="secondary" style="padding:3px 8px;font-size:11px">✏️ Override</button>`
                        : `<button onclick="window.showEnterResults(${actualIdx},${di})" class="primary" style="padding:3px 8px;font-size:11px">📝 Results</button>`}
                    </div>
                </div>`;
            }

            // ── Standard (WSDC) format ─────────────────────────────────────
            const gov = teamMap[debate.gov];
            const opp = teamMap[debate.opp];
            if (!gov || !opp) return '';
            const govScore = entered ? (debate.govResults?.total?.toFixed(1) ?? '?') : null;
            const oppScore = entered ? (debate.oppResults?.total?.toFixed(1) ?? '?') : null;
            const govWon = entered && (debate.govResults?.total ?? 0) > (debate.oppResults?.total ?? 0);

            return `<div style="display:grid;grid-template-columns:90px 1fr auto auto;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;${entered ? 'background:#f0fdf4' : ''}">
                <div style="display:flex;align-items:center;gap:5px">
                    <span style="width:7px;height:7px;border-radius:50%;background:${entered ? '#10b981' : '#f59e0b'};flex-shrink:0;display:inline-block"></span>
                    <span style="font-size:11px;font-weight:700;color:#64748b;white-space:nowrap">${escapeHTML(room)}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;min-width:0">
                    <span style="font-weight:${govWon ? 700 : 500};color:${govWon ? '#10b981' : '#1e293b'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px">${escapeHTML(gov.name)}</span>
                    ${entered && !round.blinded
                    ? `<span style="font-size:12px;font-weight:700;white-space:nowrap">${govScore} — ${oppScore}</span>`
                    : (() => { try { const pm = getPreviousMeetings(); const k = [debate.gov, debate.opp].sort().join('-'); const m = pm[k] || 0; return m > 0 ? '<span style="background:#f97316;color:white;padding:1px 7px;border-radius:10px;font-size:11px;font-weight:700">🔄×' + m + '</span>' : '<span style="font-size:11px;color:#94a3b8">vs</span>'; } catch (e) { return '<span style="font-size:11px;color:#94a3b8">vs</span>'; } })()}
                    <span style="font-weight:${!govWon && entered ? 700 : 500};color:${!govWon && entered ? '#10b981' : '#1e293b'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px">${escapeHTML(opp.name)}</span>
                </div>
                <div style="font-size:11px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">
                    ${panelNames ? `⚖️ ${panelNames}` : '<span style="color:#ef4444;font-style:italic">No judges</span>'}
                </div>
                <div>
                    ${entered
                    ? `<button onclick="window.editResults(${actualIdx},${di})" class="secondary" style="padding:3px 8px;font-size:11px">✏️ Override</button>`
                    : `<button onclick="window.showEnterResults(${actualIdx},${di})" class="primary" style="padding:3px 8px;font-size:11px">📝 Results</button>`}
                </div>
            </div>`;
        }).join('');

        return `<div style="background:white;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:10px;overflow:hidden">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#f8fafc;border-bottom:1px solid #e2e8f0;gap:10px;flex-wrap:wrap">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                    <strong>Round ${round.id}</strong>
                    ${round.type === 'knockout' ? '<span style="background:#fee2e2;color:#991b1b;padding:1px 8px;border-radius:20px;font-size:11px;font-weight:700">KO</span>' : ''}
                    ${round.blinded ? '<span style="background:#f1f5f9;color:#475569;padding:1px 8px;border-radius:20px;font-size:11px;font-weight:700">Blind</span>' : ''}
                    ${round.motion ? `<span style="font-size:12px;color:#64748b;font-style:italic">${escapeHTML(round.motion.substring(0, 60))}${round.motion.length > 60 ? '…' : ''}</span>` : ''}
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                    <span style="font-size:12px;font-weight:700;color:${allDone ? '#10b981' : '#f59e0b'}">${done}/${total}</span>
                    <button onclick="window.switchTab('draw')" class="secondary" style="padding:3px 8px;font-size:11px">Full Edit →</button>
                </div>
            </div>
            <div style="height:3px;background:#e2e8f0"><div style="height:100%;width:${pct}%;background:#10b981;transition:width .4s"></div></div>
            ${rows}
        </div>`;
    }).join('');

    list.innerHTML = html;
}
window.displayAdminRounds = displayAdminRounds;

// ============================================================================
// RENAME SPEAKER ACROSS ALL BALLOT RECORDS
// ============================================================================
function renameSpeakerInBallots(teamId, oldName, newName) {
    if (!oldName || !newName || oldName === newName) return;

    const tid = String(teamId); // normalise to string for safe comparison
    let changed = 0;

    // Track which rounds were modified
    const modifiedRoundIds = new Set();

    (state.rounds || []).forEach(round => {
        let roundModified = false;

        (round.debates || []).forEach(debate => {
            if (!debate.entered) return;
            let debateModified = false;

            // ── WSDC format ───────────────────────────────────────────────
            // Check government results
            if (debate.govResults && String(debate.gov) === tid) {
                // Update substantive speakers
                (debate.govResults.substantive || []).forEach(s => {
                    if (s.speaker === oldName) {
                        s.speaker = newName;
                        changed++;
                        debateModified = true;
                    }
                });

                // Update reply speaker
                if (debate.govResults.reply && debate.govResults.reply.speaker === oldName) {
                    debate.govResults.reply.speaker = newName;
                    changed++;
                    debateModified = true;
                }
            }

            // Check opposition results
            if (debate.oppResults && String(debate.opp) === tid) {
                // Update substantive speakers
                (debate.oppResults.substantive || []).forEach(s => {
                    if (s.speaker === oldName) {
                        s.speaker = newName;
                        changed++;
                        debateModified = true;
                    }
                });

                // Update reply speaker
                if (debate.oppResults.reply && debate.oppResults.reply.speaker === oldName) {
                    debate.oppResults.reply.speaker = newName;
                    changed++;
                    debateModified = true;
                }
            }

            // ── BP format ─────────────────────────────────────────────────
            if (debate.bpSpeakers) {
                ['og', 'oo', 'cg', 'co'].forEach(pos => {
                    if (String(debate[pos]) === tid) {
                        (debate.bpSpeakers[pos] || []).forEach(s => {
                            if (s.speaker === oldName) {
                                s.speaker = newName;
                                changed++;
                                debateModified = true;
                            }
                        });
                    }
                });
            }

            if (debateModified) roundModified = true;
        });

        if (roundModified) modifiedRoundIds.add(round.id);
    });

    if (changed > 0) {
        console.log(`✅ Renamed speaker "${oldName}" → "${newName}" in ${changed} ballot entries`);

        // Force UI refresh - call ALL render functions to ensure everything updates
        setTimeout(() => {
            // Refresh speaker standings
            if (typeof window.renderSpeakerStandings === 'function') {
                window.renderSpeakerStandings();
            }

            // Refresh draw view
            if (typeof window.displayRounds === 'function') {
                window.displayRounds();
            }
            if (typeof window.renderDraw === 'function') {
                window.renderDraw();
            }

            // Refresh admin view if visible
            if (typeof window.displayAdminRounds === 'function') {
                window.displayAdminRounds();
            }

            // Refresh any other views that might show speaker names
            if (typeof window.renderResults === 'function') {
                window.renderResults();
            }
            if (typeof window.renderParticipants === 'function') {
                window.renderParticipants();
            }
        }, 10); // Small delay to ensure all updates are processed
    }

    return changed;
}
window.renameSpeakerInBallots = renameSpeakerInBallots;
// Debounced render — prevents double-firing when both 'rounds' and 'teams' change together
let _drawRenderTimer = null;
function _debouncedRenderDraw() {
    clearTimeout(_drawRenderTimer);
    _drawRenderTimer = setTimeout(() => {
        // Only re-render if the draw tab is currently visible to avoid wasted work
        if (document.getElementById('draw')?.offsetParent !== null) renderDraw();
    }, 30);
}
watch('rounds', renderStandings);
watch('teams', renderStandings);
watch('rounds', _debouncedRenderDraw);
watch('teams', _debouncedRenderDraw);

// ============================================================================
// BACKFILL — patch rounds created before rooms array was initialized
// Runs once on module load; silently adds default room names to any round
// that is missing them, then saves so the fix persists across reloads.
// ============================================================================
(function _backfillRoomNames() {
    const rounds = state.rounds || [];
    let dirty = false;
    rounds.forEach(round => {
        const debates = round.debates || [];
        if (!Array.isArray(round.rooms) || round.rooms.length !== debates.length) {
            round.rooms = debates.map((_, i) => `Room ${i + 1}`);
            dirty = true;
        }
    });
    if (dirty) saveNow();
})();

// ============================================================================
// EXPORTS
// ============================================================================
export {
    displayRounds,
    displayAdminRounds,
    allocateJudgesToDebates,
    showJudgeManagement,
    addJudgeToPanel,
    removeJudgeFromPanel,
    moveJudgeToPanel,
    showMoveTeamModal,
    executeMoveTeam,
    dndJudgeDragStart, dndJudgeDragOver, dndJudgeDrop,
    dndTeamDragStart, dndTeamDragOver, dndTeamDrop,
    dndDragEnd, dndDragLeave,
    copyRoomURL,
    showEnterResults,
    submitResults,
    toggleBlindRound,
    redrawRound,
    swapTeams,
    toggleAttendance,
    viewDebateDetails,
    editResults,
    checkDuplicateSpeakers,
    showEditMotionModal,
    renameSpeakerInBallots
};

// Register all interactive functions on window so inline onclick handlers work
// ── Rename a room inline ──────────────────────────────────────────────────────
function renameRoom(roundIdx, debateIdx) {
    const round = (state.rounds || [])[roundIdx];
    if (!round) return;
    const current = round.rooms?.[debateIdx] || `Room ${debateIdx + 1}`;
    const next = prompt('Rename room:', current);
    if (!next?.trim() || next.trim() === current) return;
    if (!Array.isArray(round.rooms)) {
        round.rooms = (round.debates || []).map((_, i) =>
            `Room ${i + 1}`
        );
    }
    round.rooms[debateIdx] = next.trim();
    saveNow();
    showNotification(`Room renamed to "${next.trim()}"`, 'success');
    displayRounds();
}

// ── Delete a single debate/room from a round ──────────────────────────────────
function deleteDebate(roundIdx, debateIdx) {
    const round = (state.rounds || [])[roundIdx];
    if (!round) return;
    const roomLabel = round.rooms?.[debateIdx] || `Room ${debateIdx + 1}`;
    const d = round.debates?.[debateIdx];
    if (d?.entered) {
        if (!confirm(`"${roomLabel}" already has results entered. Delete it anyway? This cannot be undone.`)) return;
    } else {
        if (!confirm(`Delete "${roomLabel}"? The two teams will be unassigned.`)) return;
    }
    round.debates.splice(debateIdx, 1);
    if (Array.isArray(round.rooms)) round.rooms.splice(debateIdx, 1);
    saveNow();
    showNotification(`${roomLabel} removed`, 'info');
    displayRounds();
}
function addDebate(roundIdx, debateIdx) {
    const round = (state.rounds || [])[roundIdx];
    if (!round) return;

    // New room always goes after the clicked room; ballots already submitted are no barrier
    const newIdx = debateIdx + 1;
    const newRoomNumber = round.debates.length + 1;
    const newRoomLabel = `Room ${newRoomNumber}`;

    if (!confirm(`Add "${newRoomLabel}" after Room ${debateIdx + 1}? Teams will be unassigned.`)) return;

    // Build a blank debate matching the round's format
    let newDebate;
    if (round.format === 'bp') {
        newDebate = { format: 'bp', og: null, oo: null, cg: null, co: null, entered: false, panel: [] };
    } else if (round.format === 'speech') {
        newDebate = { format: 'speech', roomSpeakers: [], entered: false, panel: [], speechResults: null };
    } else {
        newDebate = { gov: null, opp: null, entered: false, panel: [], attendance: { gov: true, opp: true }, sidesPending: round.sideMethod === 'manual' };
    }

    // Insert debate and a matching persistent room label
    round.debates.splice(newIdx, 0, newDebate);
    if (!Array.isArray(round.rooms)) {
        round.rooms = round.debates.map((_, i) => `Room ${i + 1}`);
    } else {
        round.rooms.splice(newIdx, 0, newRoomLabel);
    }

    saveNow();
    showNotification(`${newRoomLabel} added`, 'info');
    displayRounds();
}

window.displayRounds = displayRounds;
window.showEnterResults = showEnterResults;
window.submitResults = submitResults;
window.editResults = editResults;
window.viewDebateDetails = viewDebateDetails;
window.redrawRound = redrawRound;
window.swapTeams = swapTeams;
window.toggleBlindRound = toggleBlindRound;
window.toggleAttendance = toggleAttendance;
window.copyRoomURL = copyRoomURL;
window.renameRoom = renameRoom;
window.deleteDebate = deleteDebate;
window.addDebate = addDebate;
window.showMoveTeamModal = showMoveTeamModal;
window.executeMoveTeam = executeMoveTeam;
window.addJudgeToPanel = addJudgeToPanel;
window.removeJudgeFromPanel = removeJudgeFromPanel;
window.moveJudgeToPanel = moveJudgeToPanel;
window.dndJudgeDragStart = dndJudgeDragStart;
window.dndJudgeDragOver = dndJudgeDragOver;
window.dndJudgeDrop = dndJudgeDrop;
window.dndTeamDragStart = dndTeamDragStart;
window.dndTeamDragOver = dndTeamDragOver;
window.dndTeamDrop = dndTeamDrop;
window.dndDragEnd = dndDragEnd;
window.dndDragLeave = dndDragLeave;
window.showJudgeManagement = showJudgeManagement;
window.createRound = createRound;
window.renameSpeakerInBallots = renameSpeakerInBallots;

export const swapSides = swapTeams;
export const openJudgeModal = showJudgeManagement;
export const enterResults = showEnterResults;