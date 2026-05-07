// ============================================
// FILE-MANAGEMENT
// ============================================

// IMPORT needed functions from other modules
import { state, save } from './state.js';
import { showNotification, escapeHTML, updatePublicCounts } from './utils.js';
import { displayTeams } from './teams.js';
import { displayJudges } from './judges.js';


function renderImport() {
    const container = document.getElementById('import');
    if (!container) return;
    
    container.innerHTML = `
        <div class="section">
            <h2>Export Data</h2>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button onclick="window.exportData()" class="primary" style="padding: 12px 24px; background: #1a73e8; color: white; border: none; border-radius: 8px; cursor: pointer;">
                    Export Tournament (JSON)
                </button>
                <button onclick="window.exportStandings()" class="secondary" style="padding: 12px 24px; background: #e2e8f0; border: none; border-radius: 8px; cursor: pointer;">
                    Export Standings (CSV)
                </button>
                <button onclick="window.exportSpeakerStandings()" class="secondary" style="padding: 12px 24px; background: #e2e8f0; border: none; border-radius: 8px; cursor: pointer;">
                    Export Speakers (CSV)
                </button>
            </div>
        </div>
        
        <div class="section">
            <h2>Import Teams</h2>
            <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 16px; margin-bottom: 16px;">
                <p style="margin: 0 0 8px; font-weight: 600; color: #1e40af;">📄 Supported formats</p>
                <p style="margin: 0 0 6px; color: #1e293b; font-size: 13px;">
                    <strong>Basic</strong> — <code>Team Name, Speaker 1, Speaker 2, Speaker 3</code>
                </p>
                <p style="margin: 0 0 6px; color: #1e293b; font-size: 13px;">
                    <strong>With code</strong> — <code>Team Name, CODE, Speaker 1, Speaker 2, Speaker 3</code>
                    <span style="color: #64748b;">(2–4 uppercase letters = treated as code)</span>
                </p>
                <p style="margin: 0; color: #1e293b; font-size: 13px;">
                    <strong>With scores</strong> — <code>Team Name, CODE, Speaker 1, R1score, R2score, Speaker 2, R1score, R2score, ...</code>
                    <span style="color: #64748b;">(numeric values after a speaker name = per-round substantive scores)</span>
                </p>
            </div>
            
            <div style="background: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                <div style="display: flex; gap: 15px; align-items: center; margin-bottom: 15px;">
                    <input type="file" id="teamFileInput" accept=".txt,.csv" style="flex: 1; padding: 10px; border: 2px solid #e2e8f0; border-radius: 8px;">
                    <button onclick="document.getElementById('teamFileInput').click()" class="secondary" style="padding: 10px 20px; background: #e2e8f0; border: none; border-radius: 8px; cursor: pointer;">
                        📂 Browse
                    </button>
                </div>
                
                <textarea id="teamCsv" rows="7" placeholder="Basic:&#10;Harvard Debate, John Smith, Emma Wilson, Michael Chen&#10;&#10;With code:&#10;Oxford Union, OXF, Sarah Jones, David Brown, Lisa Wang&#10;&#10;With scores (R1, R2 per speaker):&#10;Sydney United, SYD, Tom Anderson, 74.5, 72.0, Rachel Lee, 75.0, 73.5, James Wilson, 71.0, 76.0" style="width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 8px; font-family: monospace; font-size: 12px; box-sizing: border-box;"></textarea>
                
                <div style="display: flex; gap: 10px; margin-top: 15px; flex-wrap: wrap;">
                    <button onclick="window.previewTeams()" class="secondary" style="padding: 10px 20px; background: #e2e8f0; border: none; border-radius: 8px; cursor: pointer;">
                        Preview
                    </button>
                    <button onclick="window.importTeams()" class="primary" style="padding: 10px 20px; background: #1a73e8; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        Import Teams
                    </button>
                    <button onclick="window.clearTeamImport()" class="secondary" style="padding: 10px 20px; background: #e2e8f0; border: none; border-radius: 8px; cursor: pointer;">
                        Clear
                    </button>
                </div>
            </div>
            
            <div id="teamPreview" style="margin-top: 15px; display: none; background: white; padding: 20px; border-radius: 12px; border: 2px solid #e2e8f0;"></div>
        </div>
        
        <div class="section">
            <h2>Import Judges</h2>
            <p style="color: #64748b; margin-bottom: 15px;">
                Format: <code>Judge Name, Role (chair/wing/trainee), Conflict Team 1, Conflict Team 2, ...</code>
            </p>
            
            <div style="background: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                <div style="display: flex; gap: 15px; align-items: center; margin-bottom: 15px;">
                    <input type="file" id="judgeFileInput" accept=".txt,.csv" style="flex: 1; padding: 10px; border: 2px solid #e2e8f0; border-radius: 8px;">
                    <button onclick="document.getElementById('judgeFileInput').click()" class="secondary" style="padding: 10px 20px; background: #e2e8f0; border: none; border-radius: 8px; cursor: pointer;">
                        📂 Browse
                    </button>
                </div>
                
                <textarea id="judgeCsv" rows="6" placeholder="Robert Johnson, chair, Harvard Debate, Oxford Union&#10;Maria Garcia, wing, Sydney United&#10;David Kim, wing" style="width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 8px; font-family: monospace; box-sizing: border-box;"></textarea>
                
                <div style="display: flex; gap: 10px; margin-top: 15px; flex-wrap: wrap;">
                    <button onclick="window.previewJudges()" class="secondary" style="padding: 10px 20px; background: #e2e8f0; border: none; border-radius: 8px; cursor: pointer;">
                        Preview
                    </button>
                    <button onclick="window.importJudges()" class="primary" style="padding: 10px 20px; background: #1a73e8; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        Import Judges
                    </button>
                    <button onclick="window.clearJudgeImport()" class="secondary" style="padding: 10px 20px; background: #e2e8f0; border: none; border-radius: 8px; cursor: pointer;">
                        Clear
                    </button>
                </div>
            </div>
            
            <div id="judgePreview" style="margin-top: 15px; display: none; background: white; padding: 20px; border-radius: 12px; border: 2px solid #e2e8f0;"></div>
        </div>        
      `;
    
    // Add file input event listeners
    setTimeout(() => {
        const teamFile = document.getElementById('teamFileInput');
        if (teamFile) {
            teamFile.addEventListener('change', function(e) {
                loadTeamFile(this);
            });
        }
        
        const judgeFile = document.getElementById('judgeFileInput');
        if (judgeFile) {
            judgeFile.addEventListener('change', function(e) {
                loadJudgeFile(this);
            });
        }
    }, 100);
}

// File loading functions - NO "window." !
function loadTeamFile(input) {
    const file = input.files[0];
    if (!file) {
        showNotification('Please select a file', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('teamCsv').value = e.target.result;
        showNotification(`Loaded: ${file.name}`, 'success');
        previewTeams();
    };
    reader.onerror = function() {
        showNotification('Error reading file', 'error');
    };
    reader.readAsText(file);
    
    input.value = '';
}

function loadJudgeFile(input) {
    const file = input.files[0];
    if (!file) {
        showNotification('Please select a file', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('judgeCsv').value = e.target.result;
        showNotification(`Loaded: ${file.name}`, 'success');
        previewJudges();
    };
    reader.onerror = function() {
        showNotification('Error reading file', 'error');
    };
    reader.readAsText(file);
    
    input.value = '';
}

// Clear functions - NO "window." !
function clearTeamImport() {
    document.getElementById('teamCsv').value = '';
    document.getElementById('teamPreview').style.display = 'none';
    document.getElementById('teamFileInput').value = '';
    showNotification('Cleared', 'info');
}

function clearJudgeImport() {
    document.getElementById('judgeCsv').value = '';
    document.getElementById('judgePreview').style.display = 'none';
    document.getElementById('judgeFileInput').value = '';
    showNotification('Cleared', 'info');
}

// ============================================
// TEAM CSV PARSER
// Supports three formats in the same file:
//   Basic:      Team Name, Spk1, Spk2, Spk3
//   With code:  Team Name, CODE, Spk1, Spk2, Spk3   (2-4 uppercase letters)
//   With scores: Team Name, CODE, Spk1, 74.5, 72.0, Spk2, 75.0, ...
//
// Returns: { name, code, speakers: [{ name, scores: [float,...] }] }
// ============================================
function _parseTeamLine(line) {
    const raw = line.split(',').map(p => p.trim()).filter(p => p);
    if (raw.length < 2) return null;

    let cursor = 0;
    const teamName = raw[cursor++];

    // Detect optional team code: 2-4 uppercase letters only
    let teamCode = teamName.substring(0, 3).toUpperCase();
    if (/^[A-Z]{2,4}$/.test(raw[cursor] || '')) {
        teamCode = raw[cursor++];
    }

    // Parse speakers and their optional per-round scores
    const speakers = [];
    while (cursor < raw.length) {
        const token = raw[cursor];
        // A numeric token belongs to the previous speaker as a round score
        if (!isNaN(parseFloat(token)) && isFinite(token)) {
            if (speakers.length > 0) {
                speakers[speakers.length - 1].scores.push(parseFloat(token));
            }
            cursor++;
        } else {
            // It's a speaker name
            speakers.push({ name: token, scores: [] });
            cursor++;
        }
    }

    if (speakers.length === 0) return null;
    return { name: teamName, code: teamCode, speakers };
}

// Preview functions - NO "window." !
function previewTeams() {
    const text    = document.getElementById('teamCsv')?.value.trim();
    const preview = document.getElementById('teamPreview');

    if (!text) {
        showNotification('Paste team data or load a file first', 'error');
        return;
    }

    const lines  = text.split('\n').filter(l => l.trim());
    const parsed = lines.map(_parseTeamLine).filter(Boolean);

    // Detect whether any line contains scores so we can show score columns
    const hasScores = parsed.some(t => t.speakers.some(s => s.scores.length > 0));
    const maxRounds = hasScores
        ? Math.max(...parsed.flatMap(t => t.speakers.map(s => s.scores.length)), 0)
        : 0;

    let html = '<h3 style="margin-top: 0; margin-bottom: 15px;">📋 Preview</h3>';
    html += '<div style="overflow-x:auto"><table style="width: 100%; border-collapse: collapse; min-width: 500px;">';

    // Header
    html += '<tr style="background:#f1f5f9">';
    html += '<th style="text-align:left;padding:10px;border-bottom:2px solid #e2e8f0;">Team</th>';
    html += '<th style="text-align:left;padding:10px;border-bottom:2px solid #e2e8f0;">Code</th>';
    html += '<th style="text-align:left;padding:10px;border-bottom:2px solid #e2e8f0;">Speakers</th>';
    if (hasScores) {
        for (let r = 1; r <= maxRounds; r++) {
            html += `<th style="text-align:center;padding:10px;border-bottom:2px solid #e2e8f0;">R${r}</th>`;
        }
    }
    html += '</tr>';

    if (parsed.length === 0) {
        html += `<tr><td colspan="${3 + maxRounds}" style="padding:20px;text-align:center;color:#64748b;">No valid teams found — check the format</td></tr>`;
    } else {
        parsed.forEach((team, ti) => {
            // First speaker row
            team.speakers.forEach((spk, si) => {
                html += `<tr style="${(ti + si) % 2 === 0 ? 'background:#f8fafc;' : ''}">`;
                if (si === 0) {
                    html += `<td style="padding:10px;border-bottom:1px solid #e2e8f0;" rowspan="${team.speakers.length}"><strong>${escapeHTML(team.name)}</strong></td>`;
                    html += `<td style="padding:10px;border-bottom:1px solid #e2e8f0;" rowspan="${team.speakers.length}"><span style="background:#e2e8f0;padding:4px 8px;border-radius:4px;">${escapeHTML(team.code)}</span></td>`;
                }
                html += `<td style="padding:10px;border-bottom:1px solid #e2e8f0;">${escapeHTML(spk.name)}</td>`;
                if (hasScores) {
                    for (let r = 0; r < maxRounds; r++) {
                        const sc = spk.scores[r];
                        html += `<td style="padding:10px;text-align:center;border-bottom:1px solid #e2e8f0;${sc !== undefined ? 'font-weight:600;color:#1a73e8;' : 'color:#94a3b8;'}">${sc !== undefined ? sc.toFixed(1) : '—'}</td>`;
                    }
                }
                html += '</tr>';
            });
        });
    }

    html += '</table></div>';
    html += `<p style="margin-top:15px;color:#64748b;">Found <strong>${parsed.length}</strong> team${parsed.length !== 1 ? 's' : ''}${hasScores ? ` with scores up to Round ${maxRounds}` : ' (no scores — can auto-generate later)'}. Click <strong>Import Teams</strong> to add them.</p>`;

    preview.innerHTML    = html;
    preview.style.display = 'block';
}

function previewJudges() {
    const text = document.getElementById('judgeCsv')?.value.trim();
    const preview = document.getElementById('judgePreview');
    
    if (!text) {
        showNotification('Paste judge data or load a file first', 'error');
        return;
    }
    
    const lines = text.split('\n').filter(l => l.trim());
    let html = '<h3 style="margin-top: 0; margin-bottom: 15px;">📋 Preview</h3>';
    html += '<table style="width: 100%; border-collapse: collapse;">';
    html += '<tr><th style="text-align: left; padding: 10px; border-bottom: 2px solid #e2e8f0;">Name</th><th style="text-align: left; padding: 10px; border-bottom: 2px solid #e2e8f0;">Role</th><th style="text-align: left; padding: 10px; border-bottom: 2px solid #e2e8f0;">Conflicts</th></tr>';
    
    lines.forEach(line => {
        const parts = line.split(',').map(p => p.trim());
        if (parts.length >= 2) {
            const role = parts[1].toLowerCase();
            let roleDisplay = 'Wing';
            let roleColor = '#1a73e8';
            if (role.includes('chair')) {
                roleDisplay = 'Chair';
                roleColor = '#2e7d32';
            }
            if (role.includes('trainee')) {
                roleDisplay = 'Trainee';
                roleColor = '#b45309';
            }
            
            html += `<tr>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>${escapeHTML(parts[0])}</strong></td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><span style="background: ${roleColor}; color: white; padding: 4px 8px; border-radius: 4px;">${escapeHTML(roleDisplay)}</span></td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${escapeHTML(parts.slice(2).join(', ') || 'None')}</td>
            </tr>`;
        }
    });
    
    html += '</table>';
    html += `<p style="margin-top: 15px; color: #64748b;">Found ${lines.length} judges. Click Import to add them.</p>`;
    
    preview.innerHTML = html;
    preview.style.display = 'block';
}

// Import functions - NO "window." !
function importTeams() {
    const text = document.getElementById('teamCsv')?.value.trim();
    if (!text) {
        showNotification('No data to import', 'error');
        return;
    }

    const lines  = text.split('\n').filter(l => l.trim());
    let imported = 0;
    let skipped  = 0;
    let withScores = 0;

    lines.forEach(line => {
        const parsed = _parseTeamLine(line);
        if (!parsed || parsed.speakers.length === 0) { skipped++; return; }

        const exists = state.teams.some(t => t.name.toLowerCase() === parsed.name.toLowerCase());
        if (exists) { skipped++; return; }

        // Build speaker objects, populating score maps if scores were provided
        const speakerObjs = parsed.speakers.map(spk => {
            const substantiveScores = {};
            let substantiveTotal    = 0;
            let substantiveCount    = 0;

            // Map scores to round IDs 1, 2, 3... (positional — matches prelim round order)
            spk.scores.forEach((score, idx) => {
                const roundId = idx + 1;
                substantiveScores[roundId] = score;
                substantiveTotal          += score;
                substantiveCount++;
            });

            if (substantiveCount > 0) withScores++;

            return {
                name: spk.name,
                substantiveTotal,
                substantiveScores,
                substantiveCount,
                replyTotal:  0,
                replyScores: {},
                replyCount:  0
            };
        });

        // Compute team total from imported speaker scores
        const teamTotal = speakerObjs.reduce((sum, s) => sum + s.substantiveTotal, 0);

        // Build per-round team totals from speaker data
        const roundScores = {};
        speakerObjs.forEach(spk => {
            Object.entries(spk.substantiveScores).forEach(([rid, score]) => {
                roundScores[rid] = (roundScores[rid] || 0) + score;
            });
        });

        state.teams.push({
            id: Date.now() + imported,
            name:      parsed.name,
            code:      parsed.code,
            speakers:  speakerObjs,
            wins:      0,
            total:     teamTotal,
            roundScores,
            eliminated: false,
            broke:      false
        });
        imported++;
    });

    save();

    if (imported > 0) {
        const scoreMsg = withScores > 0 ? ` — ${withScores} speaker score set${withScores !== 1 ? 's' : ''} imported` : ' (no scores — use Auto-Generate to add them)';
        showNotification(`✅ Imported ${imported} team${imported !== 1 ? 's' : ''}${skipped ? ` (${skipped} skipped)` : ''}${scoreMsg}`, 'success');
        document.getElementById('teamPreview').style.display  = 'none';
        document.getElementById('teamCsv').value              = '';
        document.getElementById('teamFileInput').value        = '';

        if (document.getElementById('teams-list')) displayTeams();
        renderStandings();
        updatePublicCounts();
    } else {
        showNotification(`No valid teams found to import${skipped ? ` (${skipped} lines skipped — check format)` : ''}`, 'error');
    }
}

function importJudges() {
    const text = document.getElementById('judgeCsv')?.value.trim();
    if (!text) {
        showNotification('No data to import', 'error');
        return;
    }
    
    const lines = text.split('\n').filter(l => l.trim());
    let imported = 0;
    let skipped = 0;
    
    lines.forEach(line => {
        const parts = line.split(',').map(p => p.trim()).filter(p => p);
        if (parts.length >= 2) {
            const name = parts[0];
            const roleStr = parts[1].toLowerCase();
            
            let role = 'wing';
            if (roleStr.includes('chair')) role = 'chair';
            if (roleStr.includes('trainee')) role = 'trainee';
            
            const affiliations = parts.slice(2).map(teamName => {
                const team = state.teams.find(t => t.name.toLowerCase() === teamName.toLowerCase());
                return team ? team.id : null;
            }).filter(id => id !== null);
            
            const exists = state.judges.some(j => j.name.toLowerCase() === name.toLowerCase());
            if (!exists) {
                state.judges.push({
                    id: Date.now() + imported,
                    name,
                    role,
                    affiliations
                });
                imported++;
            } else {
                skipped++;
            }
        } else {
            skipped++;
        }
    });
    
    save();
    
    if (imported > 0) {
        showNotification(`✅Imported ${imported} judges (${skipped} skipped)`, 'success');
        document.getElementById('judgePreview').style.display = 'none';
        document.getElementById('judgeCsv').value = '';
        document.getElementById('judgeFileInput').value = '';
        
        if (document.getElementById('judges-list')) displayJudges();
        updatePublicCounts();
    } else {
        showNotification('No valid judges found to import', 'error');
    }
}

// Export functions - NO "window." !
// ── Shared download helper — avoids copy-pasting the Blob/anchor
//    pattern across every export function.
function _downloadCSV(filename, csvString) {
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function exportData() {
    const dataStr = JSON.stringify(state, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const link = document.createElement('a');
    link.setAttribute('href', dataUri);
    link.setAttribute('download', `wsdc_tournament_${new Date().toISOString().slice(0,10)}.json`);
    link.click();
    showNotification('Tournament data exported', 'success');
}

// Full reset function
function fullReset(){
    if (confirm('⚠️⚠️This will delete ALL data ⚠️⚠️ \n Are you absolutely sure?')) {
        console.log('Its working')
        localStorage.clear();
        location.reload();
    }
}
// ============================================
// FIXED TEAM EXPORT FUNCTION
// ============================================

function exportStandings() {
    try {
        const allRounds = [...(state.rounds || [])]
            .filter(r => r && r.type === 'prelim')
            .sort((a, b) => (a.id || 0) - (b.id || 0));
        const teams = state.teams || [];
        if (teams.length === 0) { showNotification('No teams to export', 'warning'); return; }

        const rankedTeams = [...teams].sort((a, b) =>
            ((b.wins || 0) - (a.wins || 0)) || ((b.total || 0) - (a.total || 0))
        );

        let csv = 'Rank,Team Name,Team Code';
        allRounds.forEach(round => { csv += `,Round ${round.id || '?'}`; });
        csv += ',Total Wins,Total Points,Average,Status\n';

        rankedTeams.forEach((team, index) => {
            const roundsPlayed = Object.keys(team.roundScores || {}).length;
            const teamAvg = roundsPlayed > 0 ? ((team.total || 0) / roundsPlayed).toFixed(2) : '0.00';
            let status = team.eliminated ? 'Eliminated' : team.broke ? 'Breaking' : 'Active';
            let row = `\n${index + 1},${team.name || 'Unnamed'},${team.code || ''}`;
            allRounds.forEach(round => {
                const sc = team.roundScores?.[round.id];
                row += sc !== undefined ? `,${sc.toFixed(1)}` : ',-';
            });
            row += `,${team.wins || 0},${(team.total || 0).toFixed(1)},${teamAvg},${status}`;
            csv += row;
        });

        _downloadCSV(`tournament_standings_${new Date().toISOString().slice(0,10)}.csv`, csv);
        showNotification('Standings exported successfully', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showNotification('Error exporting standings: ' + error.message, 'error');
    }
}

// ============================================
// EXPORT TEAMS ONLY (Simplified version)
// ============================================

function exportTeams() {
    try {
        const teams = state.teams || [];
        if (teams.length === 0) { showNotification('No teams to export', 'warning'); return; }

        let csv = 'Team Name,Team Code,Speakers,Wins,Total Points,Status\n';
        teams.forEach(team => {
            const speakers = (team.speakers || []).map(s => s.name || 'Unknown').join('; ').replace(/,/g, ';');
            const name = (team.name || 'Unnamed').replace(/,/g, ' ');
            const status = team.eliminated ? 'Eliminated' : team.broke ? 'Breaking' : 'Active';
            csv += `"${name}",${team.code || ''},"${speakers}",${team.wins || 0},${(team.total || 0).toFixed(1)},${status}\n`;
        });

        _downloadCSV(`teams_export_${new Date().toISOString().slice(0,10)}.csv`, csv);
        showNotification(`${teams.length} teams exported successfully`, 'success');
    } catch (error) {
        console.error('Export error:', error);
        showNotification('Error exporting teams: ' + error.message, 'error');
    }
}

// ============================================
// EXPORT SPEAKER STANDINGS
// Delegates to the canonical implementation in speakers.js,
// which uses the live stats pipeline and respects disabled speakers.
// ============================================

function exportSpeakerStandings() {
    if (typeof window.exportSpeakerStandings === 'function') {
        window.exportSpeakerStandings();
    } else {
        showNotification('Speaker export not available', 'error');
    }
}

// ============================================
// EXPORT ALL FUNCTIONS THAT WILL BE USED OUTSIDE
//============================================
export {
    exportTeams,
    exportStandings,
    renderImport,
    loadTeamFile,
    loadJudgeFile,
    clearTeamImport,
    clearJudgeImport,
    previewTeams,
    previewJudges,
    importTeams,
    importJudges,
    exportData,
    fullReset,
    exportSpeakerStandings
}