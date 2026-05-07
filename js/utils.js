// ============================================
// UTILS.JS - Helper functions used everywhere
// ============================================

import { state } from './state.js';

// Escape HTML to prevent XSS
function escapeHTML(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#039;');
}

// Show notification
function showNotification(message, type = 'info') {
    const notif = document.createElement('div');
    notif.style.cssText = `
        position: fixed; top: 20px; right: 20px; padding: 16px 24px; 
        background: ${type === 'success' ? '#2e7d32' : type === 'error' ? '#dc2626' : '#1a73e8'};
        color: white; border-radius: 12px; z-index: 10001; animation: slideIn 0.3s;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;
    notif.textContent = message;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}

// Close all modals
function closeAllModals() {
    document.querySelectorAll('.modal-overlay, .modal').forEach(el => el.remove());
    document.body.classList.remove('modal-open');
}

// Update public counts
function updatePublicCounts() {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    set('public-team-count',  state.teams.length);
    set('public-judge-count', state.judges.length);
    set('public-round-count', state.rounds.filter(r => r.type === 'prelim').length);
}

// Check if judge has conflict
function hasConflict(judgeId, govId, oppId) {
    const judge = state.judges.find(j => j.id === judgeId);
    if (!judge) return false;
    return judge.affiliations?.includes(govId) || judge.affiliations?.includes(oppId);
}

// Get previous meetings
function getPreviousMeetings() {
    const meetings = {};
    state.rounds.forEach(round => {
        round.debates.forEach(debate => {
            if (!meetings[debate.gov]) meetings[debate.gov] = {};
            if (!meetings[debate.opp]) meetings[debate.opp] = {};
            meetings[debate.gov][debate.opp] = (meetings[debate.gov][debate.opp] || 0) + 1;
            meetings[debate.opp][debate.gov] = (meetings[debate.opp][debate.gov] || 0) + 1;
        });
    });
    return meetings;
}

// Factory for a blank speaker record
function createSpeakerObj(name) {
    return {
        id: crypto.randomUUID(),
        name,
        substantiveTotal:  0,
        substantiveCount:  0,
        substantiveScores: {},
        replyTotal:        0,
        replyCount:        0,
        replyScores:       {}
    };
}

// ============================================
// ENHANCED UTILITIES - Performance & Data Tools
// ============================================

// Debounce function for performance
function debounce(func, wait, immediate = false) {
    let timeout;
    return function executedFunction(...args) {
        const context = this;
        const later = function() {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
}

// Throttle function for performance
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Batch processor for large datasets
class BatchProcessor {
    constructor(batchSize = 100, delay = 10) {
        this.batchSize = batchSize;
        this.delay = delay;
        this.queue = [];
        this.processing = false;
    }

    add(item, processor) {
        this.queue.push({ item, processor });
        this.process();
    }

    async process() {
        if (this.processing || this.queue.length === 0) return;
        
        this.processing = true;
        
        while (this.queue.length > 0) {
            const batch = this.queue.splice(0, this.batchSize);
            
            await new Promise(resolve => {
                setTimeout(() => {
                    batch.forEach(({ item, processor }) => {
                        try {
                            processor(item);
                        } catch (e) {
                            console.error('Batch processing error:', e);
                        }
                    });
                    resolve();
                }, this.delay);
            });
        }
        
        this.processing = false;
    }

    clear() {
        this.queue = [];
    }
}

// Memoization for expensive functions
function memoize(fn, keyGenerator = (...args) => JSON.stringify(args)) {
    const cache = new Map();
    
    return function(...args) {
        const key = keyGenerator(...args);
        
        if (cache.has(key)) {
            return cache.get(key);
        }
        
        const result = fn.apply(this, args);
        cache.set(key, result);
        return result;
    };
}

// LRU Cache for limited caching
class LRUCache {
    constructor(limit = 100) {
        this.limit = limit;
        this.cache = new Map();
    }

    get(key) {
        if (!this.cache.has(key)) return undefined;
        
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.limit) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        this.cache.set(key, value);
    }

    clear() {
        this.cache.clear();
    }
}

// Performance marker
function measurePerformance(name, fn) {
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    console.log(`⏱️ ${name}: ${(end - start).toFixed(2)}ms`);
    return result;
}

// Safe JSON parse with fallback
function safeJSONParse(str, fallback = null) {
    try {
        return JSON.parse(str);
    } catch (e) {
        console.error('JSON parse error:', e);
        return fallback;
    }
}

// Deep clone with circular reference handling
function deepClone(obj, hash = new WeakMap()) {
    if (Object(obj) !== obj) return obj;
    if (hash.has(obj)) return hash.get(obj);
    
    const result = Array.isArray(obj) ? [] : {};
    hash.set(obj, result);
    
    Object.keys(obj).forEach(key => {
        result[key] = deepClone(obj[key], hash);
    });
    
    return result;
}

// Object diffing for partial updates
function diff(obj1, obj2) {
    const changes = {};
    
    function compare(o1, o2, path = '') {
        if (o1 === o2) return;
        
        if (typeof o1 !== 'object' || typeof o2 !== 'object' || o1 === null || o2 === null) {
            changes[path || '.'] = { from: o1, to: o2 };
            return;
        }
        
        const allKeys = new Set([...Object.keys(o1), ...Object.keys(o2)]);
        
        allKeys.forEach(key => {
            const newPath = path ? `${path}.${key}` : key;
            compare(o1[key], o2[key], newPath);
        });
    }
    
    compare(obj1, obj2);
    return changes;
}

export {
    // Core utilities
    escapeHTML,
    showNotification,
    closeAllModals,
    updatePublicCounts,
    hasConflict,
    getPreviousMeetings,
    createSpeakerObj,
    
    // Enhanced utilities
    debounce,
    throttle,
    BatchProcessor,
    memoize,
    LRUCache,
    measurePerformance,
    safeJSONParse,
    deepClone,
    diff
};