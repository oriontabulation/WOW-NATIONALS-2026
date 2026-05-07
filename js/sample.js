// ============================================
// SAMPLE DATA GENERATOR FOR TESTING
// Standalone module — no modal, renders inline via admin.js _sectionSample()
// ============================================

import { state, save } from './state.js';
import { showNotification } from './utils.js';

let renderSpeakerStandings = null;
try {
    const speakersModule = await import('./speakers.js');
    renderSpeakerStandings = speakersModule.renderSpeakerStandings;
} catch (e) {
    console.log('Speaker module not available yet');
}

// ============================================
// READ CONFIG FROM INLINE FORM & GENERATE
// Called directly by the Generate button on the page
// ============================================
function generateCustomSampleData() {
    const teamCount       = parseInt(document.getElementById('sample-team-count')?.value  || '20');
    const roundCount      = parseInt(document.getElementById('sample-round-count')?.value  || '5');
    const judgeCount      = parseInt(document.getElementById('sample-judge-count')?.value  || '12');
    const includeKnockout = document.getElementById('sample-include-knockout')?.checked ?? true;
    const randomizeScores = document.getElementById('sample-randomize-scores')?.checked   ?? true;

    generateCustomData(teamCount, roundCount, judgeCount, includeKnockout, randomizeScores);
}

// ============================================
// MAIN GENERATOR FUNCTION
// ============================================
function generateCustomData(numTeams, numRounds, numJudges, includeKnockout, randomizeScores) {
    if (!confirm(`Generate sample data with:\n• ${numTeams} teams\n• ${numRounds} rounds\n• ${numJudges} judges\n• ${includeKnockout ? 'With' : 'Without'} knockout rounds\n\nThis will replace all existing data.`)) {
        return;
    }

    state.teams  = [];
    state.judges = [];
    state.rounds  = [];

    generateCustomTeams(numTeams);
    generateCustomJudges(numJudges);
    generateCustomRounds(numRounds, includeKnockout, randomizeScores);

    save();

    import('./utils.js').then(utils => {
        if (utils.updatePublicCounts) utils.updatePublicCounts();
    });

    if (typeof renderSpeakerStandings === 'function') renderSpeakerStandings();

    showNotification(`✅ Generated ${numTeams} teams, ${numJudges} judges, ${numRounds} rounds!`, 'success');

    if (typeof window.adminSwitchSection === 'function') {
        window.adminSwitchSection('overview');
    } else if (typeof switchTab === 'function') {
        switchTab('standings');
    }
}

// ============================================
// GENERATE CUSTOM TEAMS
// ============================================
function generateCustomTeams(numTeams) {
    const universities = [
        'Harvard', 'Yale', 'Princeton', 'Stanford', 'MIT', 'Oxford', 'Cambridge',
        'UChicago', 'Columbia', 'Penn', 'Duke', 'Northwestern', 'Georgetown',
        'Berkeley', 'UCLA', 'Michigan', 'Virginia', 'Cornell', 'Brown', 'Dartmouth',
        'Johns Hopkins', 'Caltech', 'NYU', 'USC', 'Carnegie Mellon', 'Emory', 'Vanderbilt'
    ];
    const teamNames = [
        'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P',
        'Alpha','Beta','Gamma','Delta','Epsilon','Zeta',
        'Liberty','Equality','Justice','Progress','Vision','Legacy',
        'Atlas','Apollo','Aurora','Phoenix','Titan','Olympus'
    ];
    const firstNames = [
        'James','John','Robert','Michael','William','David','Richard','Joseph',
        'Sarah','Emma','Olivia','Ava','Isabella','Sophia','Mia','Charlotte',
        'Liam','Noah','Oliver','Elijah','Benjamin','Lucas','Henry','Alexander',
        'Ethan','Jacob','Daniel','Matthew','Samuel','Amelia','Evelyn'
    ];
    const lastNames = [
        'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis',
        'Rodriguez','Martinez','Wilson','Anderson','Taylor','Thomas','Moore',
        'Jackson','Martin','Lee','Thompson','White','Harris','Clark','Lewis',
        'Robinson','Walker','Young','Allen','King','Wright','Scott'
    ];

    const usedCodes = new Set();
    for (let i = 0; i < numTeams; i++) {
        let code;
        do {
            const uni  = universities[Math.floor(Math.random() * universities.length)];
            const name = teamNames[Math.floor(Math.random() * teamNames.length)];
            code = uni.substring(0,3).toUpperCase() + name.substring(0,2).toUpperCase() + Math.floor(Math.random()*100);
        } while (usedCodes.has(code));
        usedCodes.add(code);

        const numSpeakers = 2 + Math.floor(Math.random() * 2);
        const speakers = [];
        const usedNames = new Set();
        for (let j = 0; j < numSpeakers; j++) {
            let speakerName;
            do {
                speakerName = `${firstNames[Math.floor(Math.random()*firstNames.length)]} ${lastNames[Math.floor(Math.random()*lastNames.length)]}`;
            } while (usedNames.has(speakerName));
            usedNames.add(speakerName);
            speakers.push({ name: speakerName, substantiveScores:{}, replyScores:{}, substantiveTotal:0, replyTotal:0, substantiveCount:0, replyCount:0 });
        }

        state.teams.push({
            id: `team_${Date.now()}_${i}`,
            name: `${universities[Math.floor(Math.random()*universities.length)]} ${teamNames[Math.floor(Math.random()*teamNames.length)]}`,
            code, speakers, wins:0, total:0, roundScores:{}, eliminated:false, broke:false
        });
    }
}

// ============================================
// GENERATE CUSTOM JUDGES
// ============================================
function generateCustomJudges(numJudges) {
    const firstNames = ['Michael','David','Robert','William','James','Charles','Thomas','Patricia','Jennifer','Linda','Elizabeth','Susan','Jessica','Sarah','Christopher','Matthew','Anthony','Donald','Mark','Paul','Steven'];
    const lastNames  = ['Chen','Patel','Rodriguez','Kim','Singh','Thompson','Garcia','Martinez','Wilson','Brown','Davis','Miller','Jones','Williams','Johnson','Lee','Wang','Li','Zhang','Anderson','Thomas'];
    const universities = ['Harvard','Yale','Stanford','MIT','Oxford','Cambridge','UChicago','Columbia','NYU','Berkeley','UCLA','Michigan','Penn','Duke'];

    const usedEmails = new Set();
    for (let i = 0; i < numJudges; i++) {
        const firstName = firstNames[Math.floor(Math.random()*firstNames.length)];
        const lastName  = lastNames[Math.floor(Math.random()*lastNames.length)];
        let email;
        do {
            email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${Math.floor(Math.random()*1000)}@example.com`;
        } while (usedEmails.has(email));
        usedEmails.add(email);

        state.judges.push({
            id: `judge_${Date.now()}_${i}`,
            name: `${firstName} ${lastName}`, email,
            institution: universities[Math.floor(Math.random()*universities.length)],
            conflicts:[], rounds:[], active:true
        });
    }

    state.judges.forEach(judge => {
        const count = Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
            if (state.teams.length > 0) {
                const t = state.teams[Math.floor(Math.random()*state.teams.length)];
                if (!judge.conflicts.includes(t.id)) judge.conflicts.push(t.id);
            }
        }
    });
}

// ============================================
// GENERATE CUSTOM ROUNDS
// ============================================
function generateCustomRounds(numRounds, includeKnockout, randomizeScores) {
    const motions = [
        "This House believes that AI will create more jobs than it destroys",
        "This House would abolish private prisons",
        "This House supports universal basic income",
        "This House believes that social media does more harm than good",
        "This House would ban single-use plastics",
        "This House supports term limits for politicians",
        "This House believes that college education should be free",
        "This House would legalize all drugs",
        "This House supports a four-day work week",
        "This House believes that voting should be compulsory"
    ];

    const teamPerformance = {};
    state.teams.forEach(team => { teamPerformance[team.id] = { wins:0, total:0, roundScores:{} }; });

    for (let roundNum = 1; roundNum <= numRounds; roundNum++) {
        const activeTeams = state.teams.filter(t => !t.eliminated);
        if (activeTeams.length < 2) break;

        const sortedTeams = [...activeTeams].sort((a,b) => {
            const aW = teamPerformance[a.id]?.wins || 0;
            const bW = teamPerformance[b.id]?.wins || 0;
            if (aW !== bW) return bW - aW;
            return (teamPerformance[b.id]?.total||0) - (teamPerformance[a.id]?.total||0);
        });

        const debates = [];
        for (let i = 0; i < sortedTeams.length - 1; i += 2) {
            const gov = sortedTeams[i];
            const opp = sortedTeams[i+1];
            const govTotal = 280 + Math.random() * 30;
            const oppTotal = 280 + Math.random() * 30;
            if (govTotal > oppTotal) teamPerformance[gov.id].wins++;
            else                     teamPerformance[opp.id].wins++;
            teamPerformance[gov.id].total += govTotal;
            teamPerformance[opp.id].total += oppTotal;
            teamPerformance[gov.id].roundScores[roundNum] = govTotal;
            teamPerformance[opp.id].roundScores[roundNum] = oppTotal;

            debates.push({
                gov: gov.id, opp: opp.id, entered:true, panel:[],
                attendance:{ gov:true, opp:true },
                govResults:{ teamName:gov.name, substantive:gov.speakers.map(s=>({ speaker:s.name, score:70+Math.random()*8 })), reply:{ speaker:gov.speakers[0]?.name, score:34+Math.random()*4 }, total:govTotal },
                oppResults:{ teamName:opp.name, substantive:opp.speakers.map(s=>({ speaker:s.name, score:70+Math.random()*8 })), reply:{ speaker:opp.speakers[0]?.name, score:34+Math.random()*4 }, total:oppTotal }
            });
        }

        state.rounds.push({
            id: roundNum,
            motion: motions[Math.floor(Math.random()*motions.length)],
            debates, type:'prelim', blinded:false,
            rooms: debates.map((_,i) => i < 26 ? `Room ${String.fromCharCode(65+i)}` : `Room ${i+1}`)
        });
    }

    state.teams.forEach(team => {
        const perf = teamPerformance[team.id];
        if (perf) {
            team.wins        = perf.wins;
            team.total       = perf.total;
            team.roundScores = perf.roundScores;
            if (team.wins >= Math.ceil(state.teams.length * 0.4)) team.broke = true;
        }
    });

    if (includeKnockout) generateKnockoutRounds(numRounds);
}

// ============================================
// GENERATE KNOCKOUT ROUNDS
// ============================================
function generateKnockoutRounds(numPrelimRounds) {
    const breaking = state.teams.filter(t => t.broke);
    if (breaking.length < 4) return;
    const sorted = [...breaking].sort((a,b) => b.wins - a.wins);
    let offset = numPrelimRounds;
    if (sorted.length >= 8) {
        offset++;
        state.rounds.push({
            id: offset,
            motion: "This House believes that globalization is a force for good",
            debates: Array(4).fill(null).map((_,i) => ({
                gov: sorted[i*2]?.id, opp: sorted[i*2+1]?.id,
                entered:true, panel:[], attendance:{ gov:true, opp:true }
            })),
            type:'knockout', blinded:false,
            rooms:['Quarter A','Quarter B','Quarter C','Quarter D']
        });
    }
}

// ============================================
// ATTACH TO WINDOW
// ============================================
window.generateCustomSampleData = generateCustomSampleData;
window.generateCustomData        = generateCustomData;

console.log('✅ Sample data generator loaded');

export { generateCustomSampleData, generateCustomData };