// ============================================
// MAIN.JS - The glue that connects all modules
// ============================================

// ── Central action registry (replaces window.fn = fn sprawl) ────────────────
import { registerAll, delegateActions, exposeOnWindow } from './registry.js';
import { generateId, normalizeId, idsEqual } from './id-system.js';

// Expose ID utilities on window
window.generateId = generateId;
window.normalizeId = normalizeId;
window.idsEqual = idsEqual;

// IMPORT from state.js
import { 
    state, 
    save,
    validateJudgeToken,
    showJudgeDashboard,
    getJudgeURL,
    copyJudgeURL,
    regenerateJudgeURL,
    getOrCreateRoomURL,
    validateRoomToken,
    showJudgeSubmissionInterface,
    submitJudgeResults,
    submitJudgeFeedback,
    getJudgeCurrentAssignment
} from './state.js';

// IMPORT from file-manager.js
import {
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
    exportTeams,
    exportStandings,
    exportSpeakerStandings,
    fullReset
} from './file-manager.js';

// IMPORT from tab.js
import { 
    switchTab,
    updateTabsForRole, 
    renderStandings,
    renderMotions,
    updateStandingsFilter,
    resetStandingsFilter,
    renderResults,
} from './tab.js';

// IMPORT from auth.js
import {
    showLoginModal,
    toggleAssociationFields,
    handleJudgeAssociationChange,
    handleTeamAssociationChange,
    guestLogin,
    logout,
    registerUser,
    handleLogin,
    updateHeaderControls,
    switchAuthTab,
    renderProfile
} from './auth.js';

// IMPORT from teams.js
import {
    renderTeams,
    displayTeams,
    showEditTeam,
    saveEditTeam,
    addTeam,
    deleteTeam
} from './teams.js';

// IMPORT from judges.js
import {
    renderJudges,
    displayJudges,
    showEditJudge,
    saveEditJudge,
    addJudge,
    deleteJudge
} from './judges.js';

// IMPORT from draw.js
import {
    //createNextKnockoutRound,
    showMoveTeamModal,
    renderDraw,
    displayRounds,
    createRound,
    showJudgeManagement,
    addJudgeToPanel,
    removeJudgeFromPanel,
    copyRoomURL,
    showEnterResults,
    submitResults,
    toggleBlindRound,
    redrawRound,
    swapTeams,
    toggleAttendance,
    viewDebateDetails,
    // DnD engine
    dndJudgeDragStart,
    dndJudgeDragOver,
    dndJudgeDrop,
    dndTeamDragStart,
    dndTeamDragOver,
    dndTeamDrop,
    dndDragEnd,
    dndDragLeave, 
    executeMoveTeam,  
    moveJudgeToPanel,
} from './draw.js';

// IMPORT from knockout.js
import {
    renderBreak,
    displayBreakingTeams,
    calculateBreak,
    generateKnockout,
    renderKnockout,
    enterKnockoutResult,
    submitKnockoutResult,
    resetTournament
} from './knockout.js';

// IMPORT from sample.js
import { 
  
    generateCustomSampleData,   
} from './sample.js';

// IMPORT from admin.js
import {
    renderAdminDashboard,
    adminSwitchSection,
    adminCreateRound,
    adminCalculateBreak,
    adminTogglePublish,
    adminPublishAll,
    adminHideAll,
    initAdminDashboard,
} from './admin.js';

// IMPORT from speakers.js
import {
    renderSpeakerStandings,
    toggleReplyColumn,
    exportSpeakerStandings as exportSpeakersCSV,
} from './speakers.js';

// IMPORT from feedback.js
import {
    renderFeedback,
    viewJudgeFeedbackDetails
} from './feedback.js';

// IMPORT from portal.js
import {
    renderJudgePortal,
    switchPortalTab,
    submitPortalFeedback
} from './portal.js';

// IMPORT from participants.js
import { renderParticipants, initParticipants } from './participants.js';

// IMPORT from utils.js
import {
    escapeHTML,
    showNotification,
    closeAllModals,
    updatePublicCounts,
    hasConflict,
    getPreviousMeetings,
} from './utils.js';

// IMPORT from urls.js - ALL URL functions
import {
    createJudgeURL,
    generateJudgeURL,
    createTeamURL,
    generateTeamURL,
    syncJudgeAssignments,
    syncTeamAssignments,
    showJudgePortal,
    showTeamPortal,
    emailJudgeAssignments,
    emailTeamAssignments,
    copyToClipboard,
    initURLFeedbackSystem,
    generateAllJudgeURLs,
    generateAllTeamURLs,
    showBulkSendPanel,
    sendJudgeURL,
    sendTeamURL,
    sendAllURLs,
    syncAllJudgeAssignments,
    syncAllTeamAssignments,
    validateToken,
    checkURLForTokens,
    handleRoomParam,
    showURLErrorModal,
    showEmailPromptModal,
    getJudgeAssignments,
    getTeamAssignments,
    generateJudgeEmail,
    generateTeamEmail,
    getJudgeMailtoLink,
    getTeamMailtoLink,
} from './urls.js';

// ============================================
// WINDOW BINDINGS — State
// ============================================
// ============================================
// ACTION REGISTRY — replaces window.fn = fn
// ============================================
// All functions are registered under their original names so that:
//   (a) data-action="X" delegation works via registry.dispatch()
//   (b) any un-migrated onclick="window.X()" strings still work via
//       exposeOnWindow() at the bottom of this block.
//
// To migrate a template string:
//   BEFORE: onclick="window.deleteTeam(${id})"
//   AFTER:  data-action="deleteTeam" data-id="${id}"
// ─────────────────────────────────────────────────────────────────

registerAll({
    // ── State ──────────────────────────────────────────────────
    state,
    save,

    // ── Judge URL / Token system ───────────────────────────────
    validateJudgeToken,
    showJudgeDashboard,
    getJudgeURL,
    copyJudgeURL,
    regenerateJudgeURL,
    getOrCreateRoomURL,
    validateRoomToken,
    showJudgeSubmissionInterface,
    submitJudgeResults,
    submitJudgeFeedback,
    getJudgeCurrentAssignment,

    // ── File manager ───────────────────────────────────────────
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
    exportStandings,
    exportTeams,
    exportSpeakerStandings,
    fullReset,

    // ── DnD engine (kept on window — delegation doesn't help DnD) ─
    dndJudgeDragStart,
    dndJudgeDragOver,
    dndJudgeDrop,
    dndTeamDragStart,
    dndTeamDragOver,
    dndTeamDrop,
    dndDragEnd,
    dndDragLeave,

    // ── Tab functions ──────────────────────────────────────────
    switchTab,
    updateTabsForRole,
    renderStandings,
    updateStandingsFilter,
    resetStandingsFilter,
    renderResults,
    renderMotions,

    // ── Auth ───────────────────────────────────────────────────
    showLoginModal,
    switchAuthTab,
    toggleAssociationFields,
    handleJudgeAssociationChange,
    handleTeamAssociationChange,
    guestLogin,
    logout,
    registerUser,
    handleLogin,
    updateHeaderControls,
    renderProfile,

    // ── Teams ──────────────────────────────────────────────────
    renderTeams,
    displayTeams,
    showEditTeam,
    saveEditTeam,
    addTeam,
    deleteTeam,
    editTeam: (id) => showEditTeam(id),

    // ── Judges ─────────────────────────────────────────────────
    renderJudges,
    displayJudges,
    showEditJudge,
    saveEditJudge,
    addJudge,
    deleteJudge,
    editJudge: (id) => showEditJudge(id),

    // ── Draw ───────────────────────────────────────────────────
    renderDraw,
    displayRounds,
    createRound,
    showJudgeManagement,
    addJudgeToPanel,
    removeJudgeFromPanel,
    copyRoomURL,
    showEnterResults,
    submitResults,
    toggleBlindRound,
    redrawRound,
    swapTeams,
    toggleAttendance,
    viewDebateDetails,
    showMoveTeamModal,
    openJudgeModal:  showJudgeManagement,   // alias
    enterResults:    showEnterResults,        // alias
    moveJudgeToPanel,
    executeMoveTeam,

    // ── Knockout ───────────────────────────────────────────────
    renderBreak,
    calculateBreak,
    generateKnockout,
    renderKnockout,
    enterKnockoutResult,
    submitKnockoutResult,
    resetTournament,

    // ── Sample data ────────────────────────────────────────────
    generateCustomSampleData,

    // ── Admin dashboard ────────────────────────────────────────
    renderAdminDashboard,
    initAdminDashboard,
    adminSwitchSection,
    adminCreateRound,
    adminCalculateBreak,
    adminTogglePublish,
    adminPublishAll,
    adminHideAll,

    // ── Speakers ───────────────────────────────────────────────
    renderSpeakerStandings,
    toggleReplyColumn,

    // ── Feedback ───────────────────────────────────────────────
    renderFeedback,
    viewJudgeFeedbackDetails,

    // ── Portal ─────────────────────────────────────────────────
    renderJudgePortal,
    switchPortalTab,
    submitPortalFeedback,

    // ── Participants ───────────────────────────────────────────
    renderParticipants,
    _participantsTab: (tab) => { window.participantsSwitchTab?.(tab); },

    // ── URL system ─────────────────────────────────────────────
    createJudgeURL,
    generateJudgeURL,
    createTeamURL,
    generateTeamURL,
    showJudgePortal,
    showTeamPortal,
    emailJudgeAssignments,
    emailTeamAssignments,
    copyToClipboard,
    generateAllJudgeURLs,
    generateAllTeamURLs,
    showBulkSendPanel,
    sendJudgeURL,
    sendTeamURL,
    sendAllURLs,
    syncAllJudgeAssignments,
    syncAllTeamAssignments,
    validateToken,
    checkURLForTokens,
    showURLErrorModal,
    showEmailPromptModal,
    getJudgeAssignments,
    getTeamAssignments,

    // ── Utils ──────────────────────────────────────────────────
    escapeHTML,
    showNotification,
    closeAllModals,
    updatePublicCounts,
    hasConflict,
    getPreviousMeetings,

    // ── App internals ──────────────────────────────────────────
    updateAdminDropdownVisibility,
});

// Re-expose every registered action on window so that any onclick="window.X()"
// strings that have not yet been migrated to data-action keep working.
// Once all templates are converted, this single line can be removed.
exposeOnWindow();


// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {

    // ── 1. Static HTML button wiring ─────────────────────────────────────────
    // These replace every onclick="..." attribute in main.html with proper
    // addEventListener calls. Nothing in main.html needs an onclick attr anymore.

    // Header
    document.querySelector('.header-logo')
        ?.addEventListener('click', () => switchTab('public'));
    document.getElementById('login-btn')
        ?.addEventListener('click', showLoginModal);
    document.getElementById('logout-btn')
        ?.addEventListener('click', logout);
    document.querySelector('.header-user')
        ?.addEventListener('click', () => switchTab('profile'));

    // Auth modal
    document.getElementById('loginTabBtn')
        ?.addEventListener('click', () => switchAuthTab('login'));
    document.getElementById('registerTabBtn')
        ?.addEventListener('click', () => switchAuthTab('register'));
    document.querySelector('#loginForm  .btn-primary')
        ?.addEventListener('click', handleLogin);
    document.querySelector('#loginForm  .btn-secondary')
        ?.addEventListener('click', guestLogin);
    document.querySelector('#registerForm .btn-success')
        ?.addEventListener('click', registerUser);
    document.querySelector('.modal-footer .btn-link')
        ?.addEventListener('click', closeAllModals);

    // Close auth modal when clicking the overlay backdrop (not the content box)
    document.getElementById('auth-modal-overlay')
        ?.addEventListener('click', e => {
            if (e.target === e.currentTarget) closeAllModals();
        });
    document.querySelector('#auth-modal .modal-content')
        ?.addEventListener('click', e => e.stopPropagation());

    // Enter key on login inputs
    document.getElementById('loginPassword')
        ?.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
    document.getElementById('loginUsername')
        ?.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });

    // ── Nav: delegate data-action="switchTab" on the nav bar ─────────────────
    document.querySelector('.dropdown-menu-container')
        ?.addEventListener('click', e => {
            const el = e.target.closest('[data-action="switchTab"]');
            if (el) switchTab(el.dataset.id);
        });

    // Footer links also use data-action now
    document.querySelector('footer')
        ?.addEventListener('click', e => {
            const el = e.target.closest('[data-action="switchTab"]');
            if (el) { e.preventDefault(); switchTab(el.dataset.id); }
        });

    // ── 2. Tab-level event delegation ────────────────────────────────────────
    // Each stable tab container gets one delegated listener. Dynamic HTML inside
    // them uses data-action="X" data-args='[...]' instead of onclick="window.X()".
    // Any element that hasn't been migrated yet still works via window.X() since
    // exposeOnWindow() above keeps those bindings alive.
    const tabsToDelegate = [
        'teams', 'judges', 'draw', 'standings', 'speakers',
        'break', 'knockout', 'results', 'motions', 'import',
        'feedback', 'portal', 'admin-dashboard', 'public', 'profile',
    ];
    tabsToDelegate.forEach(id => {
        const el = document.getElementById(id);
        if (el) delegateActions(el);
    });

    // The <main> element catches anything not in a named tab
    delegateActions(document.querySelector('main'));

    // ── 3. App initialization ─────────────────────────────────────────────────
    setTimeout(initURLFeedbackSystem, 1000);
    initAdminDashboard();
    initParticipants();
    ensureAdminTabExists();
    updateHeaderControls();
    checkURLForTokens();
});

// Ensure admin tab button exists
function ensureAdminTabExists() {
    // Check if admin tab button already exists
    if (!document.getElementById('admin-tab-btn')) {
        // Get the tabs container
        const tabsContainer = document.querySelector('.dropdown-menu-container');
        if (tabsContainer) {
            // Check if admin group exists
            let adminGroup = document.getElementById('admin-dropdown-group');
            if (!adminGroup) {
                // Create admin group if it doesn't exist
                adminGroup = document.createElement('div');
                adminGroup.className = 'dropdown-group admin-group';
                adminGroup.id = 'admin-dropdown-group';
                adminGroup.style.display = 'none';
                
                adminGroup.innerHTML = `
                    <button class="dropdown-trigger">⚙️ Admin ▾</button>
                    <div class="dropdown-content">
                        <button class="dropdown-item" onclick="switchTab('admin-dashboard')">⚙️ Dashboard</button>
                        <button class="dropdown-item" onclick="switchTab('portal')">🚪 Portal</button>
                    </div>
                `;
                
                tabsContainer.appendChild(adminGroup);
            }
        }
    }
    
    // Update admin dropdown visibility
    updateAdminDropdownVisibility();
}

// ============================================
// ADMIN VISIBILITY
// ============================================
// ============================================================
// MOBILE NAV — Touch dropdown toggle
// Add this to the bottom of main.js, or include as a separate
// <script src="js/mobile-nav.js" defer></script> in main.html
// ============================================================

(function initMobileNav() {

    function isMobile() {
        return window.innerWidth <= 768;
    }

    // Position a dropdown panel just below its trigger button,
    // aligned to left edge of trigger (or right-clamped to viewport)
    function positionDropdown(group) {
        const trigger = group.querySelector('.dropdown-trigger');
        const content = group.querySelector('.dropdown-content');
        if (!trigger || !content) return;

        const rect = trigger.getBoundingClientRect();

        // Default: align to left of trigger
        let left = rect.left;
        const width = Math.max(200, rect.width);

        // Clamp so it doesn't overflow right edge
        if (left + width > window.innerWidth - 8) {
            left = window.innerWidth - width - 8;
        }
        // Never go negative
        left = Math.max(8, left);

        content.style.top  = rect.bottom + 'px';
        content.style.left = left + 'px';
        content.style.width = width + 'px';
    }

    // Close all open dropdowns
    function closeAll(except) {
        document.querySelectorAll('.dropdown-group.open').forEach(g => {
            if (g !== except) g.classList.remove('open');
        });
    }

    // Handle trigger clicks on mobile
    document.addEventListener('click', function(e) {
        if (!isMobile()) return;

        const trigger = e.target.closest('.dropdown-trigger');
        const group   = trigger?.closest('.dropdown-group');
        const hasContent = group?.querySelector('.dropdown-content');

        if (trigger && group && hasContent) {
            // If this trigger also navigates (no sub-menu), let it fire normally
            const isNavOnly = !hasContent;
            if (isNavOnly) return;

            e.preventDefault();
            e.stopPropagation();

            const isOpen = group.classList.contains('open');
            closeAll(group);

            if (!isOpen) {
                group.classList.add('open');
                positionDropdown(group);
            } else {
                group.classList.remove('open');
            }
            return;
        }

        // Click outside closes all
        if (!e.target.closest('.dropdown-group')) {
            closeAll();
        }
    }, true);

    // Reposition on scroll/resize
    function repositionOpen() {
        document.querySelectorAll('.dropdown-group.open').forEach(g => {
            positionDropdown(g);
        });
    }

    window.addEventListener('scroll', repositionOpen, { passive: true });
    window.addEventListener('resize', function() {
        // On resize to desktop, close all mobile dropdowns
        if (!isMobile()) closeAll();
        else repositionOpen();
    });

    // Make nav bar buttons scroll the active tab into view
    // so the current section is always visible in the scrollable nav
    function scrollNavToActive() {
        const activeBtn = document.querySelector('.dropdown-trigger.active, .dropdown-menu-container .active');
        if (activeBtn) {
            activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }

    // Patch switchTab to also update active state and scroll nav
    const _origSwitchTab = window.switchTab;
    if (typeof _origSwitchTab === 'function') {
        window.switchTab = function(tabId) {
            _origSwitchTab(tabId);
            // Highlight the matching nav trigger
            document.querySelectorAll('.dropdown-trigger, .dropdown-item').forEach(btn => {
                btn.classList.remove('active');
            });
            // Try to match by onclick attribute text
            document.querySelectorAll('.dropdown-trigger, .dropdown-item').forEach(btn => {
                const oc = btn.getAttribute('onclick') || '';
                if (oc.includes(`'${tabId}'`) || oc.includes(`"${tabId}"`)) {
                    btn.classList.add('active');
                    // Scroll parent trigger into view on mobile
                    const parentTrigger = btn.closest('.dropdown-group')?.querySelector('.dropdown-trigger');
                    if (parentTrigger && isMobile()) {
                        setTimeout(() => {
                            parentTrigger.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                        }, 100);
                    }
                }
            });
            closeAll();
        };
    }

})();

// Update admin dropdown visibility based on auth state
function updateAdminDropdownVisibility() {
    const adminGroup = document.getElementById('admin-dropdown-group');
    if (!adminGroup) return;

    const isAdmin = state?.auth?.isAuthenticated && state?.auth?.currentUser?.role === 'admin';
    adminGroup.style.display = isAdmin ? 'inline-block' : 'none';

    if (isAdmin && document.getElementById('admin-dashboard')?.classList.contains('active')) {
        window.renderAdminDashboard?.();
    }
}
// In main.js, after DOMContentLoaded, add:

// Call it on initial load
setTimeout(() => {
    updateTabsForRole();
}, 100);