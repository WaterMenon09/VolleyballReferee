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
    matchOver: false,
    team1OriginalId: 'A',
    team2OriginalId: 'B',
    lastStartingRotation1: null,
    lastStartingRotation2: null,
    matchStarted: false,
    deciderSideSwitched: false
};

const rotationSetupState = {
    team1Rotation: { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null },
    team2Rotation: { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null },
    selectedPosition: null,
    selectedTeam: null,
    isNewSet: false
};

const REGULAR_SET_POINTS = 25;
const FINAL_SET_POINTS = 15;
const MIN_LEAD = 2;
const TIMEOUT_DURATION = 30;
const SET_BREAK_DURATION = 180;
const TIMER_CIRCLE_RADIUS = 45; // SVG circle radius from viewBox
const TIMER_CIRCLE_CIRCUMFERENCE = 2 * Math.PI * TIMER_CIRCLE_RADIUS;

let timeoutInterval = null;
let setBreakInterval = null;
let vibrateInterval = null;
let _alertContentEl = null;
let _scorePulseTeam = null;
let _dndInitialized = false;
let _restoredRotationSetup = null;

const STORAGE_KEY = 'vb-match-state';
const STORAGE_SCHEMA = 1;
const HISTORY_KEY = 'vb-match-history';
const HISTORY_MAX = 50;

function saveState() {
    try {
        const payload = { _schema: STORAGE_SCHEMA, state, rotationSetup: { ...rotationSetupState } };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {}
}

// Extension point for schema upgrades. Add a case per version step.
// Each call must advance _schema by exactly one step (fromVersion → fromVersion+1).
// Return the upgraded payload { _schema, state, rotationSetup } or null to discard.
function migrate(saved, fromVersion) {
    // no migrations defined yet
    return null;
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        let cur = JSON.parse(raw);
        while (cur?._schema !== STORAGE_SCHEMA) {
            const next = migrate(cur, cur?._schema);
            if (!next || next._schema === cur._schema) { clearState(); return null; }
            cur = next;
        }
        return { state: cur.state || null, rotationSetup: cur.rotationSetup || null };
    } catch (_) { return null; }
}

function clearState() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
}

function saveMatchToHistory(matchData) {
    try {
        const history = loadMatchHistory();
        history.unshift(matchData);
        if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (_) {}
}

function loadMatchHistory() {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
}

function initDragAndDrop() {
    if (_dndInitialized) return;
    _dndInitialized = true;
    const container = document.getElementById('rotationSetup');
    let ghost = null;
    let dragSource = null;
    let dragTeam = null;
    let dragFromPos = null;
    let didMove = false;
    let activePointerId = null;
    let suppressNextClick = false;

    function getRotation(team) {
        return team === 1 ? rotationSetupState.team1Rotation : rotationSetupState.team2Rotation;
    }

    function getPlayerAt(team, pos) { return getRotation(team)[pos] || null; }

    function setPlayer(team, pos, player) {
        getRotation(team)[pos] = player;
    }

    function clearPlayer(team, pos) {
        getRotation(team)[pos] = null;
    }

    function refreshUI(team) {
        updateAvailablePlayers(team);
        updateRotationSetupDisplay();
    }

    function createGhost(el) {
        ghost = el.cloneNode(true);
        ghost.style.cssText = `position:fixed;pointer-events:none;z-index:9999;opacity:0.85;transform:scale(1.15);transition:none;`;
        document.body.appendChild(ghost);
    }

    function moveGhost(x, y) {
        if (!ghost) return;
        const r = ghost.getBoundingClientRect();
        ghost.style.left = `${x - r.width / 2}px`;
        ghost.style.top = `${y - r.height / 2}px`;
    }

    function removeGhost() {
        if (ghost) { ghost.remove(); ghost = null; }
        document.querySelectorAll('.drop-hint').forEach(el => el.classList.remove('drop-hint'));
    }

    function getDropTarget(x, y) {
        if (!ghost) return null;
        ghost.style.display = 'none';
        const el = document.elementFromPoint(x, y);
        ghost.style.display = '';
        if (!el) return null;
        return el.closest('.rotation-setup-pos') || el.closest('.available-player');
    }

    container.addEventListener('pointerdown', e => {
        suppressNextClick = false;
        const src = e.target.closest('.available-player:not(.used), .rotation-setup-pos');
        if (!src) return;
        const team = parseInt(src.dataset.team);
        if (!team) return;

        const isPos = src.classList.contains('rotation-setup-pos');
        const fromPos = isPos ? parseInt(src.dataset.pos) : null;
        if (isPos && !getRotation(team)[fromPos]) return;

        dragSource = src;
        dragTeam = team;
        dragFromPos = fromPos;
        didMove = false;
        activePointerId = e.pointerId;
        src.setPointerCapture(e.pointerId);
        createGhost(src);
        moveGhost(e.clientX, e.clientY);
        src.classList.add('dragging');
        e.preventDefault();
    }, { passive: false });

    container.addEventListener('pointermove', e => {
        if (!dragSource || e.pointerId !== activePointerId) return;
        didMove = true;
        moveGhost(e.clientX, e.clientY);

        document.querySelectorAll('.drop-hint').forEach(el => el.classList.remove('drop-hint'));
        const target = getDropTarget(e.clientX, e.clientY);
        if (target && target.classList.contains('rotation-setup-pos') && parseInt(target.dataset.team) === dragTeam) {
            target.classList.add('drop-hint');
        }
    });

    container.addEventListener('pointerup', e => {
        if (!dragSource || e.pointerId !== activePointerId) return;
        dragSource.classList.remove('dragging');

        if (!didMove) {
            removeGhost();
            dragSource = null;
            return;
        }

        suppressNextClick = true;

        const target = getDropTarget(e.clientX, e.clientY);
        removeGhost();

        if (target && target.classList.contains('rotation-setup-pos')) {
            const targetTeam = parseInt(target.dataset.team);
            const targetPos = parseInt(target.dataset.pos);

            if (targetTeam === dragTeam) {
                const player = dragFromPos !== null
                    ? getPlayerAt(dragTeam, dragFromPos)
                    : dragSource.dataset.player;

                if (player) {
                    const displaced = getPlayerAt(dragTeam, targetPos);
                    setPlayer(dragTeam, targetPos, player);
                    if (dragFromPos !== null) {
                        // Slot-to-slot: put displaced player back in source slot
                        setPlayer(dragTeam, dragFromPos, displaced);
                    }
                    refreshUI(dragTeam);
                    saveState();
                }
            }
        }

        dragSource = null;
        dragTeam = null;
        dragFromPos = null;
        activePointerId = null;
    });

    container.addEventListener('pointercancel', () => {
        if (dragSource) dragSource.classList.remove('dragging');
        removeGhost();
        dragSource = null;
        dragTeam = null;
        dragFromPos = null;
        activePointerId = null;
    });

    container.addEventListener('click', e => {
        if (!suppressNextClick) return;
        suppressNextClick = false;
        if (e.target.closest('.rotation-setup-pos, .available-player')) {
            e.stopPropagation();
        }
    }, true);
}

function hexToRgb(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    const v = parseInt(h, 16);
    return `${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}`;
}

function applyTeamColors(c1, c2) {
    const root = document.documentElement.style;
    root.setProperty('--team1-color', c1);
    root.setProperty('--team1-rgb', hexToRgb(c1));
    root.setProperty('--team2-color', c2);
    root.setProperty('--team2-rgb', hexToRgb(c2));
    document.getElementById('team1Color').value = c1;
    document.getElementById('team2Color').value = c2;
    try { localStorage.setItem('vb-team-colors', JSON.stringify({ c1, c2 })); } catch (_) {}
}

function restoreSavedMatch() {
    const loaded = loadState();
    if (!loaded) return false;
    const { state: saved, rotationSetup: savedRS } = loaded;

    Object.assign(state, saved);

    // matchStarted covers no-jersey matches; team1Players.length covers old saves from jersey matches
    const inProgress = state.matchStarted || state.team1Players.length > 0;

    let onScoreboard = false;

    if (state.matchOver) {
        endMatch();
    } else if (!inProgress) {
        return false;
    } else if (state.team1Players.length > 0 && state.hasRotation && (!Array.isArray(state.team1Rotation) || state.team1Rotation.length === 0) && !state.matchStarted) {
        // reloaded mid-first-set rotation setup
        _restoredRotationSetup = savedRS || null;
        showRotationSetup();
        return true;
    } else if (state.hasRotation && state.team1Rotation.length === 6) {
        document.getElementById('setup').classList.add('hidden');
        document.getElementById('rotationSetup').classList.add('hidden');
        document.getElementById('scoreboard').classList.remove('hidden');
        document.getElementById('matchResult').classList.add('hidden');
        document.getElementById('rotation1').classList.remove('hidden');
        document.getElementById('rotation2').classList.remove('hidden');
        updateDisplay();
        onScoreboard = true;
    } else if (state.hasRotation) {
        _restoredRotationSetup = savedRS || null;
        showNewSetRotationSetup();
    } else {
        document.getElementById('setup').classList.add('hidden');
        document.getElementById('rotationSetup').classList.add('hidden');
        document.getElementById('scoreboard').classList.remove('hidden');
        document.getElementById('matchResult').classList.add('hidden');
        document.getElementById('rotation1').classList.add('hidden');
        document.getElementById('rotation2').classList.add('hidden');
        updateDisplay();
        onScoreboard = true;
    }

    if (onScoreboard && !state.matchOver && !state.deciderSideSwitched
            && getPointsToWin() === FINAL_SET_POINTS
            && (state.team1Score >= 8 || state.team2Score >= 8)) {
        showDeciderSwitchModal();
    }

    return true;
}

function init() {
    // Restore saved team colors
    try {
        const saved = JSON.parse(localStorage.getItem('vb-team-colors') || 'null');
        if (saved) applyTeamColors(saved.c1, saved.c2);
    } catch (_) {}

    document.getElementById('team1Color').addEventListener('input', e => {
        const c2 = getComputedStyle(document.documentElement).getPropertyValue('--team2-color').trim();
        applyTeamColors(e.target.value, c2);
    });
    document.getElementById('team2Color').addEventListener('input', e => {
        const c1 = getComputedStyle(document.documentElement).getPropertyValue('--team1-color').trim();
        applyTeamColors(c1, e.target.value);
    });
    document.querySelectorAll('.color-swatch').forEach(btn => {
        btn.addEventListener('click', e => {
            const team = e.currentTarget.dataset.team;
            const color = e.currentTarget.dataset.color;
            if (team === '1') {
                const c2 = getComputedStyle(document.documentElement).getPropertyValue('--team2-color').trim();
                applyTeamColors(color, c2);
            } else {
                const c1 = getComputedStyle(document.documentElement).getPropertyValue('--team1-color').trim();
                applyTeamColors(c1, color);
            }
        });
    });

    document.getElementById('startMatch').addEventListener('click', startMatch);
    document.getElementById('playAgain').addEventListener('click', resetToSetup);
    document.getElementById('undoPoint').addEventListener('click', undoLastPoint);
    document.getElementById('historyBtn').addEventListener('click', showHistoryModal);
    document.getElementById('closeHistory').addEventListener('click', closeHistoryModal);
    document.getElementById('historyModal').addEventListener('click', e => {
        if (e.target === document.getElementById('historyModal')) closeHistoryModal();
    });
    updateHistoryButton();

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
    document.getElementById('continueSetBreak').addEventListener('click', closeSetBreakModal);
    document.getElementById('confirmRotation').addEventListener('click', confirmRotationSetup);
    document.getElementById('cancelSub').addEventListener('click', closeSubModal);
    document.getElementById('returnToSetup').addEventListener('click', showReturnToSetupModal);
    document.getElementById('cancelReturnToSetup').addEventListener('click', closeReturnToSetupModal);
    document.getElementById('confirmReturnToSetup').addEventListener('click', confirmReturnToSetup);
    document.getElementById('confirmDeciderSwitch').addEventListener('click', closeDeciderSwitchModal);

    document.querySelectorAll('.rotation-setup-pos').forEach(pos => {
        pos.addEventListener('click', handlePositionClick);
    });

    document.querySelectorAll('#rotation1 .rotation-pos, #rotation2 .rotation-pos').forEach(pos => {
        pos.addEventListener('click', handleGamePositionClick);
    });

    document.querySelectorAll('.use-prev-rotation').forEach(btn => {
        btn.addEventListener('click', e => {
            const team = parseInt(e.currentTarget.dataset.team);
            const prev = team === 1 ? state.lastStartingRotation1 : state.lastStartingRotation2;
            if (!prev || prev.length < 6) return;
            const target = team === 1 ? rotationSetupState.team1Rotation : rotationSetupState.team2Rotation;
            for (let i = 0; i < 6; i++) target[i + 1] = prev[i];
            updateAvailablePlayers(team);
            updateRotationSetupDisplay();
            rotationSetupState.selectedPosition = null;
            rotationSetupState.selectedTeam = null;
            document.querySelectorAll('.rotation-setup-pos').forEach(p => p.classList.remove('selected'));
            saveState();
        });
    });

    restoreSavedMatch();
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

    const timeoutDurationMs = TIMEOUT_DURATION * 1000;
    const startTime = performance.now();
    timerProgress.style.strokeDashoffset = 0;

    const updateInterval = 10;

    timeoutInterval = setInterval(() => {
        const timeLeft = Math.max(0, timeoutDurationMs - (performance.now() - startTime));

        const seconds = Math.floor(timeLeft / 1000);
        const milliseconds = Math.floor((timeLeft % 1000) / 10);
        timerText.textContent = `${seconds}.${milliseconds.toString().padStart(2, '0')}`;

        const offset = TIMER_CIRCLE_CIRCUMFERENCE * (1 - timeLeft / timeoutDurationMs);
        timerProgress.style.strokeDashoffset = offset;

        if (timeLeft <= 0) {
            timerText.textContent = '0.00';
            clearInterval(timeoutInterval);
            timeoutInterval = null;
            shakeModal(modal.querySelector('.modal-content'));
        }
    }, updateInterval);
}

function closeTimeoutModal() {
    stopRepeatingVibration();
    const modal = document.getElementById('timeoutModal');
    modal.classList.add('hidden');

    if (timeoutInterval) {
        clearInterval(timeoutInterval);
        timeoutInterval = null;
    }
}

function showSetBreakModal(setNumber) {
    const modal = document.getElementById('setBreakModal');
    const timerText = document.getElementById('setBreakText');
    const timerProgress = document.getElementById('setBreakProgress');
    const titleDisplay = document.getElementById('setBreakTitle');

    titleDisplay.textContent = `Set ${setNumber - 1} Complete - Break Time`;
    
    // Hide scoreboard to prevent background visibility
    document.getElementById('scoreboard').classList.add('hidden');
    modal.classList.remove('hidden');

    const setBreakDurationMs = SET_BREAK_DURATION * 1000;
    const startTime = performance.now();
    timerProgress.style.strokeDashoffset = 0;

    const updateInterval = 100; // Update every 100ms for second-level precision

    setBreakInterval = setInterval(() => {
        const timeLeft = Math.max(0, setBreakDurationMs - (performance.now() - startTime));

        // Format as mm:ss
        const totalSeconds = Math.floor(timeLeft / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        timerText.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        const offset = TIMER_CIRCLE_CIRCUMFERENCE * (1 - timeLeft / setBreakDurationMs);
        timerProgress.style.strokeDashoffset = offset;

        if (timeLeft <= 0) {
            timerText.textContent = '0:00';
            clearInterval(setBreakInterval);
            setBreakInterval = null;
            shakeModal(modal.querySelector('.modal-content'));
        }
    }, updateInterval);
}

function closeSetBreakModal() {
    stopRepeatingVibration();
    const modal = document.getElementById('setBreakModal');
    modal.classList.add('hidden');

    if (setBreakInterval) {
        clearInterval(setBreakInterval);
        setBreakInterval = null;
    }

    if (state.hasRotation) {
        showNewSetRotationSetup();
    } else {
        document.getElementById('scoreboard').classList.remove('hidden');
        updateDisplay();
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

    const makeSubEl = (player, classes, attrs = {}) => {
        const el = document.createElement('div');
        el.className = ['sub-option', ...classes].join(' ');
        el.dataset.player = player;
        el.textContent = player;
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
        return el;
    };

    const fragment = document.createDocumentFragment();

    if (subs[rotationIndex] && currentPlayer !== subs[rotationIndex].original) {
        const original = subs[rotationIndex].original;
        fragment.appendChild(makeSubEl(original, ['return-player'], { title: 'Return original player' }));
    }

    if (libero && !playersOnCourt.includes(libero)) {
        if (isBackRow) {
            fragment.appendChild(makeSubEl(libero, ['libero'], { 'data-is-libero': 'true', title: 'Libero' }));
        } else {
            fragment.appendChild(makeSubEl(libero, ['libero', 'disabled'], { title: 'Libero can only sub in back row' }));
        }
    }

    availableSubs.forEach(player => {
        if (player === libero) return;
        if (subs[rotationIndex] && player === subs[rotationIndex].original) return;

        const subEntry = Object.entries(subs).find(([idx, sub]) => sub.original === player);
        if (subEntry) {
            const [subIdx] = subEntry;
            if (parseInt(subIdx) !== rotationIndex) {
                fragment.appendChild(makeSubEl(player, ['disabled'], { title: `Can only return to position ${parseInt(subIdx) + 1}` }));
                return;
            }
        }
        fragment.appendChild(makeSubEl(player, []));
    });

    optionsContainer.innerHTML = '';
    if (fragment.childElementCount === 0) {
        optionsContainer.innerHTML = '<p>No substitutes available</p>';
    } else {
        optionsContainer.appendChild(fragment);
    }

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

function showReturnToSetupModal() {
    const summary = document.getElementById('returnToSetupScoreSummary');
    const cssStyle = getComputedStyle(document.documentElement);
    const colorA = cssStyle.getPropertyValue('--team1-color').trim();
    const colorB = cssStyle.getPropertyValue('--team2-color').trim();
    const team1Color = state.team1OriginalId === 'A' ? colorA : colorB;
    const team2Color = state.team2OriginalId === 'A' ? colorA : colorB;

    let rows = '';
    state.setHistory.forEach((s, i) => {
        const t1Won = s.winner === 1;
        rows += `
            <div class="confirm-set-row">
                <span class="${t1Won ? 'confirm-score-winner' : 'confirm-score-loser'}">${s.team1Score}</span>
                <span class="confirm-set-label">Set ${i + 1}</span>
                <span class="${!t1Won ? 'confirm-score-winner' : 'confirm-score-loser'}">${s.team2Score}</span>
            </div>`;
    });
    rows += `
        <div class="confirm-set-row confirm-set-live">
            <span class="confirm-score-winner">${state.team1Score}</span>
            <span class="confirm-set-label confirm-set-label-live">Set ${state.currentSet} · live</span>
            <span class="confirm-score-winner">${state.team2Score}</span>
        </div>`;

    summary.innerHTML = `
        <div class="confirm-team-header">
            <span style="color:${team1Color}">${escapeHtml(state.team1Name)}</span>
            <span class="confirm-sets-label">Sets</span>
            <span style="color:${team2Color}">${escapeHtml(state.team2Name)}</span>
        </div>
        <div class="confirm-sets-tally">
            <span>${state.team1Sets}</span>
            <span class="confirm-tally-sep">–</span>
            <span>${state.team2Sets}</span>
        </div>
        ${rows}`;

    document.getElementById('returnToSetupModal').classList.remove('hidden');
}

function closeReturnToSetupModal() {
    document.getElementById('returnToSetupModal').classList.add('hidden');
}

function confirmReturnToSetup() {
    stopRepeatingVibration();
    closeReturnToSetupModal();
    closeTimeoutModal();
    if (setBreakInterval) { clearInterval(setBreakInterval); setBreakInterval = null; }
    document.getElementById('setBreakModal').classList.add('hidden');
    document.getElementById('deciderSwitchModal').classList.add('hidden');
    closeSubModal();
    resetToSetup();
}

function closeSubModal() {
    document.getElementById('subModal').classList.add('hidden');
    currentSubTeam = null;
    currentSubPosition = null;
}

function showHistoryModal() {
    const history = loadMatchHistory();
    const listEl = document.getElementById('historyList');

    if (history.length === 0) {
        listEl.innerHTML = '<p class="history-empty">No completed matches yet.</p>';
    } else {
        listEl.innerHTML = history.map(entry => {
            const date = new Date(entry.finishedAt);
            const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
            const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
            const setsHTML = (entry.setHistory || []).map(s => {
                const wc = s.winner === 1 ? (entry.team1Color || '#4a9eff') : (entry.team2Color || '#f5a623');
                const wr = s.winner === 1 ? (entry.team1Rgb || '74,158,255') : (entry.team2Rgb || '245,166,35');
                const ps = `background:rgba(${wr},0.18);color:${wc};border:1px solid rgba(${wr},0.3);`;
                return `<span class="history-set-score" style="${ps}">${s.team1Score}–${s.team2Score}</span>`;
            }).join('');
            return `
                <div class="history-entry">
                    <div class="history-entry-header">
                        <span class="history-winner">${escapeHtml(entry.winner)}</span>
                        <span class="history-date">${dateStr} · ${timeStr}</span>
                    </div>
                    <div class="history-teams">
                        <span class="history-team-name">${escapeHtml(entry.team1Name)}</span>
                        <span class="history-sets-tally">${entry.team1Sets} – ${entry.team2Sets}</span>
                        <span class="history-team-name">${escapeHtml(entry.team2Name)}</span>
                    </div>
                    <div class="history-set-scores">${setsHTML}</div>
                </div>`;
        }).join('');
    }

    document.getElementById('historyModal').classList.remove('hidden');
}

function closeHistoryModal() {
    document.getElementById('historyModal').classList.add('hidden');
}

function updateHistoryButton() {
    const btn = document.getElementById('historyBtn');
    if (!btn) return;
    btn.style.display = loadMatchHistory().length > 0 ? '' : 'none';
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
    [state.team1OriginalId, state.team2OriginalId] = [state.team2OriginalId, state.team1OriginalId];
    [state.lastStartingRotation1, state.lastStartingRotation2] = [state.lastStartingRotation2, state.lastStartingRotation1];

    state.setHistory = state.setHistory.map(set => ({
        ...set,
        winner: set.winner === 1 ? 2 : 1,
        team1Score: set.team2Score,
        team2Score: set.team1Score,
        points: (set.points || []).map(p => ({
            ...p,
            team: p.team === 1 ? 2 : 1,
            team1Score: p.team2Score,
            team2Score: p.team1Score
        }))
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
    [state.team1OriginalId, state.team2OriginalId] = [state.team2OriginalId, state.team1OriginalId];
    [state.lastStartingRotation1, state.lastStartingRotation2] = [state.lastStartingRotation2, state.lastStartingRotation1];

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
        team2Score: set.team1Score,
        points: (set.points || []).map(p => ({
            ...p,
            team: p.team === 1 ? 2 : 1,
            team1Score: p.team2Score,
            team2Score: p.team1Score
        }))
    }));

    state.pointHistory = state.pointHistory.map(snap => ({
        ...snap,
        team1Score: snap.team2Score,
        team2Score: snap.team1Score,
        team1Sets: snap.team2Sets,
        team2Sets: snap.team1Sets,
        serving: snap.serving === 1 ? 2 : 1,
        team1Rotation: snap.team2Rotation,
        team2Rotation: snap.team1Rotation,
        team1Subs: snap.team2Subs,
        team2Subs: snap.team1Subs,
        team1LiberoIn: snap.team2LiberoIn,
        team2LiberoIn: snap.team1LiberoIn,
        currentSetPoints: snap.currentSetPoints.map(p => ({
            ...p,
            team: p.team === 1 ? 2 : 1,
            team1Score: p.team2Score,
            team2Score: p.team1Score
        })),
        setHistory: snap.setHistory.map(s => ({
            ...s,
            winner: s.winner === 1 ? 2 : 1,
            team1Score: s.team2Score,
            team2Score: s.team1Score,
            points: (s.points || []).map(p => ({
                ...p,
                team: p.team === 1 ? 2 : 1,
                team1Score: p.team2Score,
                team2Score: p.team1Score
            }))
        }))
    }));

    updateDisplay();
}

function maybeTriggerDeciderSwitch() {
    if (state.deciderSideSwitched) return;
    if (state.matchOver) return;
    if (getPointsToWin() !== FINAL_SET_POINTS) return;
    if (state.team1Score < 8 && state.team2Score < 8) return;
    showDeciderSwitchModal();
}

function showDeciderSwitchModal() {
    const scoreEl = document.getElementById('deciderSwitchScore');
    const cs = getComputedStyle(document.documentElement);
    const colorA = cs.getPropertyValue('--team1-color').trim();
    const colorB = cs.getPropertyValue('--team2-color').trim();
    const t1Color = state.team1OriginalId === 'A' ? colorA : colorB;
    const t2Color = state.team2OriginalId === 'A' ? colorA : colorB;
    scoreEl.innerHTML =
        `<span style="color:${t1Color}">${escapeHtml(state.team1Name)} ${state.team1Score}</span>` +
        ` <span class="decider-switch-sep">·</span> ` +
        `<span style="color:${t2Color}">${escapeHtml(state.team2Name)} ${state.team2Score}</span>`;
    vibrateDevice([300, 100, 300, 100, 500]);
    document.getElementById('deciderSwitchModal').classList.remove('hidden');
}

function closeDeciderSwitchModal() {
    const modal = document.getElementById('deciderSwitchModal');
    if (modal.classList.contains('hidden')) return;
    state.deciderSideSwitched = true;
    modal.classList.add('hidden');
    swapTeams();
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
            errors.map(e => `<li>${escapeHtml(e)}</li>`).join('') + '</ul>';
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
        saveState();
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
        const invalidNumbers = players.filter(n => !isValidJersey(n));
        if (invalidNumbers.length > 0) {
            errors.push(`${teamName}: Invalid jersey identifier(s): ${invalidNumbers.join(', ')} (max 3 chars, no HTML special chars)`);
        }

        const validPlayers = players.filter(n => isValidJersey(n));

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
            if (!isValidJersey(captain)) {
                errors.push(`${teamName}: Captain jersey must be 1–3 characters`);
            } else if (validPlayers.length > 0 && !validPlayers.includes(captain)) {
                errors.push(`${teamName}: Captain #${captain} is not in the jersey numbers list`);
            }
        }

        if (libero) {
            if (!isValidJersey(libero)) {
                errors.push(`${teamName}: Libero jersey must be 1–3 characters`);
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

function isValidJersey(value) {
    const v = String(value).trim();
    if (v.length === 0) return false;
    if ([...v].length > 3) return false;
    return !/[<>&"']/.test(v);
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function vibrateDevice(pattern) {
    try {
        if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (_) {}
}

function stopRepeatingVibration() {
    if (vibrateInterval) {
        clearInterval(vibrateInterval);
        vibrateInterval = null;
    }
    try { if (navigator.vibrate) navigator.vibrate(0); } catch (_) {}
    if (_alertContentEl) {
        _alertContentEl.classList.remove('modal-shake');
        _alertContentEl = null;
    }
}

function shakeModal(contentEl) {
    stopRepeatingVibration();
    _alertContentEl = contentEl;

    function pulse() {
        try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (_) {}
        contentEl.classList.remove('modal-shake');
        void contentEl.offsetWidth;
        contentEl.classList.add('modal-shake');
    }

    pulse();
    vibrateInterval = setInterval(pulse, 1500);
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
    rotationSetupState.isNewSet = false;

    if (_restoredRotationSetup && !_restoredRotationSetup.isNewSet) {
        Object.assign(rotationSetupState, _restoredRotationSetup);
        rotationSetupState.selectedPosition = null;
        rotationSetupState.selectedTeam = null;
        _restoredRotationSetup = null;
    }
    saveState();

    updateAvailablePlayers(1);
    updateAvailablePlayers(2);
    updateRotationSetupDisplay();
    updateRotationSetupColors();

    const header = document.querySelector('#rotationSetup h2');
    header.textContent = 'Set Starting Rotations';

    document.getElementById('rotationSetupSetScore').classList.add('hidden');
    updatePrevRotationButtons();
    initDragAndDrop();
}

function showNewSetRotationSetup() {
    state.team1Rotation = [];
    state.team2Rotation = [];
    saveState();
    document.getElementById('scoreboard').classList.add('hidden');
    document.getElementById('rotationSetup').classList.remove('hidden');

    document.getElementById('rotationTeam1Name').textContent = state.team1Name;
    document.getElementById('rotationTeam2Name').textContent = state.team2Name;

    rotationSetupState.team1Rotation = { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
    rotationSetupState.team2Rotation = { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
    rotationSetupState.selectedPosition = null;
    rotationSetupState.selectedTeam = null;
    rotationSetupState.isNewSet = true;

    if (_restoredRotationSetup && _restoredRotationSetup.isNewSet) {
        Object.assign(rotationSetupState, _restoredRotationSetup);
        rotationSetupState.selectedPosition = null;
        rotationSetupState.selectedTeam = null;
        _restoredRotationSetup = null;
    }
    saveState();

    updateAvailablePlayers(1);
    updateAvailablePlayers(2);
    updateRotationSetupDisplay();
    updateRotationSetupColors();

    const header = document.querySelector('#rotationSetup h2');
    header.textContent = `Set ${state.currentSet} - Starting Rotations`;

    const scoreDisplay = document.getElementById('rotationSetupSetScore');
    scoreDisplay.classList.remove('hidden');
    scoreDisplay.innerHTML = `Match Score: <strong>${escapeHtml(state.team1Name)}</strong> ${state.team1Sets} - ${state.team2Sets} <strong>${escapeHtml(state.team2Name)}</strong>`;
    updatePrevRotationButtons();
    initDragAndDrop();
}

function updatePrevRotationButtons() {
    const btn1 = document.querySelector('.use-prev-rotation[data-team="1"]');
    const btn2 = document.querySelector('.use-prev-rotation[data-team="2"]');
    if (btn1) btn1.style.display = state.lastStartingRotation1 ? '' : 'none';
    if (btn2) btn2.style.display = state.lastStartingRotation2 ? '' : 'none';
}

function updateAvailablePlayers(team) {
    const container = document.getElementById(`availablePlayers${team}`);
    const players = team === 1 ? state.team1Players : state.team2Players;
    const libero = team === 1 ? state.team1Libero : state.team2Libero;
    const captain = team === 1 ? state.team1Captain : state.team2Captain;
    const rotation = team === 1 ? rotationSetupState.team1Rotation : rotationSetupState.team2Rotation;

    const usedPlayers = Object.values(rotation).filter(p => p !== null);

    container.innerHTML = '';
    players.forEach(player => {
        if (player === libero) return;

        const isUsed = usedPlayers.includes(player);
        const isCaptain = player === captain;
        const classes = ['available-player'];
        if (isUsed) classes.push('used');
        if (isCaptain) classes.push('captain');

        const el = document.createElement('span');
        el.className = classes.join(' ');
        el.dataset.team = team;
        el.dataset.player = player;
        el.textContent = player;
        if (!isUsed) el.addEventListener('click', handlePlayerSelect);
        container.appendChild(el);
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
        saveState();
        return;
    }

    e.target.classList.add('selected');
    rotationSetupState.selectedPosition = pos;
    rotationSetupState.selectedTeam = team;
    saveState();
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
    saveState();
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
            errors.map(e => `<li>${escapeHtml(e)}</li>`).join('') + '</ul>';
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

    state.lastStartingRotation1 = [...state.team1Rotation];
    state.lastStartingRotation2 = [...state.team2Rotation];

    rotationSetupState.team1Rotation = { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
    rotationSetupState.team2Rotation = { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };

    document.getElementById('rotationSetup').classList.add('hidden');
    
    if (rotationSetupState.isNewSet) {
        // Continue existing match with new set rotations
        // Don't call beginMatch() as it would reset match state
        // Just show scoreboard and update display with new rotations
        document.getElementById('scoreboard').classList.remove('hidden');
        updateDisplay();
    } else {
        // Start a new match - this will reset state and set up all UI elements
        beginMatch();
    }
}

function beginMatch() {
    const savedR1 = state.team1Rotation.slice();
    const savedR2 = state.team2Rotation.slice();
    const savedHasRotation = state.hasRotation;
    const savedLast1 = state.lastStartingRotation1;
    const savedLast2 = state.lastStartingRotation2;
    resetMatchState();
    state.matchStarted = true;
    state.team1Rotation = savedR1;
    state.team2Rotation = savedR2;
    state.hasRotation = savedHasRotation;
    state.lastStartingRotation1 = savedLast1;
    state.lastStartingRotation2 = savedLast2;

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
    clearState();
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
    state.team1OriginalId = 'A';
    state.team2OriginalId = 'B';
    state.team1Rotation = [];
    state.team2Rotation = [];
    state.team1Subs = {};
    state.team2Subs = {};
    state.team1LiberoIn = null;
    state.team2LiberoIn = null;
    state.hasRotation = false;
    state.lastStartingRotation1 = null;
    state.lastStartingRotation2 = null;
    state.matchStarted = false;
    state.deciderSideSwitched = false;
    _restoredRotationSetup = null;
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

    _scorePulseTeam = team;
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
    maybeTriggerDeciderSwitch();
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
        const winnerOriginalId = setWinner === 1 ? state.team1OriginalId : state.team2OriginalId;
        state.setHistory.push({
            set: state.currentSet,
            team1Score: state.team1Score,
            team2Score: state.team2Score,
            winner: setWinner,
            winnerOriginalId: winnerOriginalId,
            points: [...state.currentSetPoints]
        });

        if (setWinner === 1) {
            state.team1Sets++;
        } else {
            state.team2Sets++;
        }

        if (state.team1Sets >= state.setsToWin || state.team2Sets >= state.setsToWin) {
            const _cs = getComputedStyle(document.documentElement);
            const _colorA = _cs.getPropertyValue('--team1-color').trim();
            const _colorB = _cs.getPropertyValue('--team2-color').trim();
            const _rgbA   = _cs.getPropertyValue('--team1-rgb').trim();
            const _rgbB   = _cs.getPropertyValue('--team2-rgb').trim();
            saveMatchToHistory({
                finishedAt: Date.now(),
                team1Name: state.team1Name,
                team2Name: state.team2Name,
                team1Sets: state.team1Sets,
                team2Sets: state.team2Sets,
                winner: state.team1Sets > state.team2Sets ? state.team1Name : state.team2Name,
                team1Color: state.team1OriginalId === 'A' ? _colorA : _colorB,
                team2Color: state.team2OriginalId === 'A' ? _colorA : _colorB,
                team1Rgb:   state.team1OriginalId === 'A' ? _rgbA   : _rgbB,
                team2Rgb:   state.team2OriginalId === 'A' ? _rgbA   : _rgbB,
                setHistory: state.setHistory.map(s => ({ team1Score: s.team1Score, team2Score: s.team2Score, winner: s.winner }))
            });
            updateHistoryButton();
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
            state.deciderSideSwitched = false;

            switchSides();

            showSetBreakModal(state.currentSet);
        }
    }
}

function renderSetChart(set) {
    const pts = set.points;
    if (!pts || pts.length < 2) return '';

    const w = 280, dataH = 78, padX = 4, padY = 6, tickZone = 18;
    const svgH = dataH + tickZone;
    const allPts = [{ team1Score: 0, team2Score: 0 }, ...pts];
    const n = allPts.length - 1;
    const maxScore = Math.max(set.team1Score, set.team2Score, 1);

    const cssStyle = getComputedStyle(document.documentElement);
    const colorA = cssStyle.getPropertyValue('--team1-color').trim();
    const colorB = cssStyle.getPropertyValue('--team2-color').trim();
    const rgbA   = cssStyle.getPropertyValue('--team1-rgb').trim();
    const rgbB   = cssStyle.getPropertyValue('--team2-rgb').trim();
    const team1Color = state.team1OriginalId === 'A' ? colorA : colorB;
    const team1Rgb   = state.team1OriginalId === 'A' ? rgbA   : rgbB;
    const team2Color = state.team2OriginalId === 'A' ? colorA : colorB;
    const team2Rgb   = state.team2OriginalId === 'A' ? rgbA   : rgbB;

    const toX = i => (padX + (n > 0 ? (i / n) * (w - 2 * padX) : 0)).toFixed(1);
    const toY = s => ((dataH - padY) - (s / maxScore) * (dataH - 2 * padY)).toFixed(1);

    // Per-segment lines — trailing team rendered at low opacity each interval
    let lines1 = '', lines2 = '';
    for (let i = 1; i <= n; i++) {
        const prev = allPts[i - 1], cur = allPts[i];
        const x1 = toX(i - 1), x2 = toX(i);
        const op1 = prev.team1Score < prev.team2Score ? '0.28' : '1';
        const op2 = prev.team2Score < prev.team1Score ? '0.28' : '1';
        lines1 += `<line x1="${x1}" y1="${toY(prev.team1Score)}" x2="${x2}" y2="${toY(cur.team1Score)}" stroke="${team1Color}" stroke-width="2.5" stroke-opacity="${op1}" stroke-linecap="round"/>`;
        lines2 += `<line x1="${x1}" y1="${toY(prev.team2Score)}" x2="${x2}" y2="${toY(cur.team2Score)}" stroke="${team2Color}" stroke-width="2.5" stroke-opacity="${op2}" stroke-linecap="round"/>`;
    }

    // Score markers — tick at each 5-point score milestone (labels show score, not rally count)
    let ticks = '';
    for (let score = 5; score <= maxScore; score += 5) {
        const idx = allPts.findIndex(p => Math.max(p.team1Score, p.team2Score) >= score);
        if (idx > 0) {
            const x = toX(idx);
            ticks += `<line x1="${x}" y1="${dataH - 1}" x2="${x}" y2="${dataH + 4}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>`;
            ticks += `<text x="${x}" y="${svgH - 2}" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.38)" font-family="Barlow Semi Condensed,sans-serif">${score}</text>`;
        }
    }

    const winnerOriginalId = set.winnerOriginalId || (set.winner === 1 ? 'A' : 'B');
    const winLabel = winnerOriginalId === state.team1OriginalId ? state.team1Name : state.team2Name;
    const winColor = winnerOriginalId === state.team1OriginalId ? team1Color : team2Color;

    return `
        <div class="set-chart-wrap">
            <div class="set-chart-header">
                <span class="set-chart-label">Set ${set.set}</span>
                <span class="set-chart-score">${set.team1Score} – ${set.team2Score}</span>
                <span class="set-chart-winner" style="color:${winColor}">${escapeHtml(winLabel)}</span>
            </div>
            <svg viewBox="0 0 ${w} ${svgH}" class="set-chart" preserveAspectRatio="none">
                ${lines1}${lines2}${ticks}
            </svg>
            <div class="set-chart-axis">
                <span style="color:${team1Color}">${escapeHtml(state.team1Name)}</span>
                <span style="color:${team2Color}">${escapeHtml(state.team2Name)}</span>
            </div>
        </div>
    `;
}

function endMatch() {
    state.matchOver = true;
    const winner = state.team1Sets > state.team2Sets ? state.team1Name : state.team2Name;

    document.getElementById('scoreboard').classList.add('hidden');
    document.getElementById('matchResult').classList.remove('hidden');

    document.getElementById('winner').textContent = `${winner} Wins!`;

    const totalT1 = state.setHistory.reduce((a, s) => a + s.team1Score, 0);
    const totalT2 = state.setHistory.reduce((a, s) => a + s.team2Score, 0);

    let scoreHTML = `<div class="final-summary">Final: ${state.team1Sets} – ${state.team2Sets}</div>`;
    scoreHTML += `<div class="total-points">${escapeHtml(state.team1Name)} ${totalT1} pts &nbsp;·&nbsp; ${escapeHtml(state.team2Name)} ${totalT2} pts</div>`;
    scoreHTML += '<div class="set-results-row">';
    state.setHistory.forEach(set => {
        const winnerClass = set.winner === 1 ? 'team1-win' : 'team2-win';
        scoreHTML += `<span class="set-result ${winnerClass}">Set ${set.set}: ${set.team1Score}-${set.team2Score}</span>`;
    });
    scoreHTML += '</div>';

    scoreHTML += '<div class="set-charts">';
    state.setHistory.forEach(set => {
        scoreHTML += renderSetChart(set);
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

function updateRotationSetupColors() {
    const rotationTeam1Name = document.getElementById('rotationTeam1Name');
    const rotationTeam2Name = document.getElementById('rotationTeam2Name');

    if (!rotationTeam1Name || !rotationTeam2Name) return;

    const style = getComputedStyle(document.documentElement);
    const team1Color = style.getPropertyValue('--team1-color').trim();
    const team2Color = style.getPropertyValue('--team2-color').trim();

    if (state.team1OriginalId === 'A') {
        rotationTeam1Name.style.color = team1Color;
        rotationTeam2Name.style.color = team2Color;
    } else {
        rotationTeam1Name.style.color = team2Color;
        rotationTeam2Name.style.color = team1Color;
    }
}

function updateTeamColors() {
    const team1Container = document.querySelector('.current-set .team1');
    const team2Container = document.querySelector('.current-set .team2');
    const team1ScoreEl = document.getElementById('team1Score');
    const team2ScoreEl = document.getElementById('team2Score');
    const timeline1 = document.querySelector('.timeline-team:first-child');
    const timeline2 = document.querySelector('.timeline-team:last-child');
    
    const cssStyle = getComputedStyle(document.documentElement);
    const team1Color = cssStyle.getPropertyValue('--team1-color').trim();
    const team2Color = cssStyle.getPropertyValue('--team2-color').trim();

    const team1RgbVal = cssStyle.getPropertyValue('--team1-rgb').trim();
    const team2RgbVal = cssStyle.getPropertyValue('--team2-rgb').trim();

    const applyTeamStyle = (container, scoreEl, color, rgbVal, timelineEl, timelineClass) => {
        container.style.borderColor = color;
        container.style.boxShadow = `inset 0 0 30px rgba(${rgbVal}, 0.06), 0 0 0 1px rgba(${rgbVal}, 0.08)`;
        container.style.setProperty('--this-team-rgb', rgbVal);
        scoreEl.style.color = color;
        scoreEl.style.textShadow = `0 0 32px rgba(${rgbVal}, 0.4)`;
        if (timelineEl) timelineEl.setAttribute('data-team-color', timelineClass);
    };

    if (state.team1OriginalId === 'A') {
        applyTeamStyle(team1Container, team1ScoreEl, team1Color, team1RgbVal, timeline1, 'team1');
        applyTeamStyle(team2Container, team2ScoreEl, team2Color, team2RgbVal, timeline2, 'team2');
    } else {
        applyTeamStyle(team1Container, team1ScoreEl, team2Color, team2RgbVal, timeline1, 'team2');
        applyTeamStyle(team2Container, team2ScoreEl, team1Color, team1RgbVal, timeline2, 'team1');
    }
}

function pulseScore(el) {
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
    el.addEventListener('animationend', () => el.classList.remove('pulse'), { once: true });
}

function updateDisplay() {
    updateTeamColors();

    document.getElementById('team1Display').textContent = state.team1Name;
    document.getElementById('team2Display').textContent = state.team2Name;

    const t1El = document.getElementById('team1Score');
    const t2El = document.getElementById('team2Score');
    t1El.textContent = state.team1Score;
    t2El.textContent = state.team2Score;
    if (_scorePulseTeam === 1) pulseScore(t1El);
    else if (_scorePulseTeam === 2) pulseScore(t2El);
    _scorePulseTeam = null;
    let setsHTML = '';
    if (state.setHistory.length === 0) {
        setsHTML = '<span class="no-sets">No sets completed</span>';
    } else {
        state.setHistory.forEach((set, index) => {
            // Use winnerOriginalId if available (new format), fallback to winner (old format)
            const winnerTeamId = set.winnerOriginalId || (set.winner === 1 ? 'A' : 'B');
            const winnerClass = winnerTeamId === 'A' ? 'teamA-set-win' : 'teamB-set-win';
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
    saveState();
}

document.addEventListener('DOMContentLoaded', init);
