// ============================================
// JUDGE PORTAL INTERFACE - Updated for admin access
// ============================================

import { state, save } from './state.js';
import { getJudgeCurrentAssignment } from './state.js';
import { escapeHTML, showNotification } from './utils.js';

// Render judge portal (now with admin view)
function renderJudgePortal() {
    const container = document.getElementById('portal');
    if (!container) return;
    
    const isAdmin = state.auth?.isAuthenticated && state.auth?.currentUser?.role === 'admin';
    const isJudge = state.auth?.isAuthenticated && state.auth?.currentUser?.role === 'judge';
    
    // If not logged in at all
    if (!state.auth.isAuthenticated) {
        container.innerHTML = `
            <div class="section" style="text-align: center; padding: 60px 20px;">
                <div style="font-size: 64px; margin-bottom: 20px;">🚪</div>
                <h2 style="margin: 0 0 10px; color: #1e293b;">Judge Portal Access</h2>
                <p style="color: #64748b; margin: 0 0 20px;">Please login as a judge or admin to access the portal.</p>
                <button onclick="window.showLoginModal()" class="btn-primary" style="padding: 12px 30px;">Login</button>
            </div>
        `;
        return;
    }
    
    // ADMIN VIEW - Show all judges and their assignments
    if (isAdmin) {
        renderAdminPortalView(container);
        return;
    }
    
    // JUDGE VIEW - Show judge-specific content
    if (isJudge) {
        renderJudgePortalView(container);
        return;
    }
    
    // TEAM VIEW — teams submit feedback on their judges
    const isTeam = state.auth?.isAuthenticated && state.auth?.currentUser?.role === 'team';
    if (isTeam) {
        renderTeamPortalView(container);
        return;
    }

    // Fallback for other roles
    container.innerHTML = `
        <div class="section" style="text-align: center; padding: 60px 20px;">
            <div style="font-size: 64px; margin-bottom: 20px;">🔒</div>
            <h2 style="margin: 0 0 10px; color: #1e293b;">Access Restricted</h2>
            <p style="color: #64748b; margin: 0;">Judges, teams, and admins can access the portal.</p>
        </div>
    `;
}

// Team portal — teams rate judges who judged their debates
function renderTeamPortalView(container) {
    const teamId = state.auth?.currentUser?.associatedId;
    const team = (state.teams || []).find(t => String(t.id) === String(teamId));

    if (!team) {
        container.innerHTML = `
            <div class="section" style="text-align: center; padding: 60px 20px;">
                <div style="font-size: 64px; margin-bottom: 20px;">⚠️</div>
                <h3 style="margin: 0 0 10px; color: #1e293b;">Team Profile Not Found</h3>
                <p style="color: #64748b; margin: 0;">Your account is not linked to a team. Contact the admin.</p>
            </div>`;
        return;
    }

    // Find all judges who judged this team's debates
    const judgedByIds = new Set();
    (state.rounds || []).forEach(round => {
        (round.debates || []).forEach(debate => {
            const inDebate = debate.gov === teamId || debate.opp === teamId ||
                             String(debate.gov) === String(teamId) || String(debate.opp) === String(teamId);
            if (!inDebate) return;
            (debate.panel || []).forEach(p => judgedByIds.add(String(p.id)));
        });
    });

    const judgeList = (state.judges || []).filter(j => judgedByIds.has(String(j.id)));

    // Track which ones this team has already reviewed
    const alreadyReviewed = new Set(
        (state.feedback || [])
            .filter(fb => String(fb.fromTeamId) === String(teamId))
            .map(fb => String(fb.toJudgeId))
    );

    container.innerHTML = `
        <div class="section">
            <div style="background: linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 30px;">
                <h1 style="margin: 0 0 8px; font-size: 32px;">Team Feedback Portal</h1>
                <div style="opacity: 0.9; font-size: 15px;">${escapeHTML(team.name)} &nbsp;·&nbsp; Rate the judges from your debates</div>
            </div>

            ${judgeList.length === 0 ? `
                <div style="text-align: center; padding: 60px 20px; color: #64748b;">
                    <div style="font-size: 64px; margin-bottom: 16px;">📭</div>
                    <h3 style="margin: 0 0 10px; color: #1e293b;">No Judges Yet</h3>
                    <p style="margin: 0;">Once you've debated, your judges will appear here for feedback.</p>
                </div>
            ` : `
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; font-size: 14px; color: #166534;">
                    🔒 Your feedback is <strong>completely anonymous</strong>. Judges will never see your team name.
                </div>
                <div style="display: grid; gap: 20px;">
                    ${judgeList.map(judge => {
                        const done = alreadyReviewed.has(String(judge.id));
                        const roleColors = { chair: { bg: '#dcfce7', text: '#16a34a' }, wing: { bg: '#dbeafe', text: '#1d4ed8' }, trainee: { bg: '#fef3c7', text: '#92400e' } };
                        const rc = roleColors[judge.role] || roleColors.wing;
                        return `
                        <div style="background: white; border-radius: 12px; padding: 22px; box-shadow: 0 2px 6px rgba(0,0,0,.06); border: 1px solid #e2e8f0;">
                            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                                <div style="width: 44px; height: 44px; border-radius: 50%; background: ${rc.bg}; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; color: ${rc.text};">
                                    ${escapeHTML((judge.name || 'J')[0].toUpperCase())}
                                </div>
                                <div>
                                    <div style="font-weight: 700; font-size: 16px; color: #1e293b;">${escapeHTML(judge.name)}</div>
                                    <span style="background: ${rc.bg}; color: ${rc.text}; padding: 1px 10px; border-radius: 20px; font-size: 11px; font-weight: 700;">${(judge.role || 'WING').toUpperCase()}</span>
                                </div>
                                ${done ? '<span style="margin-left: auto; background: #dcfce7; color: #16a34a; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">✓ Reviewed</span>' : ''}
                            </div>

                            ${done ? `
                                <div style="background: #f0fdf4; border-radius: 8px; padding: 14px; color: #16a34a; font-size: 14px; text-align: center;">
                                    ✅ You've already submitted feedback for this judge. Thank you!
                                </div>
                            ` : `
                                <div style="margin-bottom: 12px;">
                                    <label style="display: block; font-weight: 600; color: #374151; margin-bottom: 8px; font-size: 14px;">Rating <span style="color: #dc2626;">*</span></label>
                                    <div style="display: flex; gap: 8px;" id="team_stars_${judge.id}">
                                        ${[1,2,3,4,5].map(n => `
                                        <button type="button"
                                                onclick="window._setTeamFeedbackRating('${judge.id}', ${n})"
                                                id="team_star_${judge.id}_${n}"
                                                style="font-size: 26px; background: none; border: none; cursor: pointer; opacity: 0.3; padding: 2px; transition: opacity .1s;"
                                                title="${n} star${n!==1?'s':''}">⭐</button>`).join('')}
                                    </div>
                                    <input type="hidden" id="team_rating_${judge.id}" value="0">
                                </div>
                                <div style="margin-bottom: 14px;">
                                    <label style="display: block; font-weight: 600; color: #374151; margin-bottom: 6px; font-size: 14px;">Comments <span style="font-weight: 400; color: #64748b;">(optional)</span></label>
                                    <textarea id="team_comment_${judge.id}" rows="3"
                                              placeholder="How well did this judge explain their decision? Was their feedback helpful?"
                                              style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 14px; resize: vertical; box-sizing: border-box;"></textarea>
                                </div>
                                <button onclick="window.submitTeamFeedback('${judge.id}')"
                                        style="width: 100%; background: #7c3aed; color: white; border: none; padding: 12px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px;">
                                    Submit Feedback for ${escapeHTML(judge.name)}
                                </button>
                            `}
                        </div>`;
                    }).join('')}
                </div>
            `}
        </div>
    `;
}

// Submit team feedback
function submitTeamFeedback(toJudgeId) {
    const teamId = state.auth?.currentUser?.associatedId;
    const toJudge = (state.judges || []).find(j => String(j.id) === String(toJudgeId));
    if (!teamId || !toJudge) { showNotification('Could not identify your team', 'error'); return; }

    const rating = parseInt(document.getElementById(`team_rating_${toJudgeId}`)?.value || '0');
    if (!rating || rating < 1 || rating > 5) {
        showNotification('Please select a star rating', 'error');
        return;
    }

    const already = (state.feedback || []).some(
        fb => String(fb.fromTeamId) === String(teamId) && String(fb.toJudgeId) === String(toJudgeId)
    );
    if (already) { showNotification('You have already reviewed this judge', 'error'); return; }

    const comment = document.getElementById(`team_comment_${toJudgeId}`)?.value.trim() || '';

    if (!state.feedback) state.feedback = [];
    state.feedback.push({
        id: `fb_${Date.now()}`,
        fromTeamId: teamId,
        fromJudgeId: null,
        fromJudgeName: 'Anonymous (team)',
        toJudgeId: toJudgeId,
        rating,
        comment,
        timestamp: new Date().toISOString()
    });

    save();
    showNotification(`✅ Feedback submitted for ${toJudge.name}!`, 'success');
    // Refresh to show "already reviewed" state
    const container = document.getElementById('portal');
    if (container) renderTeamPortalView(container);
}

// Admin view - overview of all judges and their assignments
function renderAdminPortalView(container) {
    const judges = state.judges || [];
    const totalAssignments = judges.reduce((sum, judge) => {
        const assignments = getJudgeCurrentAssignment(judge.id) || [];
        return sum + assignments.length;
    }, 0);
    const pendingAssignments = judges.reduce((sum, judge) => {
        const assignments = getJudgeCurrentAssignment(judge.id) || [];
        return sum + assignments.filter(a => !a.entered).length;
    }, 0);
    
    container.innerHTML = `
        <div class="section">
            <!-- Judges List -->
            <h2 style="margin: 0 0 20px;">All Judges</h2>
            <div style="display: flex; flex-direction: column; gap: 15px;">
                ${judges.map(judge => renderJudgeCard(judge)).join('')}
            </div>
            
            <!-- Quick Actions -->
            <div style="margin-top: 30px; padding: 20px; background: #f8fafc; border-radius: 12px;">
                <h3 style="margin: 0 0 15px;">Quick Actions</h3>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <button onclick="window.generateAllJudgeURLs?.()" class="btn-secondary">
                        🔗 Generate All URLs
                    </button>
                    <button onclick="window.showBulkSendPanel?.('judge')" class="btn-primary">
                        📧 Send URLs
                    </button>
                    <button onclick="window.switchTab('admin-dashboard'); setTimeout(()=>window.adminSwitchSection?.('judges'), 100)" class="btn-secondary">
                        ⚙️ Manage Judges
                    </button>
                </div>
            </div>
        </div>
    `; // end container.innerHTML
}

// Helper to render a judge card in admin view
function renderJudgeCard(judge) {
    const assignments = getJudgeCurrentAssignment(judge.id) || [];
    const pending = assignments.filter(a => !a.entered).length;
    const completed = assignments.filter(a => a.entered).length;
    const hasURL = !!(state.judgeTokens || {})[judge.id];
    
    const roleColors = {
        chair: { bg: '#dcfce7', text: '#16a34a' },
        wing: { bg: '#dbeafe', text: '#1d4ed8' },
        trainee: { bg: '#fef3c7', text: '#92400e' }
    };
    const color = roleColors[judge.role] || roleColors.wing;
    
    return `
        <div style="background: white; border-radius: 12px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div style="width: 48px; height: 48px; border-radius: 50%; background: ${color.bg}; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; color: ${color.text};">
                        ${escapeHTML((judge.name || 'J')[0].toUpperCase())}
                    </div>
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <strong style="font-size: 16px;">${escapeHTML(judge.name)}</strong>
                            <span style="background: ${color.bg}; color: ${color.text}; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 600;">
                                ${judge.role?.toUpperCase() || 'WING'}
                            </span>
                            ${hasURL ? 
                                '<span style="background: #dcfce7; color: #16a34a; padding: 2px 8px; border-radius: 20px; font-size: 11px;">✓ URL</span>' : 
                                '<span style="background: #fee2e2; color: #dc2626; padding: 2px 8px; border-radius: 20px; font-size: 11px;">✗ No URL</span>'
                            }
                        </div>
                        <div style="display: flex; gap: 15px; font-size: 13px; color: #64748b;">
                            <span>📋 ${assignments.length} total</span>
                            <span style="color: #f59e0b;">⏳ ${pending} pending</span>
                            <span style="color: #10b981;">✅ ${completed} done</span>
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button onclick="window._portalViewJudge('${judge.id}')" class="btn-secondary btn-sm">👁️ View Portal</button>
                    ${!hasURL ? 
                        `<button onclick="window.generateJudgeURL?.('${judge.id}')" class="btn-primary btn-sm">🔗 Generate URL</button>` :
                        `<button onclick="window.copyJudgeURL?.('${judge.id}')" class="btn-secondary btn-sm">📋 Copy URL</button>`
                    }
                </div>
            </div>
            
            <!-- Show current assignments preview -->
            ${assignments.length > 0 ? `
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #f1f5f9;">
                    <div style="font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 10px;">Current Assignments:</div>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${assignments.slice(0, 3).map(a => `
                            <div style="display: flex; align-items: center; gap: 10px; font-size: 12px; background: #f8fafc; padding: 8px; border-radius: 6px;">
                                <span style="background: ${a.entered ? '#10b981' : '#f59e0b'}; width: 8px; height: 8px; border-radius: 50%;"></span>
                                <span style="flex: 1;"><strong>Round ${a.roundId}</strong> - ${escapeHTML(a.roomName)}</span>
                                <span style="color: ${a.entered ? '#10b981' : '#f59e0b'}; font-weight: 600;">
                                    ${a.entered ? 'Submitted' : 'Pending'}
                                </span>
                            </div>
                        `).join('')}
                        ${assignments.length > 3 ? `<div style="font-size: 11px; color: #94a3b8; text-align: center;">+${assignments.length - 3} more assignments</div>` : ''}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

// Judge view - original judge-specific portal
function renderJudgePortalView(container) {
    const judgeId = state.auth?.currentUser?.associatedId;
    const judge = state.judges.find(j => j.id === judgeId);
    
    if (!judge) {
        container.innerHTML = `
            <div class="section" style="text-align: center; padding: 60px 20px;">
                <div style="font-size: 64px; margin-bottom: 20px;">⚠️</div>
                <h3 style="margin: 0 0 10px; color: #1e293b;">Judge Profile Not Found</h3>
                <p style="color: #64748b; margin: 0;">Your account is not linked to a judge profile. Contact admin.</p>
            </div>
        `;
        return;
    }
    
    // Get judge's assignments
    const assignments = getJudgeCurrentAssignment(judgeId);
    const pendingAssignments = assignments.filter(a => !a.entered);
    const completedAssignments = assignments.filter(a => a.entered);
    
    // Get feedback given and received
    const feedbackGiven = (state.feedback || []).filter(f => f.fromJudgeId === judgeId);
    const feedbackReceived = (state.feedback || []).filter(f => f.toJudgeId === judgeId);
    const avgRating = feedbackReceived.length > 0 
        ? (feedbackReceived.reduce((sum, f) => sum + f.rating, 0) / feedbackReceived.length).toFixed(1)
        : 'N/A';
    
    container.innerHTML = `
        <div style="background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 30px;">
            <h1 style="margin: 0 0 15px; font-size: 36px;">Judge Portal</h1>
            <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap;">
                <div style="background: rgba(255,255,255,0.2); padding: 10px 20px; border-radius: 40px;">
                    <strong>${escapeHTML(judge.name)}</strong>
                </div>
                <div style="background: rgba(255,255,255,0.2); padding: 10px 20px; border-radius: 40px;">
                    ${judge.role.toUpperCase()} JUDGE
                </div>
                <div style="background: rgba(255,255,255,0.2); padding: 10px 20px; border-radius: 40px;">
                     ${assignments.length} Assignment${assignments.length !== 1 ? 's' : ''}
                </div>
                <div style="background: rgba(255,255,255,0.2); padding: 10px 20px; border-radius: 40px;">
                    ⭐ ${avgRating} Avg Rating
                </div>
            </div>
        </div>
        
        <!-- Quick Stats -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px;">
            <div style="background: white; padding: 20px; border-radius: 12px; border-left: 4px solid #f59e0b; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <div style="font-size: 14px; color: #64748b; margin-bottom: 5px;">Pending Results</div>
                <div style="font-size: 32px; font-weight: 700; color: #f59e0b;">${pendingAssignments.length}</div>
            </div>
            <div style="background: white; padding: 20px; border-radius: 12px; border-left: 4px solid #2e7d32; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <div style="font-size: 14px; color: #64748b; margin-bottom: 5px;">Completed</div>
                <div style="font-size: 32px; font-weight: 700; color: #2e7d32;">${completedAssignments.length}</div>
            </div>
            <div style="background: white; padding: 20px; border-radius: 12px; border-left: 4px solid #1a73e8; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <div style="font-size: 14px; color: #64748b; margin-bottom: 5px;">Feedback Given</div>
                <div style="font-size: 32px; font-weight: 700; color: #1a73e8;">${feedbackGiven.length}</div>
            </div>
            <div style="background: white; padding: 20px; border-radius: 12px; border-left: 4px solid #c2185b; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <div style="font-size: 14px; color: #64748b; margin-bottom: 5px;">Feedback Received</div>
                <div style="font-size: 32px; font-weight: 700; color: #c2185b;">${feedbackReceived.length}</div>
            </div>
        </div>
        
        <!-- Tab Navigation -->
        <div style="display: flex; border-bottom: 2px solid #e2e8f0; margin-bottom: 25px;">
            <button id="portalMyRoomsBtn" onclick="window.switchPortalTab('myrooms')" 
                    style="flex: 1; padding: 15px; background: none; border: none; border-bottom: 3px solid #1a73e8; font-weight: 600; color: #1a73e8; cursor: pointer; font-size: 16px;">
                My Rooms
            </button>
            <button id="portalFullDrawBtn" onclick="window.switchPortalTab('fulldraw')" 
                    style="flex: 1; padding: 15px; background: none; border: none; border-bottom: 3px solid transparent; font-weight: 600; color: #64748b; cursor: pointer; font-size: 16px;">
                Full Draw
            </button>
            <button id="portalFeedbackBtn" onclick="window.switchPortalTab('feedback')" 
                    style="flex: 1; padding: 15px; background: none; border: none; border-bottom: 3px solid transparent; font-weight: 600; color: #64748b; cursor: pointer; font-size: 16px;">
                Give Feedback
            </button>
            <button id="portalMyFeedbackBtn" onclick="window.switchPortalTab('myfeedback')" 
                    style="flex: 1; padding: 15px; background: none; border: none; border-bottom: 3px solid transparent; font-weight: 600; color: #64748b; cursor: pointer; font-size: 16px;">
                 My Feedback
            </button>
        </div>
        
        <!-- Tab Content -->
        <div id="portalTabContent"></div>
    `;
    
    // Show default tab
    switchPortalTab('myrooms');
}

// ... rest of the portal.js functions (switchPortalTab, renderPortalMyRooms, etc.) remain the same ...

// Switch between portal tabs
function switchPortalTab(tabName) {
    // Update button styles
    const buttons = {
        'myrooms': document.getElementById('portalMyRoomsBtn'),
        'fulldraw': document.getElementById('portalFullDrawBtn'),
        'feedback': document.getElementById('portalFeedbackBtn'),
        'myfeedback': document.getElementById('portalMyFeedbackBtn')
    };
    
    Object.keys(buttons).forEach(key => {
        const btn = buttons[key];
        if (btn) {
            if (key === tabName) {
                btn.style.borderBottom = '3px solid #1a73e8';
                btn.style.color = '#1a73e8';
            } else {
                btn.style.borderBottom = '3px solid transparent';
                btn.style.color = '#64748b';
            }
        }
    });
    
    // Render content
    const content = document.getElementById('portalTabContent');
    if (!content) return;
    
    const judgeId = state.auth?.currentUser?.associatedId;
    
    if (tabName === 'myrooms') {
        renderPortalMyRooms(content, judgeId);
    } else if (tabName === 'fulldraw') {
        renderPortalFullDraw(content, judgeId);
    } else if (tabName === 'feedback') {
        renderPortalFeedbackForm(content, judgeId);
    } else if (tabName === 'myfeedback') {
        renderPortalMyFeedback(content, judgeId);
    }
}

// Render My Rooms tab
function renderPortalMyRooms(content, judgeId) {
    const assignments = getJudgeCurrentAssignment(judgeId);
    const pendingAssignments = assignments.filter(a => !a.entered);
    const completedAssignments = assignments.filter(a => a.entered);
    
    content.innerHTML = `
        ${assignments.length === 0 ? `
            <div style="text-align: center; padding: 60px 20px;">
                <div style="font-size: 64px; margin-bottom: 20px;">📭</div>
                <h3 style="margin: 0 0 10px; color: #1e293b;">No Assignments Yet</h3>
                <p style="color: #64748b; margin: 0;">You haven't been assigned to any rooms. Check back later.</p>
            </div>
        ` : `
            ${pendingAssignments.length > 0 ? `
                <div style="margin-bottom: 30px;">
                    <h2 style="margin: 0 0 20px; color: #1e293b; display: flex; align-items: center; gap: 10px;">
                        <span style="background: #f59e0b; color: white; padding: 8px 16px; border-radius: 8px;">⏳ Pending Submissions</span>
                        <span style="color: #64748b; font-size: 16px; font-weight: normal;">${pendingAssignments.length} room${pendingAssignments.length !== 1 ? 's' : ''}</span>
                    </h2>
                    <div style="display: grid; gap: 15px;">
                        ${pendingAssignments.map(a => generatePortalAssignmentCard(a, true)).join('')}
                    </div>
                </div>
            ` : ''}
            
            ${completedAssignments.length > 0 ? `
                <div>
                    <h2 style="margin: 0 0 20px; color: #1e293b; display: flex; align-items: center; gap: 10px;">
                        <span style="background: #2e7d32; color: white; padding: 8px 16px; border-radius: 8px;">✅ Completed</span>
                        <span style="color: #64748b; font-size: 16px; font-weight: normal;">${completedAssignments.length} room${completedAssignments.length !== 1 ? 's' : ''}</span>
                    </h2>
                    <div style="display: grid; gap: 15px;">
                        ${completedAssignments.map(a => generatePortalAssignmentCard(a, false)).join('')}
                    </div>
                </div>
            ` : ''}
        `}
    `;
}

// Render Full Draw tab
function renderPortalFullDraw(content, judgeId) {
    if (state.rounds.length === 0) {
        content.innerHTML = `
            <div style="text-align: center; padding: 60px 20px;">
                <div style="font-size: 64px; margin-bottom: 20px;"></div>
                <h3 style="margin: 0 0 10px; color: #1e293b;">No Rounds Yet</h3>
                <p style="color: #64748b; margin: 0;">The draw will appear here once rounds are created.</p>
            </div>
        `;
        return;
    }
    
    content.innerHTML = `
        <div style="display: grid; gap: 25px;">
            ${state.rounds.map((round, roundIdx) => {
                const enteredCount = round.debates.filter(d => d.entered).length;
                
                return `
                    <div style="background: white; padding: 25px; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                            <h3 style="margin: 0; color: #1a73e8; font-size: 22px;">Round ${round.id}: ${escapeHTML(round.motion)}</h3>
                            <span style="background: ${enteredCount === round.debates.length ? '#2e7d32' : '#f59e0b'}; color: white; padding: 6px 14px; border-radius: 40px; font-size: 13px; font-weight: 600;">
                                ${enteredCount}/${round.debates.length} Results
                            </span>
                        </div>
                        
                        <div style="display: grid; gap: 12px;">
                            ${round.debates.map((debate, debateIdx) => {
                                const gov = state.teams.find(t => t.id === debate.gov);
                                const opp = state.teams.find(t => t.id === debate.opp);
                                if (!gov || !opp) return '';
                                
                                const roomName = round.rooms?.[debateIdx] || `Room ${String.fromCharCode(65 + debateIdx)}`;
                                const isMyRoom = debate.panel && debate.panel.some(p => p.id === judgeId);
                                
                                return `
                                    <div style="background: ${isMyRoom ? '#e0f2fe' : '#f8fafc'}; padding: 15px; border-radius: 8px; border-left: 4px solid ${isMyRoom ? '#1a73e8' : '#e2e8f0'};">
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                            <div style="display: flex; align-items: center; gap: 10px;">
                                                <strong style="font-size: 16px;">${roomName}</strong>
                                                ${isMyRoom ? '<span style="background: #1a73e8; color: white; padding: 2px 8px; border-radius: 40px; font-size: 11px; font-weight: 600;">YOUR ROOM</span>' : ''}
                                            </div>
                                            <span style="color: ${debate.entered ? '#2e7d32' : '#f59e0b'}; font-weight: 600; font-size: 13px;">
                                                ${debate.entered ? '✓ Entered' : '⏳ Pending'}
                                            </span>
                                        </div>
                                        
                                        <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; align-items: center;">
                                            <div style="text-align: center; padding: 8px; background: white; border-radius: 6px;">
                                                <div style="font-weight: 600; color: #1a73e8;">${escapeHTML(gov.name)}</div>
                                                <div style="font-size: 11px; color: #64748b;">#${gov.code}</div>
                                            </div>
                                            <div style="font-weight: 600; color: #64748b;">VS</div>
                                            <div style="text-align: center; padding: 8px; background: white; border-radius: 6px;">
                                                <div style="font-weight: 600; color: #c2185b;">${escapeHTML(opp.name)}</div>
                                                <div style="font-size: 11px; color: #64748b;">#${opp.code}</div>
                                            </div>
                                        </div>
                                        
                                        ${debate.panel && debate.panel.length > 0 ? `
                                            <div style="margin-top: 10px; font-size: 12px; color: #64748b;">
                                                <strong>Panel:</strong> ${debate.panel.map(p => {
                                                    const j = state.judges.find(judge => judge.id === p.id);
                                                    const isMe = p.id === judgeId;
                                                    return j ? `<span style="${isMe ? 'font-weight: 600; color: #1a73e8;' : ''}">${escapeHTML(j.name)}${isMe ? ' (You)' : ''} (${p.role})</span>` : '';
                                                }).join(' • ')}
                                            </div>
                                        ` : ''}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            }).reverse().join('')}
        </div>
    `;
}

// Render Feedback Form tab
function renderPortalFeedbackForm(content, judgeId) {
    // Get all judges that this judge has worked with
    const assignments = getJudgeCurrentAssignment(judgeId);
    const coJudges = new Set();
    
    assignments.forEach(assignment => {
        assignment.panel.forEach(p => {
            if (p.id !== judgeId) {
                coJudges.add(p.id);
            }
        });
    });
    
    const coJudgesList = Array.from(coJudges).map(id => state.judges.find(j => j.id === id)).filter(Boolean);
    
    if (coJudgesList.length === 0) {
        content.innerHTML = `
            <div style="text-align: center; padding: 60px 20px;">
                <div style="font-size: 64px; margin-bottom: 20px;">👥</div>
                <h3 style="margin: 0 0 10px; color: #1e293b;">No Co-Judges Yet</h3>
                <p style="color: #64748b; margin: 0;">You haven't been assigned with other judges yet. Feedback forms will appear here.</p>
            </div>
        `;
        return;
    }
    
    content.innerHTML = `
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 10px; color: #1e293b;">💬 Give Feedback to Co-Judges</h3>
            <p style="margin: 0; color: #64748b; font-size: 14px;">
                Provide constructive feedback to help your fellow judges improve. Your feedback is valuable for their development.
            </p>
        </div>
        
        <div style="display: grid; gap: 20px;">
            ${coJudgesList.map(judge => {
                // Check if already gave feedback
                const existingFeedback = (state.feedback || []).filter(f => 
                    f.fromJudgeId === judgeId && f.toJudgeId === judge.id
                );
                
                return `
                    <div style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                        <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
                            <div style="flex: 1;">
                                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                                    <h4 style="margin: 0; font-size: 18px; color: #1e293b;">${escapeHTML(judge.name)}</h4>
                                    <span style="background: ${judge.role === 'chair' ? '#2e7d32' : '#1a73e8'}; color: white; padding: 2px 10px; border-radius: 40px; font-size: 11px; font-weight: 600;">
                                        ${judge.role.toUpperCase()}
                                    </span>
                                </div>
                                ${existingFeedback.length > 0 ? `
                                    <div style="font-size: 13px; color: #2e7d32;">
                                        ✓ You've given ${existingFeedback.length} feedback${existingFeedback.length !== 1 ? 's' : ''} to this judge
                                    </div>
                                ` : `
                                    <div style="font-size: 13px; color: #64748b;">
                                        No feedback given yet
                                    </div>
                                `}
                            </div>
                        </div>
                        
                        <div style="margin-bottom: 12px;">
                            <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #1e293b; font-size: 14px;">
                                Rating <span style="color: #dc2626;">*</span>
                            </label>
                            <select id="portal_feedback_rating_${judge.id}" 
                                    style="width: 100%; padding: 10px; border: 2px solid #e2e8f0; border-radius: 6px; font-size: 14px;">
                                <option value="">Select rating...</option>
                                <option value="5">⭐⭐⭐⭐⭐ Excellent</option>
                                <option value="4">⭐⭐⭐⭐ Very Good</option>
                                <option value="3">⭐⭐⭐ Good</option>
                                <option value="2">⭐⭐ Fair</option>
                                <option value="1">⭐ Needs Improvement</option>
                            </select>
                        </div>
                        
                        <div style="margin-bottom: 12px;">
                            <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #1e293b; font-size: 14px;">
                                Comments (Optional)
                            </label>
                            <textarea id="portal_feedback_comment_${judge.id}" 
                                      rows="4" 
                                      placeholder="Share constructive feedback to help them improve..."
                                      style="width: 100%; padding: 10px; border: 2px solid #e2e8f0; border-radius: 6px; resize: vertical; font-size: 14px;"></textarea>
                        </div>
                        
                        <button onclick="window.submitPortalFeedback(${judge.id})" 
                                style="width: 100%; background: #1a73e8; color: white; border: none; padding: 12px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px;">
                            Submit Feedback for ${escapeHTML(judge.name)}
                        </button>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// Render My Feedback tab
function renderPortalMyFeedback(content, judgeId) {
    const feedbackReceived = (state.feedback || []).filter(f => f.toJudgeId === judgeId);
    
    if (feedbackReceived.length === 0) {
        content.innerHTML = `
            <div style="text-align: center; padding: 60px 20px;">
                <div style="font-size: 64px; margin-bottom: 20px;">⭐</div>
                <h3 style="margin: 0 0 10px; color: #1e293b;">No Feedback Yet</h3>
                <p style="color: #64748b; margin: 0;">Feedback from other judges will appear here.</p>
            </div>
        `;
        return;
    }
    
    const avgRating = feedbackReceived.reduce((sum, f) => sum + f.rating, 0) / feedbackReceived.length;
    const ratingDistribution = [1, 2, 3, 4, 5].map(rating => 
        feedbackReceived.filter(f => f.rating === rating).length
    );
    
    content.innerHTML = `
        <!-- Summary Card -->
        <div style="background: white; padding: 25px; border-radius: 12px; margin-bottom: 25px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="font-size: 48px; font-weight: 700; color: #1a73e8; margin-bottom: 5px;">${avgRating.toFixed(1)}</div>
                <div style="font-size: 24px; margin-bottom: 5px;">${'⭐'.repeat(Math.round(avgRating))}</div>
                <div style="color: #64748b; font-size: 14px;">${feedbackReceived.length} review${feedbackReceived.length !== 1 ? 's' : ''} received</div>
            </div>
            
            <div style="display: grid; gap: 8px;">
                ${[5, 4, 3, 2, 1].map(rating => {
                    const count = ratingDistribution[rating - 1];
                    const percentage = feedbackReceived.length > 0 ? (count / feedbackReceived.length * 100) : 0;
                    return `
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="width: 70px; text-align: right; color: #64748b; font-size: 14px;">${rating} ⭐</span>
                            <div style="flex: 1; background: #e2e8f0; border-radius: 4px; height: 10px; overflow: hidden;">
                                <div style="background: #f59e0b; height: 100%; width: ${percentage}%; transition: width 0.3s;"></div>
                            </div>
                            <span style="width: 40px; color: #64748b; font-size: 14px;">${count}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
        
        <!-- Individual Reviews -->
        <div>
            <h3 style="margin: 0 0 20px; color: #1e293b;">All Feedback</h3>
            <div style="display: grid; gap: 15px;">
                ${feedbackReceived.reverse().map(fb => `
                    <div style="background: white; padding: 20px; border-radius: 12px; border-left: 4px solid ${fb.rating >= 4 ? '#2e7d32' : fb.rating >= 3 ? '#f59e0b' : '#dc2626'}; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                            <div>
                                <div style="font-weight: 600; color: #1e293b; font-size: 16px; margin-bottom: 3px;">
                                    ${escapeHTML(fb.fromJudgeName)}
                                </div>
                                <div style="font-size: 12px; color: #64748b;">
                                    ${new Date(fb.timestamp).toLocaleString()}
                                </div>
                            </div>
                            <div style="font-size: 20px;">${'⭐'.repeat(fb.rating)}</div>
                        </div>
                        ${fb.comment ? `
                            <div style="background: #f8fafc; padding: 12px; border-radius: 6px; font-style: italic; color: #475569; font-size: 14px;">
                                "${escapeHTML(fb.comment)}"
                            </div>
                        ` : `
                            <div style="color: #94a3b8; font-style: italic; font-size: 14px;">No written feedback provided</div>
                        `}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Generate assignment card for portal
function generatePortalAssignmentCard(assignment, isPending) {
    const isChair = assignment.role === 'chair';
    const judgeId = state.auth?.currentUser?.associatedId;
    const otherJudges = assignment.panel.filter(p => p.id !== judgeId);
    
    return `
        <div style="background: white; padding: 20px; border-radius: 12px; border-left: 4px solid ${isPending ? '#f59e0b' : '#2e7d32'}; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
                <div>
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                        <h4 style="margin: 0; color: #1e293b; font-size: 18px;">Round ${assignment.roundId}: ${assignment.roomName}</h4>
                        <span style="background: ${isChair ? '#2e7d32' : '#1a73e8'}; color: white; padding: 3px 10px; border-radius: 40px; font-size: 12px; font-weight: 600;">
                            ${isChair ? 'CHAIR' : 'WING'}
                        </span>
                    </div>
                    <div style="padding: 10px; background: #fef3c7; border-radius: 6px; margin-bottom: 10px;">
                        <div style="font-size: 13px; color: #92400e;">
                            <strong>Motion:</strong> ${escapeHTML(assignment.motion)}
                        </div>
                    </div>
                </div>
                ${isPending ? `
                    <button onclick="window.openRoomSubmission(${assignment.roundIdx}, ${assignment.debateIdx})" 
                            style="background: #1a73e8; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; white-space: nowrap;">
                        ${isChair ? 'Submit Results' : '💬 View Room'}
                    </button>
                ` : ''}
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: center; margin-bottom: 12px;">
                <div style="text-align: center; padding: 12px; background: #e8f0fe; border-radius: 8px; border: 2px solid #1a73e8;">
                    <div style="font-size: 12px; color: #1565c0; font-weight: 600; margin-bottom: 3px;">PROPOSITION</div>
                    <div style="font-size: 15px; font-weight: 600; color: #1a73e8;">${escapeHTML(assignment.govTeam.name)}</div>
                    <div style="font-size: 11px; color: #64748b;">#${assignment.govTeam.code}</div>
                </div>
                <div style="font-size: 18px; font-weight: 600; color: #64748b;">VS</div>
                <div style="text-align: center; padding: 12px; background: #fce7f3; border-radius: 8px; border: 2px solid #c2185b;">
                    <div style="font-size: 12px; color: #be123c; font-weight: 600; margin-bottom: 3px;">OPPOSITION</div>
                    <div style="font-size: 15px; font-weight: 600; color: #c2185b;">${escapeHTML(assignment.oppTeam.name)}</div>
                    <div style="font-size: 11px; color: #64748b;">#${assignment.oppTeam.code}</div>
                </div>
            </div>
            
            ${otherJudges.length > 0 ? `
                <div style="padding: 10px; background: #f8fafc; border-radius: 6px; font-size: 13px; color: #64748b;">
                    <strong style="color: #1e293b;">Panel:</strong> 
                    ${otherJudges.map(p => {
                        const j = state.judges.find(judge => judge.id === p.id);
                        return j ? `${escapeHTML(j.name)} (${p.role})` : '';
                    }).join(' • ')}
                </div>
            ` : ''}
            
            ${!isPending ? `
                <div style="margin-top: 12px; padding: 10px; background: #e6f4ea; border-radius: 6px; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 20px;">✅</span>
                    <span style="color: #1e7e34; font-weight: 600; font-size: 14px;">Results submitted and recorded</span>
                </div>
            ` : ''}
        </div>
    `;
}

// Submit feedback from portal
function submitPortalFeedback(toJudgeId) {
    const judgeId = state.auth?.currentUser?.associatedId;
    const toJudge = state.judges.find(j => j.id === toJudgeId);
    
    const rating = document.getElementById(`portal_feedback_rating_${toJudgeId}`)?.value;
    const comment = document.getElementById(`portal_feedback_comment_${toJudgeId}`)?.value.trim();
    
    if (!rating) {
        showNotification('Please select a rating', 'error');
        return;
    }
    
    const feedback = {
        id: Date.now(),
        fromJudgeId: judgeId,
        fromJudgeName: state.auth?.currentUser?.name,
        toJudgeId: toJudgeId,
        rating: parseInt(rating),
        comment: comment,
        timestamp: new Date().toISOString()
    };
    
    if (!state.feedback) state.feedback = [];
    state.feedback.push(feedback);
    save();
    
    showNotification(`Feedback submitted for ${toJudge.name}!`, 'success');
    
    // Clear form
    document.getElementById(`portal_feedback_rating_${toJudgeId}`).value = '';
    document.getElementById(`portal_feedback_comment_${toJudgeId}`).value = '';
    
    // Refresh the tab
    switchPortalTab('feedback');
}

// Window registrations
window.submitTeamFeedback = submitTeamFeedback;

// Alias: portal cards call openRoomSubmission; the real function is showEnterResults in draw.js
// We defer the lookup so draw.js is guaranteed to have registered it first
window.openRoomSubmission = function(roundIdx, debateIdx) {
    if (typeof window.showEnterResults === 'function') {
        window.showEnterResults(roundIdx, debateIdx);
    } else {
        console.error('showEnterResults not available — ensure draw.js is loaded');
    }
};

// Safe judge-view helper (avoids JSON.stringify in onclick)
window._portalViewJudge = function(judgeId) {
    const judge = (state.judges || []).find(j => String(j.id) === String(judgeId));
    if (!judge) return;
    const assignments = getJudgeCurrentAssignment(judge.id) || [];
    if (window.showJudgeDashboard) {
        window.showJudgeDashboard({ judgeId: judge.id, judge, assignments });
    }
};

// Star rating helper for team feedback forms
window._setTeamFeedbackRating = function(judgeId, n) {
    document.getElementById(`team_rating_${judgeId}`).value = n;
    for (let i = 1; i <= 5; i++) {
        const btn = document.getElementById(`team_star_${judgeId}_${i}`);
        if (btn) btn.style.opacity = i <= n ? '1' : '0.3';
    }
};

// Export all functions
export {
    renderJudgePortal,
    switchPortalTab,
    submitPortalFeedback,
    submitTeamFeedback
};