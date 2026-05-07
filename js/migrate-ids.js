// ============================================
// ID MIGRATION SCRIPT
// Run once to migrate existing data to new ID system
// ============================================
// FIX: Previously, references inside debates (gov, opp, panel, speakerId, etc.)
// were assigned brand-new random IDs instead of the already-mapped values,
// silently breaking every team↔debate and judge↔debate relationship.
// Now we build explicit old→new mapping tables first, then rewrite all refs.
// ============================================

import { state, save } from './state.js';
import { generateId, IdTracker } from './id-system.js';

export function migrateToNewIds() {
    console.log('Starting ID migration...');

    const tracker = new IdTracker();
    const changes = { teams: 0, judges: 0, speakers: 0, rounds: 0, debates: 0, users: 0 };

    // ── Build old→new mapping tables BEFORE touching any data ────────────────
    const teamMap    = new Map(); // oldTeamId    → newTeamId
    const judgeMap   = new Map(); // oldJudgeId   → newJudgeId
    const speakerMap = new Map(); // oldSpeakerId → newSpeakerId
    const roundMap   = new Map(); // oldRoundId   → newRoundId
    const debateMap  = new Map(); // oldDebateId  → newDebateId
    const userMap    = new Map(); // oldUserId    → newUserId

    (state.teams || []).forEach(team => {
        const newId = tracker.generate('t');
        tracker.add(newId);
        teamMap.set(String(team.id), newId);
        changes.teams++;

        (team.speakers || []).forEach(sp => {
            const newSpId = tracker.generate('s');
            tracker.add(newSpId);
            speakerMap.set(String(sp.id), newSpId);
            changes.speakers++;
        });
    });

    (state.judges || []).forEach(judge => {
        const newId = tracker.generate('j');
        tracker.add(newId);
        judgeMap.set(String(judge.id), newId);
        changes.judges++;
    });

    (state.rounds || []).forEach(round => {
        const newId = tracker.generate('r');
        tracker.add(newId);
        roundMap.set(String(round.id), newId);
        changes.rounds++;

        (round.debates || []).forEach(debate => {
            const newDebId = tracker.generate('d');
            tracker.add(newDebId);
            debateMap.set(String(debate.id), newDebId);
            changes.debates++;
        });
    });

    (state.auth?.users || []).forEach(user => {
        const newId = tracker.generate('u');
        tracker.add(newId);
        userMap.set(String(user.id), newId);
        changes.users++;
    });

    // ── Helper: resolve an old ID through the correct map ────────────────────
    const remap = (map, oldId) => (oldId != null ? (map.get(String(oldId)) ?? oldId) : oldId);

    // ── Rewrite teams & speakers ─────────────────────────────────────────────
    if (state.teams) {
        state.teams = state.teams.map(team => ({
            ...team,
            id: remap(teamMap, team.id),
            speakers: (team.speakers || []).map(sp => ({
                ...sp,
                id: remap(speakerMap, sp.id)
            }))
        }));
    }

    // ── Rewrite judges ────────────────────────────────────────────────────────
    if (state.judges) {
        state.judges = state.judges.map(judge => ({
            ...judge,
            id: remap(judgeMap, judge.id),
            affiliations: (judge.affiliations || []).map(a => remap(teamMap, a))
        }));
    }

    // ── Rewrite rounds, debates, and all cross-references ────────────────────
    if (state.rounds) {
        state.rounds = state.rounds.map(round => ({
            ...round,
            id: remap(roundMap, round.id),
            debates: (round.debates || []).map(debate => {
                const remapSubstantive = arr =>
                    (arr || []).map(s => ({ ...s, speakerId: remap(speakerMap, s.speakerId) }));

                const remapResults = results => results ? {
                    ...results,
                    substantive: remapSubstantive(results.substantive),
                    reply: results.reply
                        ? { ...results.reply, speakerId: remap(speakerMap, results.reply.speakerId) }
                        : results.reply
                } : results;

                const remapBpSpeakers = bpSpeakers => {
                    if (!bpSpeakers) return bpSpeakers;
                    const out = {};
                    for (const pos of ['og','oo','cg','co']) {
                        out[pos] = (bpSpeakers[pos] || []).map(s => ({
                            ...s,
                            speakerId: remap(speakerMap, s.speakerId)
                        }));
                    }
                    return out;
                };

                return {
                    ...debate,
                    id:         remap(debateMap,  debate.id),
                    gov:        remap(teamMap,   debate.gov),
                    opp:        remap(teamMap,   debate.opp),
                    og:         debate.og  != null ? remap(teamMap, debate.og)  : debate.og,
                    oo:         debate.oo  != null ? remap(teamMap, debate.oo)  : debate.oo,
                    cg:         debate.cg  != null ? remap(teamMap, debate.cg)  : debate.cg,
                    co:         debate.co  != null ? remap(teamMap, debate.co)  : debate.co,
                    panel: (debate.panel || []).map(p => ({
                        ...p,
                        id: remap(judgeMap, p.id)
                    })),
                    govResults: remapResults(debate.govResults),
                    oppResults: remapResults(debate.oppResults),
                    bpSpeakers: remapBpSpeakers(debate.bpSpeakers)
                };
            })
        }));
    }

    // ── Rewrite users ─────────────────────────────────────────────────────────
    if (state.auth?.users) {
        state.auth.users = state.auth.users.map(user => ({
            ...user,
            id: remap(userMap, user.id)
        }));
    }

    // ── Rewrite judgeTokens (keyed by judgeId) ────────────────────────────────
    if (state.judgeTokens) {
        const newTokens = {};
        for (const [oldId, token] of Object.entries(state.judgeTokens)) {
            newTokens[remap(judgeMap, oldId)] = token;
        }
        state.judgeTokens = newTokens;
    }

    // ── Rewrite roomURLs ──────────────────────────────────────────────────────
    if (state.roomURLs) {
        const newRoomURLs = {};
        for (const [key, room] of Object.entries(state.roomURLs)) {
            newRoomURLs[key] = {
                ...room,
                judges: (room.judges || []).map(j =>
                    typeof j === 'object' ? { ...j, id: remap(judgeMap, j.id) } : remap(judgeMap, j)
                )
            };
        }
        state.roomURLs = newRoomURLs;
    }

    // ── Rewrite feedback ──────────────────────────────────────────────────────
    if (state.feedback) {
        state.feedback = state.feedback.map(f => ({
            ...f,
            fromJudgeId: remap(judgeMap, f.fromJudgeId),
            toJudgeId:   remap(judgeMap, f.toJudgeId)
        }));
    }

    save();
    console.log('Migration complete:', changes);
    return changes;
}

// NOTE: Do NOT auto-call migrateToNewIds() here.
// Import and invoke it from an explicit admin action so it
// runs exactly once, intentionally — not on every page load.
