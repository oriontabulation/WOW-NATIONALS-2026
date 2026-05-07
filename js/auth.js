// ============================================
// AUTH.JS - Authentication and user management
// ============================================

import { state, save } from './state.js';
import { showNotification, closeAllModals, escapeHTML, createSpeakerObj } from './utils.js';

// Show login modal
function showLoginModal() {
    closeAllModals();

    const overlay    = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick  = e => { if (e.target === overlay) closeAllModals(); };

    const modal      = document.createElement('div');
    modal.className  = 'modal';

    const judgeOptions = (state.judges || []).map(j =>
        `<option value="${j.id}">${escapeHTML(j.name)} (${j.role})</option>`
    ).join('');

    const teamOptions = (state.teams || []).map(t =>
        `<option value="${t.id}">${escapeHTML(t.name)}</option>`
    ).join('');

    modal.innerHTML = `
        <div class="auth-logo-wrap">
            <img src="IMG/logo.jpeg" alt="Orion logo" class="auth-logo">
            <p class="auth-brand">A PRODUCT OF MINDCRAFT</p>
        </div>

        <!-- Tab buttons -->
        <div class="auth-tabs">
            <button id="loginTabBtn" class="auth-tab-btn is-active" onclick="window.switchAuthTab('login')">Login</button>
            <button id="registerTabBtn" class="auth-tab-btn" onclick="window.switchAuthTab('register')">Register</button>
        </div>

        <!-- LOGIN FORM -->
        <div id="loginForm">
            <div id="loginError" class="form-error"></div>

            <div class="form-group">
                <label class="form-label">Username</label>
                <input type="text" id="loginUsername" class="form-input form-input--lg" placeholder="Enter your username">
            </div>

            <div class="form-group">
                <label class="form-label">Password</label>
                <input type="password" id="loginPassword" class="form-input form-input--lg" placeholder="Enter your password">
            </div>

            <button onclick="window.handleLogin()" class="btn btn-primary btn-full u-mb-sm">Login</button>

            <div class="auth-divider">
                <a href="#" onclick="window.showForgotPassword(); return false;" class="auth-link">Forgot Password?</a>
            </div>

            <button onclick="window.guestLogin()" class="btn btn-secondary btn-full">Continue as Guest</button>
        </div>

        <!-- REGISTRATION FORM -->
        <div id="registerForm" style="display:none;">
            <div id="registerError" class="form-error"></div>

            <div class="form-group form-group--sm">
                <label class="form-label">Full Name <span class="required">*</span></label>
                <input type="text" id="registerName" class="form-input" placeholder="Enter your full name">
            </div>

            <div class="form-group form-group--sm">
                <label class="form-label">Email <span class="required">*</span></label>
                <input type="email" id="registerEmail" class="form-input" placeholder="Enter your email">
            </div>

            <div class="form-group form-group--sm">
                <label class="form-label">Username <span class="required">*</span></label>
                <input type="text" id="registerUsername" class="form-input" placeholder="Choose a username">
            </div>

            <div class="form-group form-group--sm">
                <label class="form-label">Password <span class="required">*</span></label>
                <input type="password" id="registerPassword" class="form-input" placeholder="Minimum 8 characters">
            </div>

            <div class="form-group form-group--sm">
                <label class="form-label">Confirm Password <span class="required">*</span></label>
                <input type="password" id="registerConfirmPassword" class="form-input" placeholder="Confirm your password">
            </div>

            <div class="form-group form-group--sm">
                <label class="form-label">Select Role:</label>
                <select id="registerRole" class="form-select" onchange="window.toggleAssociationFields(this.value)">
                    <option value="public">Observer</option>
                    <option value="judge">Judge</option>
                    <option value="team">Debater</option>
                </select>
            </div>

            <!-- Judge Association -->
            <div id="judgeAssociationField" class="form-group form-group--sm" style="display:none;">
                <label class="form-label">Link to Judge Profile</label>
                <select id="registerJudgeAssociation" class="form-select">
                    <option value="">-- Select your judge profile --</option>
                    ${judgeOptions || '<option value="" disabled>No judges available — contact the admin</option>'}
                </select>
                <p class="form-hint">Select your name from the judges list. If you are not listed, ask the tournament admin to add you first.</p>
            </div>

            <!-- Team Association -->
            <div id="teamAssociationField" class="form-group form-group--sm" style="display:none;">
                <label class="form-label">Link to Team</label>
                <select id="registerTeamAssociation" class="form-select">
                    <option value="">-- Select your team --</option>
                    ${teamOptions || '<option value="" disabled>No teams available — contact the admin</option>'}
                </select>
                <p class="form-hint">Select your team from the list. If your team is not listed, ask the tournament admin to register it first.</p>
            </div>

            <div class="form-group form-group--sm">
                <label class="form-checkbox-label">
                    <input type="checkbox" id="registerTerms" class="form-checkbox">
                    <span>I agree to the <a href="#" onclick="window.showTerms(); return false;" class="auth-link">Terms of Service</a> and <a href="#" onclick="window.showPrivacy(); return false;" class="auth-link">Privacy Policy</a></span>
                </label>
            </div>

            <button onclick="window.registerUser()" class="btn btn-success btn-full u-mb-sm">Create Account</button>

            <div class="form-note">
                <p class="u-mb-0"><strong>📋 Note:</strong> Your data will not be shared with third parties.</p>
            </div>
        </div>

        <div class="auth-footer">
            <button onclick="window.closeAllModals()" class="auth-close-btn">Close</button>
        </div>
        <div class="auth-footer">
            <a href="login.html" class="auth-link">Go to full login page →</a>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    document.body.classList.add('modal-open');

    // Ensure tab buttons work after DOM is ready
    setTimeout(() => {
        const registerTabBtn = document.getElementById('registerTabBtn');
        const loginTabBtn    = document.getElementById('loginTabBtn');
        if (registerTabBtn) registerTabBtn.onclick = () => switchAuthTab('register');
        if (loginTabBtn)    loginTabBtn.onclick    = () => switchAuthTab('login');
    }, 100);
}

// Switch auth tab
function switchAuthTab(tab) {
    const loginForm    = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const loginTab     = document.getElementById('loginTabBtn');
    const registerTab  = document.getElementById('registerTabBtn');

    if (!loginForm || !registerForm || !loginTab || !registerTab) return;

    if (tab === 'login') {
        loginForm.style.display    = 'block';
        registerForm.style.display = 'none';
        loginTab.classList.add('is-active');
        registerTab.classList.remove('is-active');
    } else {
        loginForm.style.display    = 'none';
        registerForm.style.display = 'block';
        registerTab.classList.add('is-active');
        loginTab.classList.remove('is-active');
    }
}

// Toggle association fields
function toggleAssociationFields(role) {
    const judgeField    = document.getElementById('judgeAssociationField');
    const teamField     = document.getElementById('teamAssociationField');
    const newJudgeFields = document.getElementById('newJudgeFields');
    const newTeamFields  = document.getElementById('newTeamFields');

    if (judgeField)    judgeField.style.display    = role === 'judge' ? 'block' : 'none';
    if (teamField)     teamField.style.display     = role === 'team'  ? 'block' : 'none';
    if (newJudgeFields) newJudgeFields.style.display = 'none';
    if (newTeamFields)  newTeamFields.style.display  = 'none';
}

function handleJudgeAssociationChange() {
    const judgeAssociation = document.getElementById('registerJudgeAssociation')?.value;
    const newJudgeFields   = document.getElementById('newJudgeFields');
    if (newJudgeFields) {
        newJudgeFields.style.display = judgeAssociation === 'CREATE_NEW' ? 'block' : 'none';
    }
}

function handleTeamAssociationChange() {
    const teamAssociation = document.getElementById('registerTeamAssociation')?.value;
    const newTeamFields   = document.getElementById('newTeamFields');
    if (newTeamFields) {
        newTeamFields.style.display = teamAssociation === 'CREATE_NEW' ? 'block' : 'none';
    }
}

// Guest login
function guestLogin() {
    state.auth.currentUser = {
        id: 'guest', username: 'guest', role: 'public',
        name: 'Guest User', isGuest: true
    };
    state.auth.isAuthenticated = true;
    state.auth.lastActivity    = Date.now();

    closeAllModals();
    updateHeaderControls();
    updateTabsForRole();
    window.switchTab?.('public');
    showNotification('Viewing as guest', 'info');
    setTimeout(() => window.updateAdminDropdownVisibility?.(), 100);
}

// Logout
function logout() {
    state.auth.isAuthenticated = false;
    state.auth.currentUser     = null;
    state.auth.lastActivity    = Date.now();
    save();

    document.body.classList.remove('admin-mode');
    document.querySelector('header')?.classList.remove('nav--hidden');
    document.querySelector('.dropdown-menu-container')?.classList.remove('nav--hidden');

    updateHeaderControls();
    updateTabsForRole();
    window.initAdminDashboard?.();
    window.switchTab?.('public');
    showNotification('Logged out', 'info');
    setTimeout(() => window.updateAdminDropdownVisibility?.(), 100);
}

// Register user
function registerUser() {
    console.log('Registration started');

    const name            = document.getElementById('registerName')?.value.trim();
    const email           = document.getElementById('registerEmail')?.value.trim();
    const username        = document.getElementById('registerUsername')?.value.trim();
    const password        = document.getElementById('registerPassword')?.value;
    const confirmPassword = document.getElementById('registerConfirmPassword')?.value;
    const role            = document.getElementById('registerRole')?.value;
    const terms           = document.getElementById('registerTerms')?.checked;

    const showError = (msg) => {
        const el = document.getElementById('registerError');
        if (el) { el.textContent = msg; el.classList.add('is-visible'); }
    };
    const hideError = () => {
        const el = document.getElementById('registerError');
        if (el) el.classList.remove('is-visible');
    };
    hideError();

    if (role === 'admin') {
        showError('Admin accounts cannot be self-registered. Contact the tournament administrator.');
        return;
    }
    if (!name || !email || !username || !password || !confirmPassword) {
        showError('Please fill in all required fields');
        return;
    }
    if (password.length < 8) {
        showError('Password must be at least 8 characters long');
        return;
    }
    if (password !== confirmPassword) {
        showError('Passwords do not match');
        return;
    }
    if (!terms) {
        showError('You must agree to the Terms of Service');
        return;
    }
    if (state.auth.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        showError('Username already taken');
        return;
    }
    if (state.auth.users.some(u => u.email?.toLowerCase() === email.toLowerCase())) {
        showError('Email already registered');
        return;
    }

    let associatedId = null;

    if (role === 'judge') {
        const val = document.getElementById('registerJudgeAssociation')?.value;
        if (!val) { showError('Please select your judge profile from the list.'); return; }
        if (val === 'CREATE_NEW') { showError('New judge profiles must be created by the tournament admin.'); return; }
        associatedId = val;
    } else if (role === 'team') {
        const val = document.getElementById('registerTeamAssociation')?.value;
        if (!val) { showError('Please select your team from the list.'); return; }
        if (val === 'CREATE_NEW') { showError('New teams must be created by the tournament admin.'); return; }
        associatedId = parseInt(val);
    }

    const newUser = {
        id: state.auth.users.length > 0 ? Math.max(...state.auth.users.map(u => u.id)) + 1 : 1,
        username, password, role, name, email,
        associatedId, createdAt: new Date().toISOString(),
        lastLogin: null, status: 'active'
    };

    state.auth.users.push(newUser);
    save();

    state.auth.currentUser = {
        id: newUser.id, username: newUser.username, role: newUser.role,
        name: newUser.name, email: newUser.email, associatedId: newUser.associatedId
    };
    state.auth.isAuthenticated = true;
    state.auth.lastActivity    = Date.now();

    closeAllModals();
    updateHeaderControls();
    updateTabsForRole();
    showNotification(`✅ Registration successful! Welcome, ${name}!`, 'success');
    window.switchTab?.(role === 'public' ? 'public' : 'standings');
    window.initAdminDashboard?.();
    setTimeout(() => window.updateAdminDropdownVisibility?.(), 100);
    console.log('Registration complete:', newUser);
}

// Handle login
function handleLogin() {
    const username = document.getElementById('loginUsername')?.value.trim();
    const password = document.getElementById('loginPassword')?.value;

    const showError = (msg) => {
        const el = document.getElementById('loginError');
        if (el) { el.textContent = msg; el.classList.add('is-visible'); }
    };
    const hideError = () => {
        const el = document.getElementById('loginError');
        if (el) el.classList.remove('is-visible');
    };
    hideError();

    if (!username || !password) {
        showError('Please enter username and password');
        return;
    }

    const user = state.auth.users.find(u =>
        u.username.toLowerCase() === username.toLowerCase() &&
        u.password === password
    );

    if (user) {
        user.lastLogin = new Date().toISOString();
        state.auth.currentUser = {
            id: user.id, username: user.username, role: user.role,
            name: user.name, email: user.email, associatedId: user.associatedId
        };
        state.auth.isAuthenticated = true;
        state.auth.lastActivity    = Date.now();

        save();
        closeAllModals();
        updateHeaderControls();
        updateTabsForRole();
        window.initAdminDashboard?.();
        showNotification(`Welcome back, ${user.name}!`, 'success');
        setTimeout(() => window.updateAdminDropdownVisibility?.(), 100);

        if (user.role === 'admin')        window.switchTab?.('admin-dashboard');
        else if (user.role === 'judge' || user.role === 'team') window.switchTab?.('standings');
        else window.switchTab?.('public');
    } else {
        showError('User not found. Please register.');
        setTimeout(() => {
            if (document.getElementById('registerTabBtn')) switchAuthTab('register');
        }, 2000);
    }
}

// Update header controls
function updateHeaderControls() {
    const container = document.querySelector('.header-controls');
    if (!container) return;

    if (!state.auth.isAuthenticated || !state.auth.currentUser) {
        container.innerHTML = `<button onclick="window.showLoginModal()" class="btn btn-primary btn-sm">Login</button>`;
    } else {
        const user = state.auth.currentUser;
        container.innerHTML = `
            <span class="role-badge role-${user.role}">
                <a href="#" class="auth-link">${user.role.toUpperCase()}</a>
            </span>
            <button onclick="window.logout()" class="btn btn-logout btn-sm">LOGOUT</button>
        `;
    }
}

// Update tabs based on user role
function updateTabsForRole() {
    const isAdmin = state.auth?.isAuthenticated && state.auth?.currentUser?.role === 'admin';
    const isJudge = state.auth?.isAuthenticated && state.auth?.currentUser?.role === 'judge';
    const isTeam  = state.auth?.isAuthenticated && state.auth?.currentUser?.role === 'team';
    const isGuest = state.auth?.isAuthenticated && state.auth?.currentUser?.isGuest;

    const tabButtons = document.querySelectorAll('.dropdown-item, .tab-btn');

    tabButtons.forEach(btn => {
        // Support both onclick="switchTab('x')" attribute strings AND
        // data-action="switchTab" data-id="x" (addEventListener-wired buttons).
        const onclick  = btn.getAttribute('onclick') || '';
        const dataId   = btn.dataset?.id || '';
        // Combine both sources into one string for uniform matching
        const tabHint  = onclick + ' ' + dataId;

        const alwaysVisible = ['public', 'standings', 'speakers', 'results', 'motions'].some(id =>
            tabHint.includes(`'${id}'`) || tabHint.includes(`"${id}"`) || tabHint === id
        );
        const adminOnly = ['admin-dashboard', 'import', 'portal'].some(id =>
            tabHint.includes(`'${id}'`) || tabHint.includes(`"${id}"`) || tabHint === id
        );
        const judgeOnly = ['feedback'].some(id =>
            tabHint.includes(`'${id}'`) || tabHint.includes(`"${id}"`) || tabHint === id
        );

        if (alwaysVisible)  { btn.style.display = ''; return; }
        if (adminOnly)      { btn.style.display = isAdmin ? '' : 'none'; return; }
        if (judgeOnly)      { btn.style.display = (isAdmin || isJudge) ? '' : 'none'; return; }

        if (isGuest) {
            btn.style.display = 'none';
        } else {
            btn.style.display = state.auth.isAuthenticated ? '' : 'none';
        }
    });

    window.updateAdminDropdownVisibility?.();
}

// Check auth
function checkAuth() {
    return state.auth.isAuthenticated && state.auth.currentUser;
}

// Render profile
function renderProfile() {
    const container = document.getElementById('profile');
    if (!container) return;

    if (!state.auth.isAuthenticated || !state.auth.currentUser) {
        container.innerHTML = '<p class="u-text-muted u-text-center" style="padding:40px;">Please log in to view your profile</p>';
        return;
    }

    const user = state.auth.currentUser;
    const icon = user.role === 'admin' ? '👨‍💼' : user.role === 'judge' ? '⚖️' : '🗣️';

    container.innerHTML = `
        <div class="profile-wrap">
            <div class="profile-avatar">${icon}</div>
            <div>
                <h2 class="u-mt-0 u-mb-sm">${escapeHTML(user.name)}</h2>
                <span class="role-badge role-${user.role}">${user.role.toUpperCase()}</span>
                <p class="u-text-muted u-mt-lg u-mb-0">${escapeHTML(user.email || 'No email')}</p>
                <p class="u-text-muted u-mb-0">Username: ${escapeHTML(user.username)}</p>
            </div>
        </div>
    `;
}

export {
    showLoginModal, switchAuthTab, toggleAssociationFields,
    handleJudgeAssociationChange, handleTeamAssociationChange,
    guestLogin, logout, registerUser, handleLogin,
    updateHeaderControls, updateTabsForRole, checkAuth, renderProfile
};
