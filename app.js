const state = {
    team1Name: 'Team A',
    team2Name: 'Team B',
    team1Players: [],
    team2Players: [],
    team1Captain: null,
    team2Captain: null,
    team1Libero: null,
    team2Libero: null,
    team1Rotation: [],
    team2Rotation: [],
    team1Subs: {},
    team2Subs: {},
    team1LiberoIn: null,
    team2LiberoIn: null,
    hasRotation: false,
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

const rotationSetupState = {
    team1Rotation: { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null },
    team2Rotation: { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null },
    selectedPosition: null,
    selectedTeam: null
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
    document.getElementById('confirmRotation').addEventListener('click', confirmRotationSetup);
    document.getElementById('cancelSub').addEventListener('click', closeSubModal);

    document.querySelectorAll('.rotation-setup-pos').forEach(pos => {
        pos.addEventListener('click', handlePositionClick);
    });

    document.querySelectorAll('#rotation1 .rotation-pos, #rotation2 .rotation-pos').forEach(pos => {
        pos.addEventListener('click', handleGamePositionClick);
    });
}

function toggleService() {
    state.serving = state.serving === 1 ? 2 : 1;
    if (state.currentSetPoints.length === 0) {
        state.firstServer = state.serving;
    }
    updateDisplay();
}

function rotateTeam(team) {
    const rotation = team === 1 ? state.team1Rotation : state.team2Rotation;
    const subs = team === 1 ? state.team1Subs : state.team2Subs;

    if (rotation.length === 6) {
        const last = rotation.pop();
        rotation.unshift(last);

        const newSubs = {};
        Object.entries(subs).forEach(([idx, sub]) => {
            const newIdx = (parseInt(idx) + 1) % 6;
            newSubs[newIdx] = sub;
        });

        if (team === 1) {
            state.team1Subs = newSubs;
            if (state.team1LiberoIn !== null) {
                state.team1LiberoIn = (state.team1LiberoIn + 1) % 6;
            }
        } else {
            state.team2Subs = newSubs;
            if (state.team2LiberoIn !== null) {
                state.team2LiberoIn = (state.team2LiberoIn + 1) % 6;
            }
        }

        checkLiberoFrontRow(team);
    }
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

let currentSubTeam = null;
let currentSubPosition = null;

function handleGamePositionClick(e) {
    if (!state.hasRotation) return;

    const pos = e.currentTarget;
    const team = parseInt(pos.dataset.team);
    const position = parseInt(pos.dataset.pos);

    currentSubTeam = team;
    currentSubPosition = position;

    showSubModal(team, position);
}

function showSubModal(team, position) {
    const modal = document.getElementById('subModal');
    const optionsContainer = document.getElementById('subOptions');
    const currentPlayerEl = document.getElementById('subCurrentPlayer');

    const rotation = team === 1 ? state.team1Rotation : state.team2Rotation;
    const players = team === 1 ? state.team1Players : state.team2Players;
    const libero = team === 1 ? state.team1Libero : state.team2Libero;
    const subs = team === 1 ? state.team1Subs : state.team2Subs;
    const liberoIn = team === 1 ? state.team1LiberoIn : state.team2LiberoIn;

    const positionMap = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 };
    const rotationIndex = positionMap[position];
    const currentPlayer = rotation[rotationIndex];

    const isBackRow = [1, 5, 6].includes(position);

    currentPlayerEl.textContent = `Current: #${currentPlayer} (Position ${position}${isBackRow ? ' - Back Row' : ' - Front Row'})`;

    const playersOnCourt = [...rotation];
    const availableSubs = players.filter(p => !playersOnCourt.includes(p));

    let html = '';

    if (subs[rotationIndex] && currentPlayer !== subs[rotationIndex].original) {
        const original = subs[rotationIndex].original;
        html += `<div class="sub-option return-player" data-player="${original}" title="Return original player">${original}</div>`;
    }

    if (libero && !playersOnCourt.includes(libero)) {
        if (isBackRow) {
            html += `<div class="sub-option libero" data-player="${libero}" data-is-libero="true" title="Libero">${libero}</div>`;
        } else {
            html += `<div class="sub-option libero disabled" data-player="${libero}" title="Libero can only sub in back row">${libero}</div>`;
        }
    }

    if (currentPlayer === libero && liberoIn !== null) {
        const originalPlayer = team === 1 ?
            state.team1Rotation.find((p, i) => state.team1Subs[i]?.liberoFor === currentPlayer) :
            state.team2Rotation.find((p, i) => state.team2Subs[i]?.liberoFor === currentPlayer);
    }

    availableSubs.forEach(player => {
        if (player === libero) return;

        // Skip if already added as return player for current position
        if (subs[rotationIndex] && player === subs[rotationIndex].original) {
            return;
        }

        const subEntry = Object.entries(subs).find(([idx, sub]) => sub.original === player);
        if (subEntry) {
            const [subIdx] = subEntry;
            if (parseInt(subIdx) !== rotationIndex) {
                html += `<div class="sub-option disabled" data-player="${player}" title="Can only return to position ${parseInt(subIdx) + 1}">${player}</div>`;
                return;
            }
        }

        html += `<div class="sub-option" data-player="${player}">${player}</div>`;
    });

    optionsContainer.innerHTML = html || '<p>No substitutes available</p>';

    optionsContainer.querySelectorAll('.sub-option:not(.disabled)').forEach(opt => {
        opt.addEventListener('click', handleSubSelect);
    });

    modal.classList.remove('hidden');
}

function handleSubSelect(e) {
    const player = e.target.dataset.player;
    const isLibero = e.target.dataset.isLibero === 'true';

    makeSubstitution(currentSubTeam, currentSubPosition, player, isLibero);
    closeSubModal();
}

function makeSubstitution(team, position, newPlayer, isLibero) {
    const rotation = team === 1 ? state.team1Rotation : state.team2Rotation;
    const subs = team === 1 ? state.team1Subs : state.team2Subs;

    const positionMap = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 };
    const rotationIndex = positionMap[position];
    const currentPlayer = rotation[rotationIndex];

    if (isLibero) {
        if (team === 1) {
            state.team1LiberoIn = rotationIndex;
        } else {
            state.team2LiberoIn = rotationIndex;
        }
        subs[rotationIndex] = { original: currentPlayer, liberoFor: currentPlayer };
    } else if (subs[rotationIndex] && subs[rotationIndex].original === newPlayer) {
        delete subs[rotationIndex];
        if (team === 1 && state.team1LiberoIn === rotationIndex) {
            state.team1LiberoIn = null;
        } else if (team === 2 && state.team2LiberoIn === rotationIndex) {
            state.team2LiberoIn = null;
        }
    } else {
        if (!subs[rotationIndex]) {
            subs[rotationIndex] = { original: currentPlayer };
        }
    }

    rotation[rotationIndex] = newPlayer;
    updateDisplay();
}

function closeSubModal() {
    document.getElementById('subModal').classList.add('hidden');
    currentSubTeam = null;
    currentSubPosition = null;
}

function checkLiberoFrontRow(team) {
    const libero = team === 1 ? state.team1Libero : state.team2Libero;
    const rotation = team === 1 ? state.team1Rotation : state.team2Rotation;
    const subs = team === 1 ? state.team1Subs : state.team2Subs;
    const liberoIn = team === 1 ? state.team1LiberoIn : state.team2LiberoIn;

    if (!libero || liberoIn === null) return;

    const frontRowIndices = [2, 3, 4].map(p => ({ 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 })[p]);

    frontRowIndices.forEach(idx => {
        if (rotation[idx] === libero && subs[idx]) {
            rotation[idx] = subs[idx].original;
            delete subs[idx];
            if (team === 1) {
                state.team1LiberoIn = null;
            } else {
                state.team2LiberoIn = null;
            }
        }
    });
}

function switchSides() {
    [state.team1Name, state.team2Name] = [state.team2Name, state.team1Name];
    [state.team1Sets, state.team2Sets] = [state.team2Sets, state.team1Sets];
    [state.team1Players, state.team2Players] = [state.team2Players, state.team1Players];
    [state.team1Captain, state.team2Captain] = [state.team2Captain, state.team1Captain];
    [state.team1Libero, state.team2Libero] = [state.team2Libero, state.team1Libero];

    state.setHistory = state.setHistory.map(set => ({
        ...set,
        winner: set.winner === 1 ? 2 : 1,
        team1Score: set.team2Score,
        team2Score: set.team1Score
    }));
}

function swapTeams() {
    [state.team1Name, state.team2Name] = [state.team2Name, state.team1Name];
    [state.team1Score, state.team2Score] = [state.team2Score, state.team1Score];
    [state.team1Sets, state.team2Sets] = [state.team2Sets, state.team1Sets];
    [state.team1Timeouts, state.team2Timeouts] = [state.team2Timeouts, state.team1Timeouts];
    [state.team1Players, state.team2Players] = [state.team2Players, state.team1Players];
    [state.team1Captain, state.team2Captain] = [state.team2Captain, state.team1Captain];
    [state.team1Libero, state.team2Libero] = [state.team2Libero, state.team1Libero];
    [state.team1Rotation, state.team2Rotation] = [state.team2Rotation, state.team1Rotation];
    [state.team1Subs, state.team2Subs] = [state.team2Subs, state.team1Subs];
    [state.team1LiberoIn, state.team2LiberoIn] = [state.team2LiberoIn, state.team1LiberoIn];

    state.serving = state.serving === 1 ? 2 : 1;
    state.firstServer = state.firstServer === 1 ? 2 : 1;

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
    const team1Name = document.getElementById('team1Name').value || 'Team A';
    const team2Name = document.getElementById('team2Name').value || 'Team B';

    const team1PlayersInput = document.getElementById('team1Players').value;
    const team2PlayersInput = document.getElementById('team2Players').value;
    const team1Players = team1PlayersInput ? team1PlayersInput.split(',').map(n => n.trim()).filter(n => n) : [];
    const team2Players = team2PlayersInput ? team2PlayersInput.split(',').map(n => n.trim()).filter(n => n) : [];

    const team1Captain = document.getElementById('team1Captain').value || null;
    const team2Captain = document.getElementById('team2Captain').value || null;
    const team1Libero = document.getElementById('team1Libero').value || null;
    const team2Libero = document.getElementById('team2Libero').value || null;

    const errors = validateSetup(team1Name, team2Name, team1Players, team2Players, team1Captain, team2Captain, team1Libero, team2Libero);

    const errorDiv = document.getElementById('setupError');
    if (errors.length > 0) {
        errorDiv.innerHTML = '<strong>Please fix the following errors:</strong><ul>' +
            errors.map(e => `<li>${e}</li>`).join('') + '</ul>';
        errorDiv.classList.remove('hidden');
        return;
    }

    errorDiv.classList.add('hidden');

    state.team1Name = team1Name;
    state.team2Name = team2Name;
    state.team1Players = team1Players;
    state.team2Players = team2Players;
    state.team1Captain = team1Captain;
    state.team2Captain = team2Captain;
    state.team1Libero = team1Libero;
    state.team2Libero = team2Libero;

    state.matchType = parseInt(document.querySelector('input[name="matchType"]:checked').value);
    state.setsToWin = Math.ceil(state.matchType / 2);

    if (team1Players.length >= 6 && team2Players.length >= 6) {
        state.hasRotation = true;
        showRotationSetup();
    } else {
        state.hasRotation = false;
        state.team1Rotation = [];
        state.team2Rotation = [];
        beginMatch();
    }
}

function validateSetup(team1Name, team2Name, team1Players, team2Players, team1Captain, team2Captain, team1Libero, team2Libero) {
    const errors = [];

    const validateTeam = (teamName, players, captain, libero) => {
        const invalidNumbers = players.filter(n => !isValidInteger(n));
        if (invalidNumbers.length > 0) {
            errors.push(`${teamName}: Invalid jersey number(s): ${invalidNumbers.join(', ')} (must be integers)`);
        }

        const validPlayers = players.filter(n => isValidInteger(n));

        const duplicates = validPlayers.filter((item, index) => validPlayers.indexOf(item) !== index);
        if (duplicates.length > 0) {
            const uniqueDuplicates = [...new Set(duplicates)];
            errors.push(`${teamName}: Duplicate jersey number(s): ${uniqueDuplicates.join(', ')}`);
        }

        if (players.length > 0) {
            const requiredPlayers = libero ? 7 : 6;
            if (validPlayers.length < requiredPlayers) {
                const reason = libero ? ' (6 starters + 1 Libero)' : '';
                errors.push(`${teamName}: At least ${requiredPlayers} valid jersey numbers are required${reason} (found ${validPlayers.length})`);
            }
        }

        if (captain) {
            if (!isValidInteger(captain)) {
                errors.push(`${teamName}: Captain number must be a valid integer`);
            } else if (validPlayers.length > 0 && !validPlayers.includes(captain)) {
                errors.push(`${teamName}: Captain #${captain} is not in the jersey numbers list`);
            }
        }

        if (libero) {
            if (!isValidInteger(libero)) {
                errors.push(`${teamName}: Libero number must be a valid integer`);
            } else if (validPlayers.length > 0 && !validPlayers.includes(libero)) {
                errors.push(`${teamName}: Libero #${libero} is not in the jersey numbers list`);
            }
        }

        if (captain && libero && captain === libero) {
            errors.push(`${teamName}: Captain and Libero cannot be the same player`);
        }
    };

    if (team1Players.length > 0 || team1Captain || team1Libero) {
        validateTeam(team1Name, team1Players, team1Captain, team1Libero);
    }

    if (team2Players.length > 0 || team2Captain || team2Libero) {
        validateTeam(team2Name, team2Players, team2Captain, team2Libero);
    }

    return errors;
}

function isValidInteger(value) {
    if (value === null || value === '') return false;
    const num = Number(value);
    return Number.isInteger(num) && num > 0;
}

function showRotationSetup() {
    document.getElementById('setup').classList.add('hidden');
    document.getElementById('rotationSetup').classList.remove('hidden');

    document.getElementById('rotationTeam1Name').textContent = state.team1Name;
    document.getElementById('rotationTeam2Name').textContent = state.team2Name;

    rotationSetupState.team1Rotation = { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
    rotationSetupState.team2Rotation = { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
    rotationSetupState.selectedPosition = null;
    rotationSetupState.selectedTeam = null;

    updateAvailablePlayers(1);
    updateAvailablePlayers(2);
    updateRotationSetupDisplay();

    const header = document.querySelector('#rotationSetup h2');
    header.textContent = 'Set Starting Rotations';

    document.getElementById('rotationSetupSetScore').classList.add('hidden');
}

function showNewSetRotationSetup() {
    document.getElementById('scoreboard').classList.add('hidden');
    document.getElementById('rotationSetup').classList.remove('hidden');

    document.getElementById('rotationTeam1Name').textContent = state.team1Name;
    document.getElementById('rotationTeam2Name').textContent = state.team2Name;

    rotationSetupState.team1Rotation = { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
    rotationSetupState.team2Rotation = { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
    rotationSetupState.selectedPosition = null;
    rotationSetupState.selectedTeam = null;

    updateAvailablePlayers(1);
    updateAvailablePlayers(2);
    updateRotationSetupDisplay();

    const header = document.querySelector('#rotationSetup h2');
    header.textContent = `Set ${state.currentSet} - Starting Rotations`;

    const scoreDisplay = document.getElementById('rotationSetupSetScore');
    scoreDisplay.classList.remove('hidden');
    scoreDisplay.innerHTML = `Match Score: <strong>${state.team1Name}</strong> ${state.team1Sets} - ${state.team2Sets} <strong>${state.team2Name}</strong>`;
}

function updateAvailablePlayers(team) {
    const container = document.getElementById(`availablePlayers${team}`);
    const players = team === 1 ? state.team1Players : state.team2Players;
    const libero = team === 1 ? state.team1Libero : state.team2Libero;
    const captain = team === 1 ? state.team1Captain : state.team2Captain;
    const rotation = team === 1 ? rotationSetupState.team1Rotation : rotationSetupState.team2Rotation;

    const usedPlayers = Object.values(rotation).filter(p => p !== null);

    let html = '';
    players.forEach(player => {
        if (player === libero) return;

        const isUsed = usedPlayers.includes(player);
        const isCaptain = player === captain;
        const classes = ['available-player'];
        if (isUsed) classes.push('used');
        if (isCaptain) classes.push('captain');

        html += `<span class="${classes.join(' ')}" data-team="${team}" data-player="${player}">${player}</span>`;
    });

    container.innerHTML = html;

    container.querySelectorAll('.available-player:not(.used)').forEach(el => {
        el.addEventListener('click', handlePlayerSelect);
    });
}

function handlePositionClick(e) {
    const team = parseInt(e.target.dataset.team);
    const pos = parseInt(e.target.dataset.pos);

    document.querySelectorAll('.rotation-setup-pos').forEach(p => p.classList.remove('selected'));

    const rotation = team === 1 ? rotationSetupState.team1Rotation : rotationSetupState.team2Rotation;
    if (rotation[pos] !== null) {
        rotation[pos] = null;
        rotationSetupState.selectedPosition = null;
        rotationSetupState.selectedTeam = null;
        updateAvailablePlayers(team);
        updateRotationSetupDisplay();
        return;
    }

    e.target.classList.add('selected');
    rotationSetupState.selectedPosition = pos;
    rotationSetupState.selectedTeam = team;
}

function handlePlayerSelect(e) {
    const team = parseInt(e.target.dataset.team);
    const player = e.target.dataset.player;

    if (rotationSetupState.selectedPosition === null || rotationSetupState.selectedTeam !== team) {
        return;
    }

    const rotation = team === 1 ? rotationSetupState.team1Rotation : rotationSetupState.team2Rotation;
    rotation[rotationSetupState.selectedPosition] = player;

    rotationSetupState.selectedPosition = null;
    rotationSetupState.selectedTeam = null;

    document.querySelectorAll('.rotation-setup-pos').forEach(p => p.classList.remove('selected'));
    updateAvailablePlayers(team);
    updateRotationSetupDisplay();
}

function updateRotationSetupDisplay() {
    [1, 2].forEach(team => {
        const rotation = team === 1 ? rotationSetupState.team1Rotation : rotationSetupState.team2Rotation;
        const grid = document.getElementById(`rotationSetup${team}`);

        grid.querySelectorAll('.rotation-setup-pos').forEach(pos => {
            const position = parseInt(pos.dataset.pos);
            const player = rotation[position];

            if (player) {
                pos.textContent = player;
                pos.classList.add('filled');
            } else {
                pos.textContent = position;
                pos.classList.remove('filled');
            }
        });
    });
}

function confirmRotationSetup() {
    const errors = [];

    const team1Filled = Object.values(rotationSetupState.team1Rotation).filter(p => p !== null).length;
    const team2Filled = Object.values(rotationSetupState.team2Rotation).filter(p => p !== null).length;

    if (team1Filled < 6) {
        errors.push(`${state.team1Name}: Please assign all 6 positions (${team1Filled}/6 filled)`);
    }
    if (team2Filled < 6) {
        errors.push(`${state.team2Name}: Please assign all 6 positions (${team2Filled}/6 filled)`);
    }

    const errorDiv = document.getElementById('rotationSetupError');
    if (errors.length > 0) {
        errorDiv.innerHTML = '<strong>Please fix the following:</strong><ul>' +
            errors.map(e => `<li>${e}</li>`).join('') + '</ul>';
        errorDiv.classList.remove('hidden');
        return;
    }

    errorDiv.classList.add('hidden');

    state.team1Rotation = [
        rotationSetupState.team1Rotation[1],
        rotationSetupState.team1Rotation[2],
        rotationSetupState.team1Rotation[3],
        rotationSetupState.team1Rotation[4],
        rotationSetupState.team1Rotation[5],
        rotationSetupState.team1Rotation[6]
    ];
    state.team2Rotation = [
        rotationSetupState.team2Rotation[1],
        rotationSetupState.team2Rotation[2],
        rotationSetupState.team2Rotation[3],
        rotationSetupState.team2Rotation[4],
        rotationSetupState.team2Rotation[5],
        rotationSetupState.team2Rotation[6]
    ];

    document.getElementById('rotationSetup').classList.add('hidden');
    beginMatch();
}

function beginMatch() {
    resetMatchState();

    document.getElementById('setup').classList.add('hidden');
    document.getElementById('rotationSetup').classList.add('hidden');
    document.getElementById('scoreboard').classList.remove('hidden');
    document.getElementById('matchResult').classList.add('hidden');

    if (!state.hasRotation) {
        document.getElementById('rotation1').classList.add('hidden');
        document.getElementById('rotation2').classList.add('hidden');
    } else {
        document.getElementById('rotation1').classList.remove('hidden');
        document.getElementById('rotation2').classList.remove('hidden');
    }

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
    document.getElementById('rotationSetup').classList.add('hidden');
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
        serving: state.serving,
        team1Rotation: [...state.team1Rotation],
        team2Rotation: [...state.team2Rotation],
        team1Subs: JSON.parse(JSON.stringify(state.team1Subs)),
        team2Subs: JSON.parse(JSON.stringify(state.team2Subs)),
        team1LiberoIn: state.team1LiberoIn,
        team2LiberoIn: state.team2LiberoIn
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

    const previousServer = state.serving;
    state.serving = team;

    if (previousServer !== team) {
        if (team === 1) {
            rotateTeam(1);
        } else {
            rotateTeam(2);
        }
    }

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
            state.team1Subs = {};
            state.team2Subs = {};
            state.team1LiberoIn = null;
            state.team2LiberoIn = null;
            state.currentSetPoints = [];
            state.serving = (state.currentSet % 2 === 1) ? 1 : 2;
            state.firstServer = state.serving;

            switchSides();

            if (state.hasRotation) {
                showNewSetRotationSetup();
            } else {
                updateDisplay();
            }
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
    state.team1Rotation = lastState.team1Rotation;
    state.team2Rotation = lastState.team2Rotation;
    state.team1Subs = lastState.team1Subs;
    state.team2Subs = lastState.team2Subs;
    state.team1LiberoIn = lastState.team1LiberoIn;
    state.team2LiberoIn = lastState.team2LiberoIn;
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

function updateRotationDisplay(team, rotation, captain, libero, isServing) {
    const grid = document.getElementById(`rotation${team}`);
    const positions = grid.querySelectorAll('.rotation-pos');
    const subs = team === 1 ? state.team1Subs : state.team2Subs;

    const positionMap = [3, 2, 1, 4, 5, 0];

    positions.forEach((pos, index) => {
        const rotationIndex = positionMap[index];
        const playerNum = rotation[rotationIndex] || '-';

        const playerNumEl = pos.querySelector('.player-num');
        const subIndicator = pos.querySelector('.sub-indicator');

        playerNumEl.textContent = playerNum;
        playerNumEl.classList.remove('captain');
        pos.classList.remove('server', 'libero-in');
        subIndicator.classList.remove('visible');

        if (playerNum === captain) {
            playerNumEl.classList.add('captain');
        }
        if (playerNum === libero) {
            pos.classList.add('libero-in');
        }
        if (isServing && rotationIndex === 0) {
            pos.classList.add('server');
        }

        if (subs[rotationIndex]) {
            subIndicator.textContent = subs[rotationIndex].original;
            subIndicator.classList.add('visible');
        }
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

    updateRotationDisplay(1, state.team1Rotation, state.team1Captain, state.team1Libero, state.serving === 1);
    updateRotationDisplay(2, state.team2Rotation, state.team2Captain, state.team2Libero, state.serving === 2);

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
