// ============================================
// ID SYSTEM - Universal ID generation and tracking
// ============================================

// ID prefixes for different entity types
const ID_PREFIX = {
    TEAM: 't',
    JUDGE: 'j',
    SPEAKER: 's',
    ROUND: 'r',
    DEBATE: 'd',
    USER: 'u'
};

// Generate a unique ID with prefix and timestamp + random
export function generateId(prefix, existingIds = new Set()) {
    let id;
    do {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        id = `${prefix}_${timestamp}_${random}`;
    } while (existingIds.has(id));
    return id;
}

// Extract prefix from ID
export function getIdPrefix(id) {
    return id ? id.split('_')[0] : null;
}

// Validate ID format
export function isValidId(id, expectedPrefix) {
    if (!id || typeof id !== 'string') return false;
    const prefix = id.split('_')[0];
    return prefix === expectedPrefix;
}

// Create a tracker for existing IDs
export class IdTracker {
    constructor() {
        this.ids = new Set();
    }

    add(id) {
        if (id) this.ids.add(id);
    }

    has(id) {
        return this.ids.has(id);
    }

    generate(prefix) {
        return generateId(prefix, this.ids);
    }

    // Load existing IDs from data
    loadFromTeams(teams) {
        (teams || []).forEach(team => {
            this.add(team.id);
            (team.speakers || []).forEach(speaker => {
                if (speaker.id) this.add(speaker.id);
            });
        });
    }

    loadFromJudges(judges) {
        (judges || []).forEach(judge => this.add(judge.id));
    }

    loadFromRounds(rounds) {
        (rounds || []).forEach(round => {
            this.add(round.id);
            (round.debates || []).forEach(debate => {
                if (debate.id) this.add(debate.id);
            });
        });
    }

    loadFromUsers(users) {
        (users || []).forEach(user => this.add(user.id));
    }
}

// Normalize ID to string for consistent comparison
export function normalizeId(id) {
    return id ? String(id) : null;
}

// Compare two IDs safely
export function idsEqual(id1, id2) {
    return normalizeId(id1) === normalizeId(id2);
}