import { state } from './state.js';

export function getTeamStandings() {
    return state.teams.map(team => ({
        id:    team.id,
        name:  team.name,
        code:  team.code,
        wins:  team.wins  || 0,
        total: team.total || 0
    })).sort((a, b) => b.wins - a.wins || b.total - a.total);
}

export function getSpeakerStandings() {
    // EFFICIENCY: build a flat speakers array with a single pass over state.teams
    // rather than the previous pattern of forEach→forEach with repeated lookups.
    const speakers = state.teams.flatMap(team =>
        (team.speakers || []).map(sp => {
            const rounds = sp.substantiveCount || 0;
            const total  = sp.substantiveTotal  || 0;
            return {
                teamId: team.id,
                team:   team.name,
                code:   team.code,
                name:   sp.name,
                total,
                rounds,
                avg:    rounds ? total / rounds : 0
            };
        })
    );

    return speakers.sort((a, b) => b.avg - a.avg);
}
