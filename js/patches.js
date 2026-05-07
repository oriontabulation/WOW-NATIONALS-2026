/**
 * patches.js  —  Orion Debate Tab
 * <script src="js/patches.js" defer></script>
 */
(function OrionPatches() {
  'use strict';

  // Shim to queue function calls until ES modules load
  const _queuedCalls = [];
  window.addEventListener('DOMContentLoaded', () => {
    _queuedCalls.forEach(fn => fn());
  });
  window._queueUntilLoaded = fn => {
    if (typeof switchTab === 'function') fn();
    else _queuedCalls.push(fn);
  };

  /* ────────────────────────────────────────────────────────────
     COLOR MATH HELPERS
  ──────────────────────────────────────────────────────────── */
  function hexToRgb(hex) {
    const h = hex.replace('#','');
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }
  function rgbToHex(r,g,b) {
    return '#' + [r,g,b].map(v => Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
  }
  function hexToHsl(hex) {
    let [r,g,b] = hexToRgb(hex).map(v => v/255);
    const max=Math.max(r,g,b), min=Math.min(r,g,b), l=(max+min)/2;
    if (max===min) return [0,0,l];
    const d=max-min, s=l>0.5?d/(2-max-min):d/(max+min);
    const h = max===r ? (g-b)/d+(g<b?6:0) : max===g ? (b-r)/d+2 : (r-g)/d+4;
    return [h*60, s, l];
  }
  function hslToHex(h,s,l) {
    h /= 360;
    const q = l<0.5 ? l*(1+s) : l+s-l*s, p = 2*l-q;
    const hue = t => {
      if (t<0) t+=1; if (t>1) t-=1;
      if (t<1/6) return p+(q-p)*6*t;
      if (t<1/2) return q;
      if (t<2/3) return p+(q-p)*(2/3-t)*6;
      return p;
    };
    if (s===0) { const v=Math.round(l*255); return rgbToHex(v,v,v); }
    return rgbToHex(Math.round(hue(h+1/3)*255), Math.round(hue(h)*255), Math.round(hue(h-1/3)*255));
  }
  function colorTokens(hex) {
    const [h,s,l]  = hexToHsl(hex);
    const [r,g,b]  = hexToRgb(hex);
    const hover     = hslToHex(h, Math.min(1,s*1.05), Math.max(0, l-0.1));
    const light     = hslToHex(h, Math.min(1,s*0.6),  Math.min(1, l*0.12+0.93));
    const headerBg  = hslToHex(h, Math.min(1,s*0.55), 0.07);
    const pageBg    = hslToHex(h, Math.min(1,s*0.35), 0.96);
    return {
      primary:   hex,
      hover,
      light,
      headerBg,
      pageBg,
      glow:      `rgba(${r},${g},${b},.15)`,
      glowMid:   `rgba(${r},${g},${b},.16)`,
      headerBdr: `rgba(${r},${g},${b},.6)`,
    };
  }

  /* ────────────────────────────────────────────────────────────
     COLOR STORAGE
  ──────────────────────────────────────────────────────────── */
  const COLOR_KEY = 'orion_color';
  const PRESETS   = ['#f97316','#0ea5e9','#10b981','#8b5cf6','#e11d48'];

  function loadColor() { return localStorage.getItem(COLOR_KEY) || '#f97316'; }
  function saveColor(hex) { localStorage.setItem(COLOR_KEY, hex); }

  /* ────────────────────────────────────────────────────────────
     APPLY COLOR — sets all CSS custom properties on :root
  ──────────────────────────────────────────────────────────── */
  function applyColor(hexOrId) {
    // Accept legacy theme IDs for backwards compat
    const ID_MAP = { default:'#f97316', ocean:'#0ea5e9', forest:'#10b981', violet:'#8b5cf6', crimson:'#e11d48' };
    const hex = (ID_MAP[hexOrId] || hexOrId).toLowerCase();
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return;

    saveColor(hex);
    const tk = colorTokens(hex);
    const root = document.documentElement;

    // Primary brand tokens (used by main.css, admin.css, patches.css)
    root.style.setProperty('--orange-primary', tk.primary);
    root.style.setProperty('--orange-hover',   tk.hover);
    root.style.setProperty('--orange-light',   tk.light);
    root.style.setProperty('--orange-glow',    tk.glow);
    // Patches-specific tokens
    root.style.setProperty('--t-brand',       tk.primary);
    root.style.setProperty('--t-brand-hover', tk.hover);
    root.style.setProperty('--t-brand-light', tk.light);
    root.style.setProperty('--t-brand-glow',  tk.glowMid);
    root.style.setProperty('--t-header-bg',   tk.headerBg);
    root.style.setProperty('--t-header-bdr',  tk.headerBdr);
    root.style.setProperty('--t-page-bg',     tk.pageBg);

    // Sync all picker widgets currently in the DOM
    document.querySelectorAll('.t-swatch').forEach(s => s.style.background = hex);
    document.querySelectorAll('.theme-color-wheel').forEach(i => { i.value = hex; });
    document.querySelectorAll('.theme-wheel-swatch').forEach(s => s.style.background = hex);
    document.querySelectorAll('.theme-preset').forEach(b => {
      b.classList.toggle('active', b.dataset.color === hex);
    });
  }
  window.applyTheme = applyColor;  // backwards compat
  window.applyColor = applyColor;

  /* ────────────────────────────────────────────────────────────
     THEME PICKER WIDGET
  ──────────────────────────────────────────────────────────── */
  function buildPicker(btnClass) {
    const cur = loadColor();
    const w   = document.createElement('div');
    w.className = 'theme-picker-wrapper';

    const presetHTML = PRESETS.map(c =>
      `<button type="button" class="theme-preset${cur===c?' active':''}"
        data-color="${c}" title="${c}"
        style="background:${c}"></button>`
    ).join('');

    w.innerHTML = `
      <button type="button" class="${btnClass || 'theme-picker-btn'}" aria-label="Switch theme">
        <span class="t-swatch" style="background:${cur}"></span>Theme
      </button>
      <div class="theme-dropdown">
        <div class="theme-dropdown-label">Colour theme</div>
        <div class="theme-wheel-row">
          <label class="theme-wheel-label">
            <span class="theme-wheel-swatch" style="background:${cur}"></span>
            <span class="theme-wheel-text">Pick any colour</span>
            <span class="theme-wheel-icon">🎨</span>
            <input type="color" class="theme-color-wheel" value="${cur}" tabindex="-1">
          </label>
        </div>
        <div class="theme-dropdown-label" style="margin-top:10px">Quick picks</div>
        <div class="theme-presets-row">${presetHTML}</div>
      </div>`;

    // Toggle dropdown
    w.querySelector('button.theme-picker-btn, button.adm-pill').addEventListener('click', e => {
      e.stopPropagation();
      const was = w.classList.contains('open');
      closeAll();
      if (!was) { w.classList.add('open'); positionDropdown(w); }
    });

    // Color wheel — live preview on input, save on change
    const wheel = w.querySelector('.theme-color-wheel');
    wheel.addEventListener('input',  () => applyColor(wheel.value));
    wheel.addEventListener('change', () => applyColor(wheel.value));
    wheel.addEventListener('click',  e => e.stopPropagation());

    // Label click opens wheel without closing dropdown
    w.querySelector('.theme-wheel-label').addEventListener('click', e => e.stopPropagation());

    // Preset swatches
    w.querySelectorAll('.theme-preset').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); applyColor(btn.dataset.color); });
    });

    return w;
  }

  function positionDropdown(w) {
    const btn  = w.querySelector('button');
    const drop = w.querySelector('.theme-dropdown');
    if (!btn || !drop) return;
    const r = btn.getBoundingClientRect();
    drop.style.top = (r.bottom + 6) + 'px';
    let left = r.right - drop.offsetWidth;
    if (left < 8) left = 8;
    if (left + drop.offsetWidth > window.innerWidth - 8) left = window.innerWidth - drop.offsetWidth - 8;
    drop.style.left = left + 'px';
  }

  function closeAll() { document.querySelectorAll('.theme-picker-wrapper.open').forEach(w => w.classList.remove('open')); }
  document.addEventListener('click', closeAll);
  window.addEventListener('resize', () => document.querySelectorAll('.theme-picker-wrapper.open').forEach(positionDropdown));

  function injectHeaderPicker() {
    if (document.getElementById('orion-header-picker')) return;
    const controls = document.querySelector('.header-controls');
    if (!controls) return;
    const p = buildPicker('theme-picker-btn');
    p.id = 'orion-header-picker';
    controls.insertBefore(p, document.getElementById('login-btn') || controls.firstChild);
  }

  function injectAdminPicker() {
    if (document.getElementById('orion-admin-picker')) return;
    const right = document.querySelector('.adm-topbar-right');
    if (!right) return;
    const p = buildPicker('adm-pill theme-picker-btn');
    p.id = 'orion-admin-picker';
    right.insertBefore(p, right.firstChild);
  }

  /* Admin overview inline picker (called from admin.js renderThemePicker) */
  window.renderThemePicker = function(containerId) {
    const el = containerId ? document.getElementById(containerId) : null;
    if (!el) return;
    const cur = loadColor();
    el.innerHTML = '';
    el.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;';

    // Color wheel button
    const wheelWrap = document.createElement('label');
    wheelWrap.className = 'theme-inline-wheel';
    wheelWrap.title = 'Pick any colour';
    wheelWrap.innerHTML = `
      <span class="theme-wheel-swatch" style="background:${cur};width:28px;height:28px;border-radius:50%;display:inline-block;border:2px solid #e2e8f0;flex-shrink:0;cursor:pointer;transition:transform .15s;"></span>
      <span style="font-size:13px;font-weight:600;color:#1e293b">Pick any colour</span>
      <span style="font-size:16px">🎨</span>
      <input type="color" class="theme-color-wheel" value="${cur}"
        style="position:absolute;width:0;height:0;opacity:0;pointer-events:none;">`;
    wheelWrap.style.cssText = 'position:relative;display:inline-flex;align-items:center;gap:8px;padding:7px 14px;border-radius:10px;border:1.5px solid #e2e8f0;background:white;cursor:pointer;transition:border-color .18s;';
    const wInput = wheelWrap.querySelector('input');
    wInput.addEventListener('input',  () => {
      applyColor(wInput.value);
      wheelWrap.querySelector('.theme-wheel-swatch').style.background = wInput.value;
    });
    wInput.addEventListener('change', () => applyColor(wInput.value));
    el.appendChild(wheelWrap);

    // Divider
    const div = document.createElement('span');
    div.style.cssText = 'width:1px;height:28px;background:#e2e8f0;flex-shrink:0;';
    el.appendChild(div);

    // Preset swatches
    PRESETS.forEach(c => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = c;
      btn.style.cssText = `width:26px;height:26px;border-radius:50%;background:${c};border:2.5px solid ${cur===c?c:'transparent'};
        box-shadow:${cur===c?'0 0 0 2px '+c+', 0 0 0 4px white':''};
        outline:${cur===c?'2px solid '+c:'none'};outline-offset:2px;
        cursor:pointer;transition:all .18s;flex-shrink:0;padding:0;`;
      btn.addEventListener('click', () => {
        applyColor(c);
        window.renderThemePicker(containerId);
      });
      el.appendChild(btn);
    });
  };

    /* ────────────────────────────────────────────────────────────
     SELECTOR MEMORY
  ──────────────────────────────────────────────────────────── */
  const PREF_KEY = 'orion_draw_prefs';
  function loadPrefs()      { try { return JSON.parse(localStorage.getItem(PREF_KEY)||'{}'); } catch(e){ return {}; } }
  function savePref(k, v)   { const p=loadPrefs(); p[k]=v; try{localStorage.setItem(PREF_KEY,JSON.stringify(p));}catch(e){} }
  window._saveDrawPref      = savePref;
  window._admSaveDrawPref   = savePref;

  const SEL_IDS = ['cr-pair','cr-sides','adm-pair-method','adm-side-method','round-filter'];
  function attachSelectors() {
    const prefs = loadPrefs();
    SEL_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (prefs[id] !== undefined) el.value = prefs[id];
      if (!el._pb) { el._pb = true; el.addEventListener('change', () => savePref(id, el.value)); }
    });
  }

  /* ────────────────────────────────────────────────────────────
     ENTER KEY FLOW: username → password → submit
  ──────────────────────────────────────────────────────────── */
  function patchEnterKey() {
    const u = document.getElementById('loginUsername');
    const p = document.getElementById('loginPassword');
    if (u && !u._eb) { u._eb = true; u.addEventListener('keydown', e => { if (e.key==='Enter'){e.preventDefault();p&&p.focus();} }); }
  }

  /* ────────────────────────────────────────────────────────────
     BODY ROLE CLASS
  ──────────────────────────────────────────────────────────── */
  function updateRole() {
    const role = window.state?.auth?.currentUser?.role || 'guest';
    document.body.className = document.body.className.replace(/\brole-\w+\b/g,'').trim() + ' role-' + role;
  }

  /* ────────────────────────────────────────────────────────────
     INELIGIBILITY FIX
  ──────────────────────────────────────────────────────────── */
  function patchToggleIneligible() {
    if (!window.adminToggleIneligible || window.adminToggleIneligible._p) return;
    const orig = window.adminToggleIneligible;
    window.adminToggleIneligible = function(teamId, checked) {
      orig(teamId, checked);
      const cell = document.getElementById('inelig-reason-cell-' + teamId);
      if (!cell) return;
      if (checked && !cell.querySelector('input')) {
        cell.innerHTML = `<input type="text" placeholder="Reason (optional)…"
          onchange="window.adminSetIneligibleReason&&window.adminSetIneligibleReason('${teamId}',this.value)"
          style="width:100%;padding:5px 8px;border:1px solid #fca5a5;border-radius:6px;font-size:12px;background:#fff5f5;color:#991b1b">`;
      } else if (!checked) {
        cell.innerHTML = `<span style="color:#cbd5e1;font-size:12px">—</span>`;
      }
    };
    window.adminToggleIneligible._p = true;
  }

  /* ────────────────────────────────────────────────────────────
     OBSERVE DOM for admin topbar
  ──────────────────────────────────────────────────────────── */
  new MutationObserver(() => {
    if (document.querySelector('.adm-topbar')) injectAdminPicker();
    // Also re-run hero injection in case content was dynamically replaced
  
  }).observe(document.body, { childList:true, subtree:true });

  /* ────────────────────────────────────────────────────────────
     WRAP switchTab — run lightweight tasks after every switch
  ──────────────────────────────────────────────────────────── */
  function wrapSwitchTab() {
    if (!window.switchTab || window.switchTab._w) return;
    const orig = window.switchTab;
    window.switchTab = function(tabId) {
      orig.call(this, tabId);
      setTimeout(() => {
        updateRole();
        attachSelectors();
        patchToggleIneligible();
        injectHeaderPicker();
          }, 80);
    };
    window.switchTab._w = true;
  }

  /* ────────────────────────────────────────────────────────────
     INIT
  ──────────────────────────────────────────────────────────── */
  function init() {
    applyColor(loadColor());
    injectHeaderPicker();
    patchEnterKey();
    updateRole();
    attachSelectors();
    patchToggleIneligible();
    wrapSwitchTab();
  
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.addEventListener('load', () => { init(); wrapSwitchTab(); });

  // Brief poll for late module attachment
  let n = 0;
  const t = setInterval(() => {
    wrapSwitchTab(); injectHeaderPicker();
    if (++n > 12) clearInterval(t);
  }, 500);

  /* ────────────────────────────────────────────────────────────
     SPEAKER DOMAT — public speaker standings tab
     Renders a standalone speaker leaderboard with optional
     category sub-tabs.  Call window.renderSpeakerDomat(containerId)
     from any tab HTML, or it auto-runs if #speaker-domat exists.
  ──────────────────────────────────────────────────────────── */

  function computeSpeakerRankings(categoryFilter) {
    const state  = window.state;
    if (!state) return [];
    const teams  = state.teams  || [];
    const rounds = state.rounds || [];

    // Build speaker map: speakerId → { name, teamName, category, scores[] }
    const speakers = new Map();

    teams.forEach(team => {
      (team.speakers || []).forEach(spk => {
        if (!spk.id) return;
        speakers.set(String(spk.id), {
          id:       spk.id,
          name:     spk.name || '?',
          teamName: team.name || '?',
          teamId:   team.id,
          category: team.category || spk.category || null,
          scores:   [],
          replyScores: []
        });
      });
    });

    rounds.forEach(round => {
      if (round.blinded) return;          // respect blind rounds
      (round.debates || []).forEach(debate => {
        if (!debate.entered) return;
        ['gov','opp'].forEach(side => {
          const res = debate[`${side}Results`];
          if (!res) return;
          (res.substantive || []).forEach(s => {
            const spk = speakers.get(String(s.speakerId));
            if (spk) spk.scores.push(s.score);
          });
          if (res.reply?.speakerId) {
            const spk = speakers.get(String(res.reply.speakerId));
            if (spk) spk.replyScores.push(res.reply.score);
          }
        });
      });
    });

    let list = [...speakers.values()]
      .filter(s => s.scores.length > 0);

    if (categoryFilter && categoryFilter !== 'all') {
      list = list.filter(s => (s.category || 'Uncategorised') === categoryFilter);
    }

    list.forEach(s => {
      s.total = s.scores.reduce((a,b) => a+b, 0);
      s.avg   = s.scores.length ? (s.total / s.scores.length) : 0;
      s.replyTotal = s.replyScores.reduce((a,b) => a+b, 0);
    });

    list.sort((a,b) => b.total - a.total || b.avg - a.avg);
    list.forEach((s,i) => { s.rank = i + 1; });
    return list;
  }

  function getAllCategories() {
    const state = window.state;
    if (!state) return [];
    const cats = new Set();
    (state.teams || []).forEach(t => {
      const cat = t.category || null;
      if (cat) cats.add(cat);
      (t.speakers || []).forEach(s => { if (s.category) cats.add(s.category); });
    });
    return [...cats];
  }

  let _domat_cat = 'all';

  window.renderSpeakerDomat = function(containerId, categoryFilter) {
    const el = containerId ? document.getElementById(containerId) : null;
    if (!el) return;
    if (categoryFilter !== undefined) _domat_cat = categoryFilter;
    const cat = _domat_cat;

    const cats = getAllCategories();
    const hasCats = cats.length > 0;
    const isPublic = !window.state?.auth?.currentUser || window.state.auth.currentUser.role === 'guest';

    // Category tab bar
    const tabBar = hasCats ? `
      <div class="spk-cat-tabs">
        <button class="spk-cat-tab ${cat==='all'?'active':''}" onclick="window.renderSpeakerDomat('${containerId}','all')">All Speakers</button>
        ${cats.map(c => `<button class="spk-cat-tab ${cat===c?'active':''}" onclick="window.renderSpeakerDomat('${containerId}','${c.replace(/'/g,"\\'")}')">🏷 ${c}</button>`).join('')}
      </div>` : '';

    const speakers = computeSpeakerRankings(cat === 'all' ? null : cat);
    if (speakers.length === 0) {
      el.innerHTML = tabBar + `<div class="adm-empty" style="padding:40px 0;text-align:center;color:#94a3b8;">No speaker scores entered yet.</div>`;
      return;
    }

    const cards = speakers.map(s => {
      const rankClass = s.rank <= 3 ? `spk-domat-rank--${s.rank}` : 'spk-domat-rank--n';
      const medal = s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : s.rank === 3 ? '🥉' : s.rank;
      return `
        <div class="spk-domat-card">
          <div class="spk-domat-rank ${rankClass}">${medal}</div>
          <div class="spk-domat-info">
            <div class="spk-domat-name">${escHTML(s.name)}</div>
            <div class="spk-domat-team">${escHTML(s.teamName)}${s.category ? ` · <em>${escHTML(s.category)}</em>` : ''}</div>
          </div>
          <div class="spk-domat-scores">
            <div class="spk-domat-total">${s.total.toFixed(1)}</div>
            <div class="spk-domat-avg">avg ${s.avg.toFixed(1)}</div>
          </div>
        </div>`;
    }).join('');

    el.innerHTML = tabBar + `<div class="spk-domat-grid">${cards}</div>`;
  };

  function escHTML(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* Auto-render if the domat container already exists in DOM */
  function tryAutoDomat() {
    const el = document.getElementById('spk-domat-body');
    if (el) window.renderSpeakerDomat('spk-domat-body');
  }

  /* ────────────────────────────────────────────────────────────
     SPEAKER FILTER COUNT — hide from non-admin roles
     The .filter-bar__count badge ("11 visible · 4 hidden") is
     already hidden via patches.css for role-guest/team/judge.
     This JS guard also suppresses the text for any dynamically
     rendered counts before CSS loads.
  ──────────────────────────────────────────────────────────── */
  function patchFilterCounts() {
    const role = window.state?.auth?.currentUser?.role || 'guest';
    if (role === 'admin') return;   // admins see everything
    document.querySelectorAll('.filter-bar__count').forEach(el => {
      el.style.display = 'none';
    });
  }

  // ── Patch body theming to include dark/light text switch ─────
  const _origApplyColor = window.applyColor;
  window.applyColor = function(hex) {
    _origApplyColor && _origApplyColor(hex);
    // Compute perceived luminance to optionally darken body bg more on dark themes
    const ID_MAP = { default:'#f97316', ocean:'#0ea5e9', forest:'#10b981', violet:'#8b5cf6', crimson:'#e11d48' };
    const h = (ID_MAP[hex] || hex).replace('#','');
    if (!/^[0-9a-f]{6}$/i.test(h)) return;
    const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
    // Expose RGB components for CSS color-mix fallback
    document.documentElement.style.setProperty('--t-brand-rgb', `${r} ${g} ${b}`);
  };

  // ── Extend init and switchTab hooks ─────────────────────────
  const _baseInit = window.init;

  window.init = function init() {
    _baseInit && _baseInit();
    tryAutoDomat();
    patchFilterCounts();
  };

  // Re-run filter patch after every tab switch
  const _baseSwitchWrap = window.switchTab;
  // Will be patched once switchTab is available (via wrapSwitchTab above)
  const _origWrap = window.switchTab;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { tryAutoDomat(); patchFilterCounts(); });
  else { tryAutoDomat(); patchFilterCounts(); }
  window.addEventListener('load', () => { tryAutoDomat(); patchFilterCounts(); });

  // Poll for domat container
  let _dm = 0;
  const _dmt = setInterval(() => {
    tryAutoDomat();
    patchFilterCounts();
    if (++_dm > 10) clearInterval(_dmt);
  }, 600);

  // Shim inline onclick handlers that call undefined window functions
  function _onclickShim(handlerCode) {
    return function(e) {
      if (typeof switchTab === 'undefined') {
        e.preventDefault();
        _queuedCalls.push(() => switchTab(handlerCode.match(/switchTab\('(\w+)'\)/)?.[1] || handlerCode));
        return;
      }
      try { eval(handlerCode); } catch(err) { console.error('onclick shim error:', err); }
    };
  }

  // Wrap all onclick handlers in main.html that use switchTab/logout/showLoginModal
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      document.querySelectorAll('[onclick*="switchTab"], [onclick*="logout()"], [onclick*="showLoginModal"]').forEach(el => {
        const oc = el.getAttribute('onclick');
        if (oc && !el._wrapped) { el._wrapped = true; el.onclick = _onclickShim(oc); }
      });
    }, 100);
  });

})();