// ============================================
// KNOCKOUT.JS - Break and elimination rounds
// BP + WSDC knockout, team-position swapping
// ============================================

import { state, save, activeTournament } from './state.js';
import { showNotification, escapeHTML, closeAllModals } from './utils.js';
import { renderStandings } from './tab.js';

// ── Format detection ───────────────────────────────────────────────────────

/** Is the active tournament British Parliamentary? */
function isBP() {
    return activeTournament()?.format === 'bp';
}

/** Is the *saved* knockout bracket BP? Falls back to the live tournament format. */
function tournamentIsBP() {
    return state.tournament?.format === 'bp' || isBP();
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getRoundName(teamCount, bp) {
    if (bp) {
        // In BP each room has 4 teams; "n teams" → n/4 rooms
        const names = { 4: 'Grand Final', 8: 'Semi-finals', 16: 'Quarter-finals', 32: 'Octo-finals', 64: 'Pre-octo-finals' };
        return names[teamCount] || `Round of ${teamCount}`;
    }
    const names = { 2: 'Grand Final', 4: 'Semi-finals', 8: 'Quarter-finals', 16: 'Octo-finals', 32: 'Pre-octo-finals', 64: 'Round of 64' };
    return names[teamCount] || `Round of ${teamCount}`;
}

function _isPowerOfTwo(n) { return n > 1 && (n & (n - 1)) === 0; }

// ── Blank pairing factories ────────────────────────────────────────────────

function _blankBPPairing(idx) {
    return {
        id: idx + 1,
        og: null, oo: null, cg: null, co: null,
        ogSeed: null, ooSeed: null, cgSeed: null, coSeed: null,
        first: null, second: null, third: null, fourth: null,
        entered: false,
        room: `Room ${String.fromCharCode(65 + idx)}`,
    };
}

function _blankWSDCPairing(idx) {
    return {
        id: idx + 1,
        gov: null, opp: null,
        govSeed: null, oppSeed: null,
        winner: null, loser: null, entered: false,
        room: `Knockout ${String.fromCharCode(65 + idx)}`,
    };
}

// ── Render break tab ───────────────────────────────────────────────────────

function renderBreak() {
    const container = document.getElementById('break');
    if (!container) return;

    const breakingTeams = state.teams.filter(t => t.broke);
    const isAdmin = state.auth?.isAuthenticated && state.auth?.currentUser?.role === 'admin';
    const bp = isBP();

    container.innerHTML = `
        ${isAdmin ? `
        <div class="section">
            <h2>⚙️ Break Settings</h2>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:15px;margin-bottom:20px;">
                <select id="break-size" style="padding:12px;">
                    ${bp ? `
                        <option value="4">Grand Final (4 teams)</option>
                        <option value="8">Semi-finals (8 teams)</option>
                        <option value="16" selected>Quarter-finals (16 teams)</option>
                        <option value="32">Octo-finals (32 teams)</option>
                        <option value="64">Pre-octo-finals (64 teams)</option>
                    ` : `
                        <option value="2">Grand Final (2 teams)</option>
                        <option value="4">Semi-finals (4 teams)</option>
                        <option value="8" selected>Quarter-finals (8 teams)</option>
                        <option value="16">Octo-finals (16 teams)</option>
                        <option value="32">Pre-octo-finals (32 teams)</option>
                        <option value="64">Round of 64 (64 teams)</option>
                    `}
                </select>
                <select id="break-criteria" style="padding:12px;">
                    <option value="wins">Wins + Points</option>
                    <option value="points">Total Points + Wins</option>
                    <option value="speaker">Speaker Avg + Wins</option>
                    <option value="adjusted">Adjusted Points (Drop Lowest)</option>
                </select>
                <label style="display:flex;align-items:center;gap:8px;padding:12px;background:#f8fafc;border-radius:8px;cursor:pointer;">
                    <input type="checkbox" id="include-eliminated"> Include Eliminated Teams
                </label>
                <button onclick="window.calculateBreak()" class="primary" style="padding:12px;">📊 Calculate Break</button>
            </div>
            ${breakingTeams.length > 0 ? `
            <button onclick="window.generateKnockout()" class="primary" style="padding:12px;margin-bottom:10px;">
                ⚔️ Start Knockout (${breakingTeams.length} teams)
            </button>` : ''}
        </div>` : `
        <div class="section">
            <h2>🏆 Break</h2>
            ${breakingTeams.length === 0 ? `
                <div style="text-align:center;padding:40px 20px;color:#64748b;">
                    <div style="font-size:48px;margin-bottom:15px;">⏳</div>
                    <p>Break has not been calculated yet. Check back soon.</p>
                </div>` : ''}
        </div>`}

        <div class="section" id="break-results" ${breakingTeams.length === 0 ? 'style="display:none"' : ''}>
            <h2>Breaking Teams</h2>
            <div id="breaking-teams-list"></div>
        </div>
    `;

    if (breakingTeams.length > 0) displayBreakingTeams();
}

function displayBreakingTeams() {
    const list = document.getElementById('breaking-teams-list');
    if (!list) return;

    const sorted = [...state.teams.filter(t => t.broke)].sort((a, b) => (a.seed || 999) - (b.seed || 999));

    list.innerHTML = `
        <table style="width:100%;border-collapse:collapse;">
            <thead>
                <tr style="background:#f8fafc;">
                    <th style="padding:12px;text-align:left;">Seed</th>
                    <th style="padding:12px;text-align:left;">Team</th>
                    <th style="padding:12px;text-align:left;">Code</th>
                    <th style="padding:12px;text-align:center;">Wins</th>
                    <th style="padding:12px;text-align:center;">Points</th>
                    <th style="padding:12px;text-align:center;">Spk Avg</th>
                </tr>
            </thead>
            <tbody>
                ${sorted.map(team => {
                    const spkrs = team.speakers.filter(s => s.substantiveCount > 0);
                    const avg = spkrs.length
                        ? (spkrs.reduce((s, x) => s + x.substantiveTotal / x.substantiveCount, 0) / spkrs.length).toFixed(2)
                        : '—';
                    return `<tr>
                        <td style="padding:12px;"><strong style="background:#f59e0b;color:white;padding:4px 12px;border-radius:40px;">#${team.seed}</strong></td>
                        <td style="padding:12px;"><strong>${escapeHTML(team.name)}</strong></td>
                        <td style="padding:12px;">${escapeHTML(team.code || '')}</td>
                        <td style="padding:12px;text-align:center;">${team.wins || 0}</td>
                        <td style="padding:12px;text-align:center;">${(team.total || 0).toFixed(1)}</td>
                        <td style="padding:12px;text-align:center;">${avg}</td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
    `;
}

// ── Calculate break ────────────────────────────────────────────────────────

function calculateBreak(breakSize, criteria, includeEliminated) {
    if (breakSize === undefined)      breakSize        = parseInt(document.getElementById('break-size')?.value);
    if (criteria === undefined)       criteria         = document.getElementById('break-criteria')?.value;
    if (includeEliminated === undefined) includeEliminated = document.getElementById('include-eliminated')?.checked;

    let eligible = includeEliminated ? state.teams : state.teams.filter(t => !t.eliminated);

    if (eligible.length < breakSize) {
        showNotification(`Only ${eligible.length} teams available. Cannot break to ${breakSize}.`, 'error');
        return;
    }

    const teamMetrics = eligible.map(team => {
        const spkrs = team.speakers.filter(s => s.substantiveCount > 0);
        const speakerAvg = spkrs.length
            ? spkrs.reduce((s, x) => s + x.substantiveTotal / x.substantiveCount, 0) / spkrs.length
            : 0;

        let adjustedTotal = team.total || 0;
        if (criteria === 'adjusted' && team.roundScores) {
            const scores = Object.values(team.roundScores);
            if (scores.length > 1) adjustedTotal = scores.reduce((a, b) => a + b, 0) - Math.min(...scores);
        }

        return { team, wins: team.wins || 0, total: team.total || 0, adjustedTotal, speakerAvg };
    });

    const sorters = {
        wins:     (a, b) => b.wins - a.wins || b.total - a.total || b.speakerAvg - a.speakerAvg,
        points:   (a, b) => b.total - a.total || b.wins - a.wins || b.speakerAvg - a.speakerAvg,
        speaker:  (a, b) => b.speakerAvg - a.speakerAvg || b.wins - a.wins || b.total - a.total,
        adjusted: (a, b) => b.adjustedTotal - a.adjustedTotal || b.wins - a.wins,
    };

    const sorted = teamMetrics.sort(sorters[criteria] || sorters.wins);

    state.teams.forEach(t => { t.broke = false; t.seed = null; });
    sorted.slice(0, breakSize).forEach((m, i) => {
        m.team.broke = true;
        m.team.seed  = i + 1;
    });

    const fmt = isBP() ? 'bp' : 'wsdc';
    if (!state.tournament) state.tournament = { active: false, bracket: [], currentRound: 0, champion: null, breakingTeams: [], format: fmt };
    state.tournament.breakingTeams = sorted.slice(0, breakSize).map(m => m.team.id);
    state.tournament.format = fmt;

    save();
    renderBreak();
    showNotification(`Top ${breakSize} teams break!`, 'success');
}

// ── Generate knockout bracket ──────────────────────────────────────────────

function generateKnockout() {
    const bp       = isBP();
    const breaking = state.teams.filter(t => t.broke).sort((a, b) => a.seed - b.seed);
    const minTeams = bp ? 4 : 2;

    if (breaking.length < minTeams) {
        showNotification(`Need at least ${minTeams} breaking teams`, 'error');
        return;
    }
    if (!_isPowerOfTwo(breaking.length)) {
        showNotification(`Breaking teams (${breaking.length}) must be a power of 2 (${bp ? '4,8,16…' : '2,4,8,16…'})`, 'error');
        return;
    }

    // Build full bracket shell
    const stages  = [];
    let   size    = breaking.length;
    const minSize = bp ? 4 : 2;
    while (size >= minSize) {
        stages.push({ name: getRoundName(size, bp), size, pairings: [], completed: false });
        size = Math.floor(size / 2);
    }

    // Seed first round
    if (bp) {
        _seedBPFirstRound(stages, breaking);
    } else {
        _seedWSDCFirstRound(stages, breaking);
    }

    // Blank TBD slots for all subsequent rounds
    for (let s = 1; s < stages.length; s++) {
        // 2 rooms/matches from the previous round merge into 1 in the next round
        const slotCount = stages[s - 1].pairings.length / 2;
        for (let p = 0; p < slotCount; p++) {
            stages[s].pairings.push(bp ? _blankBPPairing(p) : _blankWSDCPairing(p));
        }
    }

    state.tournament = {
        active: true,
        bracket: stages,
        currentRound: 0,
        champion: null,
        breakingTeams: breaking.map(t => t.id),
        format: bp ? 'bp' : 'wsdc',
    };

    save();
    renderKnockout();
    const roomWord = bp ? 'rooms' : 'matches';
    showNotification(`${stages[0].name} bracket generated — ${stages[0].pairings.length} ${roomWord}`, 'success');
}

function _seedBPFirstRound(stages, breaking) {
    // Standard BP seeding: room i gets seeds (i+1), (n/2-i), (n/2+i+1), (n-i)
    // e.g. 8 teams → Room A: 1,4,5,8  Room B: 2,3,6,7
    const n         = breaking.length;
    const roomCount = n / 4;
    for (let i = 0; i < roomCount; i++) {
        const og = breaking[i];
        const oo = breaking[n / 2 - 1 - i];
        const cg = breaking[n / 2 + i];
        const co = breaking[n - 1 - i];
        stages[0].pairings.push({
            id: i + 1,
            og: og.id, oo: oo.id, cg: cg.id, co: co.id,
            ogSeed: og.seed, ooSeed: oo.seed, cgSeed: cg.seed, coSeed: co.seed,
            first: null, second: null, third: null, fourth: null,
            entered: false,
            room: `Room ${String.fromCharCode(65 + i)}`,
        });
    }
}

function _seedWSDCFirstRound(stages, breaking) {
    const n = breaking.length;
    for (let i = 0; i < n / 2; i++) {
        stages[0].pairings.push({
            id: i + 1,
            gov: breaking[i].id,
            opp: breaking[n - 1 - i].id,
            govSeed: breaking[i].seed,
            oppSeed: breaking[n - 1 - i].seed,
            winner: null, loser: null, entered: false,
            room: `Knockout ${String.fromCharCode(65 + i)}`,
        });
    }
}

// ── Render knockout tab ────────────────────────────────────────────────────

function renderKnockout() {
    const container = document.getElementById('knockout');
    if (!container) return;
    _ensureDragStyles();

    const isAdmin = state.auth?.isAuthenticated && state.auth?.currentUser?.role === 'admin';

    if (!state.tournament?.active) {
        container.innerHTML = `
            <div class="section">
                <h2>Out Rounds</h2>
                <p style="color:#64748b;text-align:center;padding:40px;">
                    ${isAdmin ? 'Go to the Break tab to generate the bracket.' : 'The knockout bracket has not started yet.'}
                </p>
            </div>`;
        return;
    }

    const { bracket, currentRound, champion } = state.tournament;

    container.innerHTML = `
        ${champion ? `
        <div style="background:linear-gradient(145deg,#fef9e7,#fff);border:4px solid #f59e0b;padding:24px;border-radius:16px;margin-bottom:24px;text-align:center;">
            <div style="font-size:48px;">🏆</div>
            <h2 style="color:#f59e0b;margin:8px 0;">Tournament Champion</h2>
            <p style="font-size:24px;font-weight:700;">${escapeHTML(state.teams.find(t => t.id === champion)?.name || '—')}</p>
        </div>` : ''}

        <div style="display:grid;gap:24px;">
            ${bracket.map((round, roundIdx) => {
                const isCurrent  = roundIdx === currentRound;
                const isComplete = round.pairings.length > 0 && round.pairings.every(p => p.entered);

                return `
                <div class="section" style="${isCurrent ? 'border:2px solid #f59e0b;' : ''}">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
                        <h2 style="margin:0;">${escapeHTML(round.name)}</h2>
                        <span style="background:${isComplete ? '#2e7d32' : isCurrent ? '#f59e0b' : '#64748b'};color:white;padding:4px 14px;border-radius:40px;font-size:13px;">
                            ${isComplete ? '✅ Complete' : isCurrent ? '⚡ Current' : '⏳ Pending'}
                        </span>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;">
                        ${round.pairings.map((p, pIdx) => _renderPairingCard(p, roundIdx, pIdx, isCurrent, isAdmin)).join('')}
                    </div>
                </div>`;
            }).join('')}
        </div>

        ${isAdmin ? `
        <div style="margin-top:20px;text-align:center;">
            <button onclick="window.resetTournament()" class="danger" style="padding:12px 24px;">🔄 Reset Tournament</button>
        </div>` : ''}
    `;
}

// ── Pairing card rendering ─────────────────────────────────────────────────

function _renderPairingCard(p, roundIdx, pIdx, isCurrent, isAdmin) {
    return tournamentIsBP()
        ? _renderBPPairingCard(p, roundIdx, pIdx, isCurrent, isAdmin)
        : _renderWSDCPairingCard(p, roundIdx, pIdx, isCurrent, isAdmin);
}

const _BP_POSITIONS = [
    { key: 'og', label: 'OG', fullLabel: 'Opening Government', govSide: true  },
    { key: 'oo', label: 'OO', fullLabel: 'Opening Opposition',  govSide: false },
    { key: 'cg', label: 'CG', fullLabel: 'Closing Government',  govSide: true  },
    { key: 'co', label: 'CO', fullLabel: 'Closing Opposition',  govSide: false },
];

function _renderBPPairingCard(p, roundIdx, pIdx, isCurrent, isAdmin) {
    const cells = _BP_POSITIONS.map(pos => {
        const team = p[pos.key] ? state.teams.find(t => t.id === p[pos.key]) : null;
        const seed = p[`${pos.key}Seed`];
        let place = null, bg = 'white';
        if (p.entered) {
            if      (p.first  == p[pos.key]) { place = '🥇 1st'; bg = '#fef9e7'; }
            else if (p.second == p[pos.key]) { place = '🥈 2nd'; bg = '#e6f4ea'; }
            else if (p.third  == p[pos.key]) { place = '🥉 3rd'; bg = '#fff7ed'; }
            else if (p.fourth == p[pos.key]) { place = '4th';    bg = '#fef2f2'; }
        }
        return { ...pos, team, seed, place, bg };
    });

    const allSet   = cells.every(c => c.team);
    const canEnter = isAdmin && !p.entered && isCurrent && allSet;
    const canSwap  = isAdmin && !p.entered;
    const canDrag  = isAdmin && !p.entered;

    const advancers = p.entered
        ? [p.first, p.second].map(id => state.teams.find(t => t.id == id)?.name).filter(Boolean)
        : [];

    const seedStr = cells.filter(c => c.seed).map(c => `#${c.seed}`).join(' · ');

    return `
    <div style="background:#f8fafc;padding:16px;border-radius:12px;border-left:4px solid ${p.entered ? '#2e7d32' : '#f59e0b'};">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;flex-wrap:wrap;">
            <span style="font-weight:700;font-size:15px;">${escapeHTML(p.room)}</span>
            <div style="display:flex;gap:6px;align-items:center;">
                ${canSwap ? `
                <button onclick="window.swapTeamPositions(${roundIdx},${pIdx})"
                    style="font-size:11px;padding:3px 9px;border-radius:6px;border:1px solid #cbd5e1;background:white;cursor:pointer;color:#475569;font-weight:600;">
                    ⇄ Swap
                </button>` : ''}
                <span style="color:#94a3b8;font-size:12px;">${seedStr}</span>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
            ${cells.map(c => `
            <div data-ko-slot
                style="padding:10px;background:${c.bg};border-radius:8px;border:1px solid #e2e8f0;${canDrag && c.team ? 'cursor:grab;' : ''}"
                ${canDrag && c.team ? `
                    draggable="true"
                    ondragstart="window._koOnDragStart(event,${roundIdx},${pIdx},'${c.key}')"
                    ondragover="window._koOnDragOver(event)"
                    ondragleave="window._koOnDragLeave(event)"
                    ondrop="window._koOnDrop(event,${roundIdx},${pIdx},'${c.key}')"
                ` : (canDrag ? `
                    ondragover="window._koOnDragOver(event)"
                    ondragleave="window._koOnDragLeave(event)"
                    ondrop="window._koOnDrop(event,${roundIdx},${pIdx},'${c.key}')"
                ` : '')}>
                <div style="font-size:9px;font-weight:900;letter-spacing:.8px;color:${c.govSide ? '#1d4ed8' : '#b91c1c'};margin-bottom:3px;">${c.label}</div>
                <div style="font-weight:700;font-size:13px;line-height:1.3;">
                    ${c.team ? escapeHTML(c.team.name) : '<span style="color:#94a3b8;font-weight:400;font-size:12px;">TBD</span>'}
                </div>
                ${c.seed ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px;">Seed #${c.seed}</div>` : ''}
                ${c.place ? `<div style="font-size:11px;font-weight:700;margin-top:4px;color:#374151;">${c.place}</div>` : ''}
                ${canDrag && c.team ? `<div style="font-size:9px;color:#cbd5e1;margin-top:3px;">drag to reposition</div>` : ''}
            </div>`).join('')}
        </div>
        ${canEnter ? `
        <button onclick="window.enterKnockoutResult(${roundIdx},${pIdx})" class="primary" style="width:100%;padding:10px;">
            ✏️ Enter Results
        </button>` : ''}
        ${advancers.length === 2 ? `
        <div style="padding:8px;background:#e6f4ea;border-radius:8px;text-align:center;font-size:13px;margin-top:4px;">
            🥇 <strong>${escapeHTML(advancers[0])}</strong> &amp; 🥈 <strong>${escapeHTML(advancers[1])}</strong> advance
        </div>` : ''}
    </div>`;
}

function _renderWSDCPairingCard(p, roundIdx, pIdx, isCurrent, isAdmin) {
    const gov        = p.gov ? state.teams.find(t => t.id === p.gov) : null;
    const opp        = p.opp ? state.teams.find(t => t.id === p.opp) : null;
    const winnerTeam = p.winner ? state.teams.find(t => t.id === p.winner) : null;

    const govName = gov ? escapeHTML(gov.name) : '<span style="color:#94a3b8">TBD</span>';
    const oppName = opp ? escapeHTML(opp.name) : '<span style="color:#94a3b8">TBD</span>';
    const canSwap = isAdmin && !p.entered && gov && opp;
    const canDrag = isAdmin && !p.entered;

    const _wsdcSlot = (side, team, name, seed, isWinner) => `
        <div data-ko-slot
            style="flex:1;text-align:center;padding:10px;background:${isWinner ? '#e6f4ea' : 'white'};border-radius:8px;border:1px solid #e2e8f0;${canDrag && team ? 'cursor:grab;' : ''}"
            ${canDrag ? `
                ${team ? `draggable="true" ondragstart="window._koOnDragStart(event,${roundIdx},${pIdx},'${side}')"` : ''}
                ondragover="window._koOnDragOver(event)"
                ondragleave="window._koOnDragLeave(event)"
                ondrop="window._koOnDrop(event,${roundIdx},${pIdx},'${side}')"
            ` : ''}>
            <div style="font-size:9px;font-weight:900;letter-spacing:.8px;color:${side === 'gov' ? '#1d4ed8' : '#b91c1c'};margin-bottom:2px;">${side.toUpperCase()}</div>
            <div style="font-weight:700;">${name}</div>
            ${seed ? `<div style="font-size:11px;color:#64748b;">Seed #${seed}</div>` : ''}
            ${isWinner ? '<div style="color:#2e7d32;font-size:12px;font-weight:600;margin-top:3px;">✓ Winner</div>' : ''}
            ${canDrag && team ? `<div style="font-size:9px;color:#cbd5e1;margin-top:3px;">drag to reposition</div>` : ''}
        </div>`;

    return `
    <div style="background:#f8fafc;padding:16px;border-radius:12px;border-left:4px solid ${p.entered ? '#2e7d32' : '#f59e0b'};">
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-weight:600;">${escapeHTML(p.room)}</span>
            <div style="display:flex;gap:6px;align-items:center;">
                ${canSwap ? `
                <button onclick="window.swapTeamPositions(${roundIdx},${pIdx})"
                    style="font-size:11px;padding:3px 9px;border-radius:6px;border:1px solid #cbd5e1;background:white;cursor:pointer;color:#475569;font-weight:600;">
                    ⇄ Swap
                </button>` : ''}
                <span style="color:#64748b;font-size:13px;">${p.govSeed ? `#${p.govSeed}` : '?'} vs ${p.oppSeed ? `#${p.oppSeed}` : '?'}</span>
            </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
            ${_wsdcSlot('gov', gov, govName, p.govSeed, p.winner === p.gov && !!p.gov)}
            <div style="font-weight:700;color:#64748b;">VS</div>
            ${_wsdcSlot('opp', opp, oppName, p.oppSeed, p.winner === p.opp && !!p.opp)}
        </div>
        ${isAdmin && !p.entered && isCurrent && gov && opp ? `
        <button onclick="window.enterKnockoutResult(${roundIdx},${pIdx})" class="primary" style="width:100%;padding:10px;">
            Select Winner
        </button>` : ''}
        ${p.entered && winnerTeam ? `
        <div style="margin-top:8px;padding:8px;background:#e6f4ea;border-radius:8px;text-align:center;font-size:13px;">
            <strong>${escapeHTML(winnerTeam.name)}</strong> advances
        </div>` : ''}
    </div>`;
}

// ── Drag-and-drop ──────────────────────────────────────────────────────────

/**
 * Called on dragstart from a team slot.
 * Stores {roundIdx, pIdx, posKey} in the dataTransfer so the drop handler
 * knows where the drag originated.
 */
function _onKnockoutDragStart(event, roundIdx, pIdx, posKey) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify({ roundIdx, pIdx, posKey }));
    // Slight delay so the drag ghost renders before we visually dim the source
    setTimeout(() => {
        const el = event.target.closest('[data-ko-slot]');
        if (el) el.classList.add('ko-dragging');
    }, 0);
}

function _onKnockoutDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const slot = event.target.closest('[data-ko-slot]');
    if (slot) slot.classList.add('ko-drag-over');
}

function _onKnockoutDragLeave(event) {
    const slot = event.target.closest('[data-ko-slot]');
    if (slot) slot.classList.remove('ko-drag-over');
}

function _onKnockoutDrop(event, roundIdx, pIdx, posKey) {
    event.preventDefault();

    // Clean up any lingering drag-over highlights
    document.querySelectorAll('.ko-drag-over').forEach(el => el.classList.remove('ko-drag-over'));
    document.querySelectorAll('.ko-dragging').forEach(el => el.classList.remove('ko-dragging'));

    let src;
    try { src = JSON.parse(event.dataTransfer.getData('text/plain')); }
    catch { return; }

    // Dropped onto itself — nothing to do
    if (src.roundIdx === roundIdx && src.pIdx === pIdx && src.posKey === posKey) return;

    const srcPairing  = state.tournament.bracket[src.roundIdx].pairings[src.pIdx];
    const dstPairing  = state.tournament.bracket[roundIdx].pairings[pIdx];

    if (srcPairing.entered || dstPairing.entered) {
        showNotification('Cannot move teams after a result has been entered', 'error');
        return;
    }

    // Swap the team ids and seeds between the two slots
    const tmpId   = dstPairing[posKey];
    const tmpSeed = dstPairing[`${posKey}Seed`];

    dstPairing[posKey]             = srcPairing[src.posKey];
    dstPairing[`${posKey}Seed`]   = srcPairing[`${src.posKey}Seed`];

    srcPairing[src.posKey]             = tmpId;
    srcPairing[`${src.posKey}Seed`]   = tmpSeed;

    save();
    renderKnockout();
    showNotification('Teams repositioned', 'success');
}

/** Inject the shared drag-and-drop CSS once into <head>. */
function _ensureDragStyles() {
    if (document.getElementById('ko-drag-styles')) return;
    const style = document.createElement('style');
    style.id = 'ko-drag-styles';
    style.textContent = `
        [data-ko-slot][draggable="true"] { cursor: grab; transition: opacity .15s, box-shadow .15s; }
        [data-ko-slot][draggable="true"]:hover { box-shadow: 0 0 0 2px #f59e0b88; }
        [data-ko-slot].ko-dragging  { opacity: .4; }
        [data-ko-slot].ko-drag-over { outline: 2px dashed #f59e0b; background: #fef9e7 !important; }
    `;
    document.head.appendChild(style);
}

// ── Swap team positions ────────────────────────────────────────────────────

function swapTeamPositions(roundIdx, pIdx) {
    const pairing = state.tournament.bracket[roundIdx].pairings[pIdx];
    if (pairing.entered) {
        showNotification('Cannot swap positions after a result has been entered', 'error');
        return;
    }

    if (tournamentIsBP()) {
        _openBPSwapModal(roundIdx, pIdx);
    } else {
        // WSDC: flip gov ↔ opp directly, no modal needed
        [pairing.gov,     pairing.opp    ] = [pairing.opp,     pairing.gov    ];
        [pairing.govSeed, pairing.oppSeed] = [pairing.oppSeed, pairing.govSeed];
        save();
        renderKnockout();
        showNotification('GOV / OPP positions swapped', 'success');
    }
}

function _openBPSwapModal(roundIdx, pIdx) {
    const pairing = state.tournament.bracket[roundIdx].pairings[pIdx];

    // Build team option list from the 4 currently assigned teams
    const teamOptions = _BP_POSITIONS
        .map(pos => ({ id: pairing[pos.key], seed: pairing[`${pos.key}Seed`], name: state.teams.find(t => t.id === pairing[pos.key])?.name }))
        .filter(t => t.id != null);

    closeAllModals();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = e => { if (e.target === overlay) closeAllModals(); };

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.maxWidth = '480px';
    modal.innerHTML = `
        <h2 style="margin-top:0;">⇄ Rearrange BP Positions</h2>
        <p style="color:#64748b;font-size:14px;">Reassign which team occupies each position.</p>
        <div style="display:grid;gap:12px;margin:16px 0;">
            ${_BP_POSITIONS.map(pos => `
            <div style="display:flex;align-items:center;gap:12px;">
                <div style="width:190px;flex-shrink:0;">
                    <span style="font-size:10px;font-weight:900;letter-spacing:.6px;color:${pos.govSide ? '#1d4ed8' : '#b91c1c'};">${pos.label}</span>
                    <div style="font-size:12px;color:#64748b;">${pos.fullLabel}</div>
                </div>
                <select id="swap-${pos.key}" style="flex:1;padding:8px;border-radius:6px;border:1px solid #e2e8f0;font-size:13px;">
                    ${teamOptions.map(t => `
                    <option value="${t.id}" ${t.id == pairing[pos.key] ? 'selected' : ''}>
                        ${escapeHTML(t.name || '?')}${t.seed ? ` (#${t.seed})` : ''}
                    </option>`).join('')}
                </select>
            </div>`).join('')}
        </div>
        <div id="swap-error" style="color:#dc2626;margin-bottom:10px;display:none;font-size:13px;"></div>
        <div style="display:flex;gap:10px;">
            <button onclick="window.applyBPSwap(${roundIdx},${pIdx})" class="primary" style="flex:2;padding:12px;">✅ Apply</button>
            <button onclick="window.closeAllModals()" class="secondary" style="flex:1;padding:12px;">Cancel</button>
        </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

function applyBPSwap(roundIdx, pIdx) {
    const pairing = state.tournament.bracket[roundIdx].pairings[pIdx];

    const newAssign = {};
    for (const pos of _BP_POSITIONS) {
        const el = document.getElementById(`swap-${pos.key}`);
        newAssign[pos.key] = el ? (isNaN(parseInt(el.value)) ? el.value : parseInt(el.value)) : null;
    }

    // Validate: each of the 4 teams appears in exactly one position
    const vals = Object.values(newAssign).filter(Boolean);
    if (new Set(vals).size !== _BP_POSITIONS.length || vals.length !== _BP_POSITIONS.length) {
        const err = document.getElementById('swap-error');
        if (err) { err.style.display = 'block'; err.textContent = 'Each team must appear in exactly one position'; }
        return;
    }

    // Preserve the seed mapping by team id
    const seedOf = {};
    _BP_POSITIONS.forEach(pos => { if (pairing[pos.key] != null) seedOf[pairing[pos.key]] = pairing[`${pos.key}Seed`]; });

    _BP_POSITIONS.forEach(pos => {
        pairing[pos.key]             = newAssign[pos.key];
        pairing[`${pos.key}Seed`]   = seedOf[newAssign[pos.key]] ?? null;
    });

    save();
    closeAllModals();
    renderKnockout();
    showNotification('Positions updated', 'success');
}

// ── Enter / submit knockout result ─────────────────────────────────────────

function enterKnockoutResult(roundIndex, pairingIndex) {
    if (tournamentIsBP()) {
        _enterBPResult(roundIndex, pairingIndex);
    } else {
        _enterWSDCResult(roundIndex, pairingIndex);
    }
}

// BP results modal ──────────────────────────────────────────────────────────

function _enterBPResult(roundIndex, pairingIndex) {
    const round   = state.tournament.bracket[roundIndex];
    const pairing = round.pairings[pairingIndex];

    const slots = _BP_POSITIONS.map(pos => ({
        key:   pos.key,
        label: pos.label,
        gov:   pos.govSide,
        team:  state.teams.find(t => t.id === pairing[pos.key]),
        seed:  pairing[`${pos.key}Seed`],
    })).filter(s => s.team);

    if (slots.length < 4) {
        showNotification('All 4 team positions must be filled before entering results', 'error');
        return;
    }

    // Track which team ids are marked as advancing (1 for Grand Final, 2 otherwise)
    const isLastRound = roundIndex === state.tournament.bracket.length - 1;
    const maxPicks    = isLastRound ? 1 : 2;
    window._bpAdvancing    = [];
    window._bpAdvancingMax = maxPicks;

    closeAllModals();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = e => { if (e.target === overlay) { window._bpAdvancing = []; closeAllModals(); } };

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.maxWidth = '460px';
    modal.innerHTML = `
        <h2 style="margin-top:0;">${isLastRound ? '🏆 Grand Final' : '✏️ Enter Results'}</h2>
        <p style="color:#64748b;font-size:14px;">${escapeHTML(round.name)} — ${escapeHTML(pairing.room)}</p>
        <p style="font-size:13px;color:#64748b;margin-top:0;">${isLastRound
            ? 'Select the <strong>winning team</strong>.'
            : 'Select the <strong>2 teams that advance</strong>. The rest are eliminated.'}</p>
        <div id="bp-team-cards" style="margin:16px 0;display:grid;gap:10px;">
            ${slots.map(s => `
            <div id="bp-card-${s.key}"
                onclick="window._bpToggleAdvancing('${s.key}', ${s.team.id})"
                style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:#f8fafc;border-radius:10px;border:2px solid #e2e8f0;cursor:pointer;transition:all .15s;user-select:none;gap:12px;">
                <div style="min-width:0;flex:1;">
                    <div style="font-size:9px;font-weight:900;letter-spacing:.6px;color:${s.gov ? '#1d4ed8' : '#b91c1c'};">${s.label}</div>
                    <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(s.team.name)}</div>
                    <div style="font-size:11px;color:#94a3b8;">Seed #${s.seed || '?'}</div>
                </div>
                <div id="bp-badge-${s.key}" style="font-size:22px;opacity:.25;">${isLastRound ? '🏆' : '✅'}</div>
            </div>`).join('')}
        </div>
        <div id="bp-counter" style="text-align:center;font-size:13px;color:#64748b;margin-bottom:12px;">
            ${isLastRound ? 'No winner selected' : '0 / 2 advancing selected'}
        </div>
        <div id="bp-error" style="color:#dc2626;margin-bottom:10px;display:none;font-size:13px;"></div>
        <div style="display:flex;gap:10px;">
            <button onclick="window.submitKnockoutResult(${roundIndex},${pairingIndex})" class="primary" style="flex:2;padding:12px;">Submit</button>
            <button onclick="window._bpAdvancing=[];window.closeAllModals()" class="secondary" style="flex:1;padding:12px;">Cancel</button>
        </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

/** Toggle a team card's advancing state (respects window._bpAdvancingMax). */
window._bpToggleAdvancing = function(posKey, teamId) {
    const maxPicks = window._bpAdvancingMax || 2;
    const isFinal  = maxPicks === 1;
    const idx   = window._bpAdvancing.indexOf(teamId);
    const card  = document.getElementById(`bp-card-${posKey}`);
    const badge = document.getElementById(`bp-badge-${posKey}`);

    if (idx !== -1) {
        // Deselect
        window._bpAdvancing.splice(idx, 1);
        card.style.borderColor = '#e2e8f0';
        card.style.background  = '#f8fafc';
        badge.style.opacity    = '.25';
    } else {
        if (window._bpAdvancing.length >= maxPicks) {
            const err = document.getElementById('bp-error');
            if (err) {
                err.style.display = 'block';
                err.textContent = isFinal
                    ? 'Only 1 winner can be selected — deselect the current choice first.'
                    : 'Only 2 teams can advance — deselect one first.';
            }
            return;
        }
        window._bpAdvancing.push(teamId);
        card.style.borderColor = isFinal ? '#f59e0b' : '#22c55e';
        card.style.background  = isFinal ? '#fef9e7' : '#f0fdf4';
        badge.style.opacity    = '1';
    }

    const err = document.getElementById('bp-error');
    if (err) err.style.display = 'none';

    const counter = document.getElementById('bp-counter');
    if (counter) {
        counter.textContent = isFinal
            ? (window._bpAdvancing.length === 1 ? '🏆 Winner selected' : 'No winner selected')
            : `${window._bpAdvancing.length} / 2 advancing selected`;
    }
};

// WSDC results modal ────────────────────────────────────────────────────────

function _enterWSDCResult(roundIndex, pairingIndex) {
    const round   = state.tournament.bracket[roundIndex];
    const pairing = round.pairings[pairingIndex];
    const gov     = state.teams.find(t => t.id === pairing.gov);
    const opp     = state.teams.find(t => t.id === pairing.opp);

    if (!gov || !opp) { showNotification('Both teams must be set before entering a result', 'error'); return; }

    closeAllModals();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = e => { if (e.target === overlay) closeAllModals(); };

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.maxWidth = '400px';
    modal.innerHTML = `
        <h2 style="margin-top:0;">Select Winner</h2>
        <p style="color:#64748b;">${escapeHTML(round.name)} — ${escapeHTML(pairing.room)}</p>
        <div style="margin:20px 0;display:flex;flex-direction:column;gap:10px;">
            <label style="display:flex;align-items:center;gap:10px;padding:15px;background:#f8fafc;border-radius:8px;cursor:pointer;">
                <input type="radio" name="ko-winner" value="${gov.id}" style="width:20px;height:20px;">
                <div>
                    <div style="font-size:9px;font-weight:900;color:#1d4ed8;letter-spacing:.6px;">GOV</div>
                    <strong>${escapeHTML(gov.name)}</strong> <span style="color:#64748b;">Seed #${pairing.govSeed || '?'}</span>
                </div>
            </label>
            <label style="display:flex;align-items:center;gap:10px;padding:15px;background:#f8fafc;border-radius:8px;cursor:pointer;">
                <input type="radio" name="ko-winner" value="${opp.id}" style="width:20px;height:20px;">
                <div>
                    <div style="font-size:9px;font-weight:900;color:#b91c1c;letter-spacing:.6px;">OPP</div>
                    <strong>${escapeHTML(opp.name)}</strong> <span style="color:#64748b;">Seed #${pairing.oppSeed || '?'}</span>
                </div>
            </label>
        </div>
        <div id="ko-error" style="color:#dc2626;margin-bottom:10px;display:none;"></div>
        <div style="display:flex;gap:10px;">
            <button onclick="window.submitKnockoutResult(${roundIndex},${pairingIndex})" class="primary" style="flex:2;padding:12px;">Submit</button>
            <button onclick="window.closeAllModals()" class="secondary" style="flex:1;padding:12px;">Cancel</button>
        </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

// ── Submit result ──────────────────────────────────────────────────────────

function submitKnockoutResult(roundIndex, pairingIndex) {
    if (tournamentIsBP()) {
        _submitBPResult(roundIndex, pairingIndex);
    } else {
        _submitWSDCResult(roundIndex, pairingIndex);
    }
}

function _submitBPResult(roundIndex, pairingIndex) {
    const tournament = state.tournament;
    const bracket    = tournament.bracket;
    const round      = bracket[roundIndex];
    const pairing    = round.pairings[pairingIndex];

    // Read the advancing teams selected via the toggle UI
    const advancing  = window._bpAdvancing || [];
    const isLastRound = roundIndex === bracket.length - 1;
    const required   = isLastRound ? 1 : 2;

    if (advancing.length !== required) {
        _showModalError('bp-error', isLastRound ? 'Select the winning team' : 'Select exactly 2 advancing teams');
        return;
    }

    // The teams not in advancing are eliminated
    const allIds    = _BP_POSITIONS.map(pos => pairing[pos.key]).filter(id => id != null);
    const remaining = allIds.filter(id => !advancing.includes(id));

    // Map to first/second/third/fourth
    const placeToId = {
        1: advancing[0],
        2: advancing[1] ?? remaining[0] ?? null,   // for finals, 2nd is first of the rest
        3: advancing[1] != null ? remaining[0] ?? null : remaining[1] ?? null,
        4: advancing[1] != null ? remaining[1] ?? null : remaining[2] ?? null,
    };

    // Reverse any previous entry
    if (pairing.entered) {
        [pairing.first, pairing.second].forEach(tid => {
            const t = state.teams.find(tm => tm.id == tid);
            if (t) { if (t.tournamentWins > 0) t.tournamentWins -= 1; t.eliminated = false; }
        });
        [pairing.third, pairing.fourth].forEach(tid => {
            const t = state.teams.find(tm => tm.id == tid);
            if (t) { if (t.tournamentLosses > 0) t.tournamentLosses -= 1; t.eliminated = false; }
        });
    }

    pairing.first  = placeToId[1];
    pairing.second = placeToId[2];
    pairing.third  = placeToId[3];
    pairing.fourth = placeToId[4];
    pairing.entered = true;

    // Update team stats
    [pairing.first, pairing.second].forEach(tid => {
        const t = state.teams.find(tm => tm.id == tid);
        if (t) { t.tournamentWins = (t.tournamentWins || 0) + 1; t.eliminated = false; }
    });
    [pairing.third, pairing.fourth].forEach(tid => {
        const t = state.teams.find(tm => tm.id == tid);
        if (t) { t.tournamentLosses = (t.tournamentLosses || 0) + 1; t.eliminated = true; }
    });

    // Advance 1st & 2nd to next round (isLastRound already declared above)
    if (!isLastRound) {
        const nextRound  = bracket[roundIndex + 1];
        const nextSlot   = Math.floor(pairingIndex / 2);
        const isEven     = pairingIndex % 2 === 0;
        const firstTeam  = state.teams.find(t => t.id == pairing.first);
        const secondTeam = state.teams.find(t => t.id == pairing.second);

        if (!nextRound.pairings[nextSlot]) nextRound.pairings[nextSlot] = _blankBPPairing(nextSlot);

        // Even-indexed rooms fill OG & CG; odd-indexed fill OO & CO
        if (isEven) {
            nextRound.pairings[nextSlot].og     = pairing.first;
            nextRound.pairings[nextSlot].ogSeed = firstTeam?.seed  ?? null;
            nextRound.pairings[nextSlot].cg     = pairing.second;
            nextRound.pairings[nextSlot].cgSeed = secondTeam?.seed ?? null;
        } else {
            nextRound.pairings[nextSlot].oo     = pairing.first;
            nextRound.pairings[nextSlot].ooSeed = firstTeam?.seed  ?? null;
            nextRound.pairings[nextSlot].co     = pairing.second;
            nextRound.pairings[nextSlot].coSeed = secondTeam?.seed ?? null;
        }
    } else {
        tournament.champion = pairing.first;
    }

    round.completed = round.pairings.every(p => p.entered);
    if (round.completed && !isLastRound) tournament.currentRound = roundIndex + 1;

    save();
    window._bpAdvancing = [];
    closeAllModals();
    renderKnockout();
    if (typeof renderStandings === 'function') renderStandings();

    const first  = state.teams.find(t => t.id == pairing.first);
    const second = state.teams.find(t => t.id == pairing.second);
    const msg    = isLastRound
        ? `🏆 ${first?.name} is the Champion!`
        : `${first?.name} (1st) & ${second?.name} (2nd) advance!`;
    showNotification(msg, 'success');
}

function _submitWSDCResult(roundIndex, pairingIndex) {
    const tournament = state.tournament;
    const bracket    = tournament.bracket;
    const round      = bracket[roundIndex];
    const pairing    = round.pairings[pairingIndex];

    const radio = document.querySelector('input[name="ko-winner"]:checked');
    if (!radio) { _showModalError('ko-error', 'Please select a winner'); return; }

    // Reverse previous entry if re-submitting
    if (pairing.entered) {
        const prevWinner = state.teams.find(t => t.id == pairing.winner);
        const prevLoser  = state.teams.find(t => t.id == pairing.loser);
        if (prevWinner && prevWinner.tournamentWins  > 0) prevWinner.tournamentWins  -= 1;
        if (prevLoser  && prevLoser.tournamentLosses > 0) prevLoser.tournamentLosses -= 1;
        if (prevLoser)  prevLoser.eliminated = false;
    }

    const rawId    = radio.value;
    const winnerId = isNaN(parseInt(rawId)) ? rawId : parseInt(rawId);
    const loserId  = pairing.gov == winnerId ? pairing.opp : pairing.gov;

    const winner = state.teams.find(t => t.id == winnerId);
    const loser  = state.teams.find(t => t.id == loserId);

    pairing.winner  = winnerId;
    pairing.loser   = loserId;
    pairing.entered = true;

    if (winner) { winner.tournamentWins   = (winner.tournamentWins   || 0) + 1; winner.eliminated = false; }
    if (loser)  { loser.tournamentLosses  = (loser.tournamentLosses  || 0) + 1; loser.eliminated  = true;  }

    const isLastRound = roundIndex === bracket.length - 1;
    if (!isLastRound) {
        const nextRound     = bracket[roundIndex + 1];
        const nextSlotIndex = Math.floor(pairingIndex / 2);
        const side          = pairingIndex % 2 === 0 ? 'gov' : 'opp';

        if (!nextRound.pairings[nextSlotIndex]) nextRound.pairings[nextSlotIndex] = _blankWSDCPairing(nextSlotIndex);

        nextRound.pairings[nextSlotIndex][side]           = winnerId;
        nextRound.pairings[nextSlotIndex][`${side}Seed`] = winner?.seed ?? null;
    } else {
        tournament.champion = winnerId;
    }

    round.completed = round.pairings.every(p => p.entered);
    if (round.completed && !isLastRound) tournament.currentRound = roundIndex + 1;

    save();
    closeAllModals();
    renderKnockout();
    if (typeof renderStandings === 'function') renderStandings();

    const msg = isLastRound
        ? `🏆 ${winner?.name} is the Champion!`
        : `${winner?.name} advances! ${loser?.name} eliminated.`;
    showNotification(msg, 'success');
}

function _showModalError(id, msg) {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'block'; el.textContent = msg; }
}

// ── Reset tournament ───────────────────────────────────────────────────────

function resetTournament() {
    if (!confirm('Reset tournament? Clears all knockout results but keeps preliminary data.')) return;

    state.teams.forEach(t => {
        t.broke = false; t.seed = null;
        t.tournamentWins = 0; t.tournamentLosses = 0;
        t.eliminated = false;
    });

    state.tournament = { active: false, bracket: [], currentRound: 0, champion: null, breakingTeams: [] };

    save();
    renderBreak();
    renderKnockout();
    renderStandings();
    showNotification('Tournament reset', 'info');
}

// ── Exports ────────────────────────────────────────────────────────────────

export {
    renderBreak,
    displayBreakingTeams,
    calculateBreak,
    generateKnockout,
    renderKnockout,
    enterKnockoutResult,
    submitKnockoutResult,
    swapTeamPositions,
    applyBPSwap,
    resetTournament,
};

// Expose drag-and-drop handlers globally so inline HTML event attributes can reach them
window._koOnDragStart = _onKnockoutDragStart;
window._koOnDragOver  = _onKnockoutDragOver;
window._koOnDragLeave = _onKnockoutDragLeave;
window._koOnDrop      = _onKnockoutDrop;