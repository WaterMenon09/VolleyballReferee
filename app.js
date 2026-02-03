const state = {
    team1Name: 'Team A',
    team2Name: 'Team B',
    matchType: 3,
    setsToWin: 2,
    currentSet: 1,
    team1Score: 0,
    team2Score: 0,
    team1Sets: 0,
    team2Sets: 0,
    team1Timeouts: 2,
    team2Timeouts: 2,
    setHistory: [],
    pointHistory: [],
    currentSetPoints: [],
    serving: 1,
    firstServer: 1,
    matchOver: false
};

const REGULAR_SET_POINTS = 25;
const FINAL_SET_POINTS = 15;
const MIN_LEAD = 2;
const TIMEOUT_DURATION = 30;

let timeoutInterval = null;

function init() {
    document.getElementById('startMatch').addEventListener('click', startMatch);
    document.getElementById('newMatch').addEventListener('click', resetToSetup);
    document.getElementById('playAgain').addEventListener('click', resetToSetup);
    document.getElementById('undoPoint').addEventListener('click', undoLastPoint);

    document.querySelectorAll('.btn-score').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const team = parseInt(e.target.dataset.team);
            addPoint(team);
        });
    });

    document.getElementById('serveIndicator').addEventListener('click', toggleService);
    document.getElementById('swapTeams').addEventListener('click', swapTeams);

    document.getElementById('timeout1').addEventListener('click', () => useTimeout(1));
    document.getElementById('timeout2').addEventListener('click', () => useTimeout(2));
    document.getElementById('continueEarly').addEventListener('click', closeTimeoutModal);
}

function toggleService() {
    state.serving = state.serving === 1 ? 2 : 1;
    if (state.currentSetPoints.length === 0) {
        state.firstServer = state.serving;
    }
    updateDisplay();
}

function useTimeout(team) {
    if (team === 1 && state.team1Timeouts > 0) {
        state.team1Timeouts--;
        showTimeoutModal(state.team1Name);
    } else if (team === 2 && state.team2Timeouts > 0) {
        state.team2Timeouts--;
        showTimeoutModal(state.team2Name);
    }
    updateDisplay();
}

function showTimeoutModal(teamName) {
    const modal = document.getElementById('timeoutModal');
    const timerText = document.getElementById('timerText');
    const timerProgress = document.getElementById('timerProgress');
    const teamNameDisplay = document.getElementById('timeoutTeamName');

    teamNameDisplay.textContent = `${teamName} Timeout`;
    modal.classList.remove('hidden');

    let timeLeft = TIMEOUT_DURATION * 1000;
    timerProgress.style.strokeDashoffset = 0;

    const circumference = 283;
    const updateInterval = 10;

    timeoutInterval = setInterval(() => {
        timeLeft -= updateInterval;

        const seconds = Math.floor(timeLeft / 1000);
        const milliseconds = Math.floor((timeLeft % 1000) / 10);
        timerText.textContent = `${seconds}.${milliseconds.toString().padStart(2, '0')}`;

        const offset = circumference * (1 - timeLeft / (TIMEOUT_DURATION * 1000));
        timerProgress.style.strokeDashoffset = offset;

        if (timeLeft <= 0) {
            timerText.textContent = '0.00';
            closeTimeoutModal();
        }
    }, updateInterval);
}

function closeTimeoutModal() {
    const modal = document.getElementById('timeoutModal');
    modal.classList.add('hidden');

    if (timeoutInterval) {
        clearInterval(timeoutInterval);
        timeoutInterval = null;
    }
}

function swapTeams() {
    [state.team1Name, state.team2Name] = [state.team2Name, state.team1Name];
    [state.team1Score, state.team2Score] = [state.team2Score, state.team1Score];
    [state.team1Sets, state.team2Sets] = [state.team2Sets, state.team1Sets];
    [state.team1Timeouts, state.team2Timeouts] = [state.team2Timeouts, state.team1Timeouts];

    state.serving = state.serving === 1 ? 2 : 1;

    state.currentSetPoints = state.currentSetPoints.map(point => ({
        ...point,
        team: point.team === 1 ? 2 : 1,
        team1Score: point.team2Score,
        team2Score: point.team1Score
    }));

    state.setHistory = state.setHistory.map(set => ({
        ...set,
        winner: set.winner === 1 ? 2 : 1,
        team1Score: set.team2Score,
        team2Score: set.team1Score
    }));

    state.pointHistory = [];

    updateDisplay();
}

function startMatch() {
    state.team1Name = document.getElementById('team1Name').value || 'Team A';
    state.team2Name = document.getElementById('team2Name').value || 'Team B';
    state.matchType = parseInt(document.querySelector('input[name="matchType"]:checked').value);
    state.setsToWin = Math.ceil(state.matchType / 2);

    resetMatchState();

    document.getElementById('setup').classList.add('hidden');
    document.getElementById('scoreboard').classList.remove('hidden');
    document.getElementById('matchResult').classList.add('hidden');

    updateDisplay();
}

function resetMatchState() {
    state.currentSet = 1;
    state.team1Score = 0;
    state.team2Score = 0;
    state.team1Sets = 0;
    state.team2Sets = 0;
    state.team1Timeouts = 2;
    state.team2Timeouts = 2;
    state.setHistory = [];
    state.pointHistory = [];
    state.currentSetPoints = [];
    state.serving = 1;
    state.firstServer = 1;
    state.matchOver = false;
}

function resetToSetup() {
    document.getElementById('setup').classList.remove('hidden');
    document.getElementById('scoreboard').classList.add('hidden');
    document.getElementById('matchResult').classList.add('hidden');
    resetMatchState();
}

function getPointsToWin() {
    const isFinalSet = state.currentSet === state.matchType;
    return isFinalSet ? FINAL_SET_POINTS : REGULAR_SET_POINTS;
}

function addPoint(team) {
    if (state.matchOver) return;

    state.pointHistory.push({
        team1Score: state.team1Score,
        team2Score: state.team2Score,
        team1Sets: state.team1Sets,
        team2Sets: state.team2Sets,
        currentSet: state.currentSet,
        setHistory: [...state.setHistory],
        currentSetPoints: [...state.currentSetPoints],
        serving: state.serving
    });

    if (team === 1) {
        state.team1Score++;
    } else {
        state.team2Score++;
    }

    const pointNumber = state.team1Score + state.team2Score;
    state.currentSetPoints.push({
        pointNumber: pointNumber,
        team: team,
        team1Score: state.team1Score,
        team2Score: state.team2Score
    });

    state.serving = team;

    checkSetWin();
    updateDisplay();
}

function checkSetWin() {
    const pointsToWin = getPointsToWin();
    const score1 = state.team1Score;
    const score2 = state.team2Score;
    const lead = Math.abs(score1 - score2);

    let setWinner = null;

    if (score1 >= pointsToWin && lead >= MIN_LEAD) {
        setWinner = 1;
    } else if (score2 >= pointsToWin && lead >= MIN_LEAD) {
        setWinner = 2;
    }

    if (setWinner) {
        state.setHistory.push({
            set: state.currentSet,
            team1Score: state.team1Score,
            team2Score: state.team2Score,
            winner: setWinner
        });

        if (setWinner === 1) {
            state.team1Sets++;
        } else {
            state.team2Sets++;
        }

        if (state.team1Sets >= state.setsToWin || state.team2Sets >= state.setsToWin) {
            endMatch();
        } else {
            state.currentSet++;
            state.team1Score = 0;
            state.team2Score = 0;
            state.team1Timeouts = 2;
            state.team2Timeouts = 2;
            state.currentSetPoints = [];
            state.serving = (state.currentSet % 2 === 1) ? 1 : 2;
            state.firstServer = state.serving;
        }
    }
}

function endMatch() {
    state.matchOver = true;
    const winner = state.team1Sets > state.team2Sets ? state.team1Name : state.team2Name;

    document.getElementById('scoreboard').classList.add('hidden');
    document.getElementById('matchResult').classList.remove('hidden');

    document.getElementById('winner').textContent = `${winner} Wins!`;

    let scoreHTML = `<div>Final: ${state.team1Sets} - ${state.team2Sets}</div>`;
    scoreHTML += '<div style="margin-top: 15px;">';
    state.setHistory.forEach(set => {
        const winnerClass = set.winner === 1 ? 'team1-win' : 'team2-win';
        scoreHTML += `<span class="set-result ${winnerClass}">Set ${set.set}: ${set.team1Score}-${set.team2Score}</span>`;
    });
    scoreHTML += '</div>';
    document.getElementById('finalScore').innerHTML = scoreHTML;
}

function undoLastPoint() {
    if (state.pointHistory.length === 0) return;

    const lastState = state.pointHistory.pop();
    state.team1Score = lastState.team1Score;
    state.team2Score = lastState.team2Score;
    state.team1Sets = lastState.team1Sets;
    state.team2Sets = lastState.team2Sets;
    state.currentSet = lastState.currentSet;
    state.setHistory = lastState.setHistory;
    state.currentSetPoints = lastState.currentSetPoints;
    state.serving = lastState.serving;
    state.matchOver = false;

    updateDisplay();
}

function updateTimeoutDots(team, timeoutsLeft) {
    const container = document.getElementById(`timeoutDots${team}`);
    const dots = container.querySelectorAll('.timeout-dot');
    dots.forEach((dot, index) => {
        dot.classList.toggle('active', index < timeoutsLeft);
    });
}

function updateDisplay() {
    document.getElementById('team1Display').textContent = state.team1Name;
    document.getElementById('team2Display').textContent = state.team2Name;
    document.getElementById('team1Score').textContent = state.team1Score;
    document.getElementById('team2Score').textContent = state.team2Score;
    let setsHTML = '';
    if (state.setHistory.length === 0) {
        setsHTML = '<span class="no-sets">No sets completed</span>';
    } else {
        state.setHistory.forEach((set, index) => {
            const winnerClass = set.winner === 1 ? 'team1-set-win' : 'team2-set-win';
            setsHTML += `<div class="set-score-item ${winnerClass}">${set.team1Score}-${set.team2Score}</div>`;
        });
    }
    document.getElementById('setsScoreCenter').innerHTML = setsHTML;

    const serveBall = document.getElementById('serveBall');
    serveBall.classList.toggle('right', state.serving === 2);

    updateTimeoutDots(1, state.team1Timeouts);
    updateTimeoutDots(2, state.team2Timeouts);

    document.getElementById('timeout1').disabled = state.team1Timeouts === 0;
    document.getElementById('timeout2').disabled = state.team2Timeouts === 0;

    document.getElementById('matchTypeDisplay').textContent = `Best of ${state.matchType}`;

    const isFinalSet = state.currentSet === state.matchType;
    const pointsToWin = getPointsToWin();
    document.getElementById('currentSetDisplay').textContent =
        `Set ${state.currentSet} (to ${pointsToWin} pts${isFinalSet ? ' - Final Set' : ''})`;

    document.getElementById('timelineSetNumber').textContent = state.currentSet;

    const serveIcon = '<img src="icons/volleyball.png" class="first-serve-icon" alt="First serve">';
    document.getElementById('timelineTeam1Label').innerHTML = state.firstServer === 1 ? serveIcon : '';
    document.getElementById('timelineTeam2Label').innerHTML = state.firstServer === 2 ? serveIcon : '';

    let team1HTML = '';
    let team2HTML = '';

    if (state.currentSetPoints.length === 0) {
        team1HTML = '<span class="timeline-empty">No points yet</span>';
        team2HTML = '';
    } else {
        state.currentSetPoints.forEach(point => {
            if (point.team === 1) {
                team1HTML += `<div class="timeline-cell scored">${point.team1Score}</div>`;
                team2HTML += `<div class="timeline-cell empty">&nbsp;</div>`;
            } else {
                team1HTML += `<div class="timeline-cell empty">&nbsp;</div>`;
                team2HTML += `<div class="timeline-cell scored">${point.team2Score}</div>`;
            }
        });
    }

    document.getElementById('team1Timeline').innerHTML = team1HTML;
    document.getElementById('team2Timeline').innerHTML = team2HTML;

    const container = document.querySelector('.timeline-container');
    container.scrollLeft = container.scrollWidth;
}

document.addEventListener('DOMContentLoaded', init);
