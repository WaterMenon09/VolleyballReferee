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
    // v4.21 (Tasks 1 + 10): per-set substitution pairing log, keyed by PLAYER IDENTITY —
    // never by court position, because rotateTeam() remaps position keys on every side-out.
    // One record per starter<->substitute pair: { starter, sub, returned }. Enforces FIVB
    // 15.6.2 / 15.6.3 and doubles as the per-set substitution counter (see subEntriesUsed).
    // Libero replacements are NOT substitutions (FIVB 19) and never appear here.
    team1SubPairs: [],
    team2SubPairs: [],
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
    deciderSideSwitched: false,
    matchStartedAt: null,
    // v4.21 (Task 9): transient per-set start stamp. setHistory entries are only pushed at
    // set END, so the start time cannot be written to the entry during the set — it is
    // stamped at the set's first rally here and copied into the entry at push time.
    currentSetStartedAt: null,
    matchDurationSec: null,
    rules: null,
    techTimeoutsFired: []
};

const rotationSetupState = {
    team1Rotation: { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null },
    team2Rotation: { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null },
    selectedPosition: null,
    selectedTeam: null,
    isNewSet: false
};

const MIN_LEAD = 2; // win-by-2, fixed (FIVB)

// ── Settings ──────────────────────────────────────────────────────────────
// Configurable rules + app prefs. Rules are snapshotted into state.rules at
// match start (getRules()); app prefs are read live from `settings`.
const SETTINGS_KEY = 'vb-settings';
const DEFAULT_SETTINGS = Object.freeze({
    // match rules (snapshotted into state.rules at match start)
    timeoutDuration: 30,      // seconds, 10–120
    timeoutsPerSet: 2,        // per team, 0–4
    technicalTimeouts: false, // FIVB-style: 8 & 16 pts, non-deciding sets, 60s
    setBreakDuration: 180,    // seconds, 30–600
    regularSetPoints: 25,     // 5–50
    finalSetPoints: 15,       // 5–50
    // v4.21: per team, per set. null = unlimited (the default — purely additive, so existing
    // users see no behaviour change). NOT Infinity: JSON.stringify(Infinity) is `null`, so it
    // cannot survive the vb-settings round-trip as a distinct value. NOT 0 either — 0 is a
    // legitimate literal setting meaning "no substitutions permitted".
    substitutionsPerSet: null,
    // app prefs (read live)
    sound: true,
    vibration: true,
    keepAwake: true
});
const RULE_KEYS = ['timeoutDuration', 'timeoutsPerSet', 'technicalTimeouts',
                   'setBreakDuration', 'regularSetPoints', 'finalSetPoints',
                   'substitutionsPerSet'];
const SETTINGS_RANGES = {
    timeoutDuration: [10, 120], timeoutsPerSet: [0, 4],
    setBreakDuration: [30, 600], regularSetPoints: [5, 50], finalSetPoints: [5, 50],
    substitutionsPerSet: [0, 15]  // clamp applies only when a number is actually present
};
// Numeric settings for which an EMPTY field is a real value (null), not invalid input.
// onSettingChange() would otherwise hit parseInt('') -> NaN and revert the field.
const NULLABLE_SETTINGS = new Set(['substitutionsPerSet']);
const TECH_TIMEOUT_DURATION = 60;        // seconds, fixed per FIVB rules
const TECH_TIMEOUT_THRESHOLDS = [8, 16]; // leading-score thresholds, fixed per FIVB rules

let settings = { ...DEFAULT_SETTINGS };

const TIMER_CIRCLE_RADIUS = 45; // SVG circle radius from viewBox
const TIMER_CIRCLE_CIRCUMFERENCE = 2 * Math.PI * TIMER_CIRCLE_RADIUS;

let timeoutInterval = null;
let timeoutPrevSeconds = -1;
let setBreakInterval = null;
let vibrateInterval = null;
let _alertContentEl = null;
let _scorePulseTeam = null;
let _dndInitialized = false;
let _restoredRotationSetup = null;

const STORAGE_KEY = 'vb-match-state';
const STORAGE_SCHEMA = 4;
const HISTORY_KEY = 'vb-match-history';
const HISTORY_MAX = 50;

const APP_VERSION = 'v4.24';

// ── Changelog (homepage "What's New" modal) ────────────────────────────────
// User-facing rewrite of CHANGELOG.md, not a copy of it — the file is developer-toned (internal
// notes, code names) and this is read by a referee. Deliberately an in-app array rather than
// fetch('./CHANGELOG.md'): fetching would need the raw file added to sw.js's APP_SHELL to work
// offline, for text nobody but a developer would want to read anyway.
const CHANGELOG_ENTRIES = [
    {
        version: 'v4.24',
        date: 'Aug 10, 2026',
        changes: [
            'Every pop-up can now be used from a keyboard. Tab stays inside the open dialog instead of wandering onto the buttons behind it, and Escape closes most of them.',
            'Escape always means "cancel" — it will never confirm something for you. The Switch Sides notice and the Set Break timer ignore Escape entirely, since their button is the only way forward.',
            'The What\'s New and Match History panels no longer hide their own Close button on a phone held sideways.',
            'Screen readers now announce each pop-up and its title when it opens.'
        ]
    },
    {
        version: 'v4.23',
        date: 'Aug 10, 2026',
        changes: [
            'The app is now called SpikeSheet. Same app, same address — only the name on the door changed.',
            'Nothing else moved: a match in progress, your saved history, team colours, and settings all carry over untouched.'
        ]
    },
    {
        version: 'v4.22',
        date: 'Aug 7, 2026',
        changes: [
            'Added this "What’s new" panel, so you can see what has changed without leaving the app. It lives on the home screen only — the app bar stays out of the way once a match is underway.',
            'Sharing a link to the app now shows a proper title, description, and icon instead of bare text.'
        ]
    },
    {
        version: 'v4.21',
        date: 'Aug 6, 2026',
        changes: [
            'Substitutions now follow the official rulebook: a starter and their substitute are locked to each other for the rest of the set, so a player can no longer be walked around the court by subbing out and back in somewhere else.',
            'New "Substitutions per team per set" match rule in Settings. Leave it blank for unlimited (the default), or set a number — 6 is standard for indoor volleyball. The substitution screen shows how many you have used.',
            'The result screen now shows how long each set took.',
            'Fixed a couple of substitution edge cases involving the libero that could lock the wrong player out of a set.'
        ]
    },
    {
        version: 'v4.20',
        date: 'Aug 5, 2026',
        changes: [
            'Redesigned the match result screen: a big scoreline, a set-by-set box score, and highlight cards for longest run, biggest comeback, lead changes, and more.',
            'Set charts now mark exactly where the longest scoring run happened, and swipe like a carousel on phones instead of shrinking to fit.'
        ]
    },
    {
        version: 'v4.12',
        date: 'Aug 5, 2026',
        changes: [
            'Added a "Match Settings" button on the setup screen and a "Return to Setup" button during rotation setup.',
            'Switching the serving team mid-set now asks for confirmation, to prevent accidental taps.',
            'Smoothed out the timeout countdown so the numbers no longer jitter.'
        ]
    }
];

// ── Feedback (Web3Forms) ──────────────────────────────────────────────────
const WEB3FORMS_ACCESS_KEY = '24f54e6d-d6a5-4b1e-82bf-7952024d7886'; // TODO(owner): paste key from web3forms.com
const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit';

const ANALYTICS_DISABLED = (() => {
    try {
        const h = location.hostname;
        return location.protocol === 'file:' || h === 'localhost' || h === '127.0.0.1' || h === '::1';
    } catch (_) { return false; }
})();

function track(name, params) {
    if (ANALYTICS_DISABLED) return;
    try {
        if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
            window.gtag('event', name, Object.assign({ app_version: APP_VERSION }, params || {}));
        }
    } catch (_) {}
}

// ── Virtual page views (v4.21) ────────────────────────────────────────────────────────
// The app never navigates, so GA4 records exactly ONE page_view per session and attributes
// every second of engagement to it. That makes "which screen gets the most traffic" and
// "which screen holds attention" unanswerable. Sending a virtual page_view whenever a screen
// becomes visible drives GA4's built-in Pages-and-screens report — views AND average
// engagement time per screen — with no timer code of our own, because GA4 attributes its
// automatic engagement measurement to the most recent page_view.
//
// Deliberately ADDITIVE: every call below is a tail call at a screen's entry point, and no
// existing line changes. Routing the ~12 scattered `hidden` toggles through a central
// showScreen() helper would yield identical analytics while refactoring match-flow code on a
// scoresheet that must not break mid-match. If that refactor is ever wanted it belongs in its
// own reviewed change, not smuggled in under analytics.
const SCREEN_TITLES = {
    setup: 'Setup',
    rotationSetup: 'Rotation Setup',
    scoreboard: 'Scoreboard',
    matchResult: 'Match Result'
};
const SCREEN_IDS = ['setup', 'rotationSetup', 'scoreboard', 'matchResult'];
let _currentScreen = null;

// A real path per screen, NOT a '#fragment'. GA4 strips everything after '#' when deriving the
// page-path dimension, so a hash-based location collapses all four screens onto a single row in
// every path-keyed report and landing-page report. Nothing is ever written to location.hash —
// this string is reported to GA4 only, so the URL bar and back button are untouched.
function screenUrl(name) {
    const base = location.pathname.replace(/index\.html$/, '');
    return location.origin + (base.endsWith('/') ? base : base + '/') + name;
}

// The changelog button lives in the app bar but only makes sense on the homepage — mid-match
// it would just be one more thing competing for a referee's attention. trackScreen() already
// fires at every screen's entry point (see below), so it is the single hook that keeps this
// correct on first load, after "Play Again", after "Return to Setup", and after a reload that
// restores straight into rotation setup / the scoreboard / the result screen.
function updateAppBarForScreen(name) {
    const btn = document.getElementById('changelogBtn');
    if (btn) btn.style.display = name === 'setup' ? '' : 'none';
}

function trackScreen(name) {
    // Dedupe. Several flows hide and re-show the SAME screen — showSetBreakModal() /
    // closeSetBreakModal() do it to the scoreboard every set break — and each of those would
    // otherwise land as a fresh page_view, inflating views and chopping engagement time into
    // meaningless slices.
    if (name === _currentScreen) return;
    _currentScreen = name;
    updateAppBarForScreen(name);

    const page_title = SCREEN_TITLES[name] || name;
    const page_location = screenUrl(name);

    // gtag('set', ...) BEFORE the event, deliberately. Event-scoped params apply only to their
    // own event, so without this GA4's automatic user_engagement hits — the ones that actually
    // carry engagement_time_msec — would keep reporting the bare landing URL, and per-screen
    // dwell time (the entire point of this change) would pool onto one row. `set` params are
    // inherited by every subsequent hit, which is what makes the attribution follow the screen.
    if (!ANALYTICS_DISABLED) {
        try {
            if (typeof window.gtag === 'function') window.gtag('set', { page_title, page_location });
        } catch (_) {}
    }

    track('page_view', { page_title, page_location });
}

// For paths with no single named entry point — notably every restoreSavedMatch() branch —
// report whichever screen actually ended up visible.
function trackVisibleScreen() {
    const visible = SCREEN_IDS.find(id => {
        const el = document.getElementById(id);
        return el && !el.classList.contains('hidden');
    });
    if (visible) trackScreen(visible);
}

window.addEventListener('error', e => {
    track('js_error', {
        message: String(e.message || '').slice(0, 200),
        source: String(e.filename || '').slice(0, 100).replace(/^.*\//, ''),
        line: e.lineno || 0
    });
});
window.addEventListener('unhandledrejection', e => {
    const r = e && e.reason;
    track('js_promise_rejection', {
        reason: String((r && (r.message || r)) || '').slice(0, 200)
    });
});

// ── SoundFX ───────────────────────────────────────────────────────────────
// Synthesized referee pea-whistle: square-wave carrier ~2300 Hz + 38 Hz
// sine LFO modulating frequency ±220 Hz. No audio files — no APP_SHELL change.
const SoundFX = (() => {
    let ctx = null;
    function unlock() {
        try {
            ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
            if (ctx.state === 'suspended') ctx.resume();
        } catch (_) {}
    }
    function blast(t0, dur) {
        const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = 2300;
        const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 38;
        const lfoGain = ctx.createGain(); lfoGain.gain.value = 220;
        lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.25, t0 + 0.015);
        g.gain.setValueAtTime(0.25, Math.max(t0 + 0.015, t0 + dur - 0.05));
        g.gain.linearRampToValueAtTime(0, t0 + dur);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t0); lfo.start(t0);
        osc.stop(t0 + dur + 0.05); lfo.stop(t0 + dur + 0.05);
    }
    const PATTERNS = {
        timeoutEnd: [[0, 0.35]],
        techTimeout: [[0, 0.35]],
        setEnd:     [[0, 0.3], [0.45, 0.45]],
        matchEnd:   [[0, 0.25], [0.35, 0.25], [0.7, 0.9]]
    };
    function play(name) {
        if (!settings.sound) return;
        unlock();
        if (!ctx || ctx.state !== 'running') return; // load-bearing on iOS — never throws
        const t = ctx.currentTime + 0.02;
        (PATTERNS[name] || []).forEach(([off, dur]) => blast(t + off, dur));
    }
    return { unlock, play };
})();

// ── Wake Lock ─────────────────────────────────────────────────────────────
let _wakeLock = null;
let _wakeLockPending = false;
async function acquireWakeLock() {
    if (!settings.keepAwake || !('wakeLock' in navigator)) return;
    if (_wakeLock || _wakeLockPending) return;
    _wakeLockPending = true;
    try {
        _wakeLock = await navigator.wakeLock.request('screen');
        _wakeLock.addEventListener('release', () => { _wakeLock = null; });
    } catch (_) {
        _wakeLock = null;
    } finally {
        _wakeLockPending = false;
    }
}
function releaseWakeLock() {
    try { if (_wakeLock) _wakeLock.release(); } catch (_) {}
    _wakeLock = null;
}
function matchIsLive() { return state.matchStarted && !state.matchOver; }

function getDisplayMode() {
    try {
        if (window.matchMedia('(display-mode: standalone)').matches) return 'standalone';
        if (window.matchMedia('(display-mode: minimal-ui)').matches) return 'minimal-ui';
        if (window.matchMedia('(display-mode: fullscreen)').matches) return 'fullscreen';
        if (window.navigator.standalone) return 'standalone-ios';
    } catch (_) {}
    return 'browser';
}

let _vitalsReported = false;
let _cls = 0;
let _inp = 0;
function reportWebVitals() {
    if (_vitalsReported) return;
    _vitalsReported = true;
    track('web_vital', { metric: 'CLS', value: Math.round(_cls * 1000) });
    if (_inp > 0) track('web_vital', { metric: 'INP', value: Math.round(_inp) });
}
function initWebVitals() {
    if (typeof PerformanceObserver === 'undefined') return;
    try {
        new PerformanceObserver(list => {
            const entries = list.getEntries();
            const lcp = entries[entries.length - 1];
            if (lcp) track('web_vital', { metric: 'LCP', value: Math.round(lcp.startTime) });
        }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (_) {}
    try {
        new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
                if (!entry.hadRecentInput) _cls += entry.value;
            }
        }).observe({ type: 'layout-shift', buffered: true });
    } catch (_) {}
    try {
        new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
                if (entry.interactionId && entry.duration > _inp) _inp = entry.duration;
            }
        }).observe({ type: 'event', buffered: true, durationThreshold: 40 });
    } catch (_) {}
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') reportWebVitals();
    });
    window.addEventListener('pagehide', reportWebVitals);
}

function loadSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) { settings = { ...DEFAULT_SETTINGS }; return; }
        const parsed = JSON.parse(raw);
        const next = { ...DEFAULT_SETTINGS };
        for (const key of Object.keys(DEFAULT_SETTINGS)) {
            if (!(key in parsed)) continue; // missing → keep default
            if (typeof DEFAULT_SETTINGS[key] === 'boolean') {
                next[key] = !!parsed[key];
            } else {
                const n = parseInt(parsed[key], 10);
                if (Number.isNaN(n)) continue; // invalid → keep default
                const range = SETTINGS_RANGES[key];
                next[key] = range ? Math.min(range[1], Math.max(range[0], n)) : n;
            }
        }
        settings = next;
    } catch (_) { settings = { ...DEFAULT_SETTINGS }; }
}

function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
}

// Pick the rule keys from current settings into a fresh, match-frozen object.
function snapshotRules() {
    const out = {};
    for (const key of RULE_KEYS) out[key] = settings[key];
    return out;
}

// Active rules for the in-progress match; defensive fallback if state.rules
// was never snapshotted (e.g. legacy state restored without migration).
function getRules() {
    return state.rules || snapshotRules();
}

// ── Settings modal ───────────────────────────────────────────────────────
function openSettingsModal() {
    syncSettingsInputs();
    const note = document.getElementById('settingsRuleNote');
    note.classList.toggle('hidden', !(state.matchStarted && !state.matchOver));
    document.getElementById('settingsModal').classList.remove('hidden');
    track('settings_open');
}

function closeSettingsModal() {
    document.getElementById('settingsModal').classList.add('hidden');
}

// ── Feedback modal ───────────────────────────────────────────────────────
function openFeedbackModal() {
    document.getElementById('feedbackModal').classList.remove('hidden');
    track('feedback_open');
    const statusEl = document.getElementById('feedbackStatus');
    if (statusEl) { statusEl.className = 'feedback-status hidden'; statusEl.textContent = ''; }
    updateFeedbackOnlineState();
}

function closeFeedbackModal() {
    document.getElementById('feedbackModal').classList.add('hidden');
    // Intentionally keep form contents on cancel per spec.
}

function updateFeedbackOnlineState() {
    const submitBtn = document.getElementById('submitFeedback');
    const statusEl = document.getElementById('feedbackStatus');
    if (!submitBtn || !statusEl) return;

    if (!navigator.onLine) {
        submitBtn.disabled = true;
        statusEl.textContent = "You're offline — connect to the internet to send feedback.";
        statusEl.className = 'feedback-status'; // info styling (no error/success modifier)
        statusEl.classList.remove('hidden');
    } else {
        submitBtn.disabled = false;
        // Only hide the status if it was showing the offline notice.
        // Don't clobber a success/error result that's currently visible.
        if (statusEl.textContent === "You're offline — connect to the internet to send feedback.") {
            statusEl.classList.add('hidden');
            statusEl.textContent = '';
        }
    }
}

async function submitFeedback(e) {
    e.preventDefault();

    const form = document.getElementById('feedbackForm');
    const messageInput = document.getElementById('feedbackMessage');
    const emailInput = document.getElementById('feedbackEmail');
    const botcheck = document.getElementById('feedbackBotcheck');
    const statusEl = document.getElementById('feedbackStatus');
    const submitBtn = document.getElementById('submitFeedback');

    const message = messageInput.value.trim();
    const email = emailInput.value.trim();
    const category = (form.querySelector('input[name="feedbackCategory"]:checked') || {}).value || 'other';

    // Clear previous status
    statusEl.className = 'feedback-status hidden';
    statusEl.textContent = '';

    // Validate message
    if (!message) {
        statusEl.textContent = 'Please enter a message before sending.';
        statusEl.className = 'feedback-status error';
        statusEl.classList.remove('hidden');
        messageInput.focus();
        return;
    }

    // Validate email if provided
    if (email && !emailInput.checkValidity()) {
        statusEl.textContent = 'Please enter a valid email address, or leave it blank.';
        statusEl.className = 'feedback-status error';
        statusEl.classList.remove('hidden');
        emailInput.focus();
        return;
    }

    // Honeypot check: bot filled the hidden checkbox — fake success, no network call
    if (botcheck.checked) {
        statusEl.textContent = 'Thanks — feedback sent!';
        statusEl.className = 'feedback-status success';
        statusEl.classList.remove('hidden');
        messageInput.value = '';
        setTimeout(() => closeFeedbackModal(), 1500);
        return;
    }

    // Submit to Web3Forms
    submitBtn.disabled = true;
    statusEl.textContent = 'Sending…';
    statusEl.className = 'feedback-status';
    statusEl.classList.remove('hidden');

    try {
        const res = await fetch(WEB3FORMS_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
                access_key: WEB3FORMS_ACCESS_KEY,
                subject: `[SpikeSheet] ${category} feedback`,
                from_name: 'SpikeSheet PWA',
                category,
                message,
                email: email || undefined,
                botcheck: false,
                app_version: APP_VERSION,
                display_mode: getDisplayMode(),
                user_agent: navigator.userAgent.slice(0, 200)
            })
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok && data.success) {
            track('feedback_submit', { category, has_email: !!email });
            statusEl.textContent = 'Thanks — feedback sent!';
            statusEl.className = 'feedback-status success';
            statusEl.classList.remove('hidden');
            messageInput.value = ''; // clear message; keep email
            submitBtn.disabled = false;
            setTimeout(() => closeFeedbackModal(), 1500);
        } else {
            track('feedback_error', { reason: `http_${res.status}` });
            statusEl.textContent = "Couldn’t send — please try again.";
            statusEl.className = 'feedback-status error';
            statusEl.classList.remove('hidden');
            submitBtn.disabled = false;
        }
    } catch (_) {
        track('feedback_error', { reason: 'network' });
        statusEl.textContent = "Couldn’t send — please try again.";
        statusEl.className = 'feedback-status error';
        statusEl.classList.remove('hidden');
        submitBtn.disabled = false;
    }
}

function syncSettingsInputs() {
    document.querySelectorAll('#settingsModal [data-setting]').forEach(input => {
        const key = input.dataset.setting;
        if (input.type === 'checkbox') {
            input.checked = !!settings[key];
        } else {
            // `?? ''` explicitly: substitutionsPerSet is the first setting that can be null,
            // and an empty field is what "unlimited" looks like. Don't rely on the DOM's
            // null-to-empty coercion — it renders undefined as the string "undefined".
            input.value = settings[key] ?? '';
        }
    });

    // Disable keepAwake toggle on browsers that don't support the Screen Wake Lock API
    const keepAwakeInput = document.getElementById('setKeepAwake');
    if (keepAwakeInput) {
        const supported = 'wakeLock' in navigator;
        keepAwakeInput.disabled = !supported;
        let hint = document.getElementById('keepAwakeUnsupportedHint');
        if (!supported) {
            if (!hint) {
                hint = document.createElement('span');
                hint.id = 'keepAwakeUnsupportedHint';
                hint.className = 'settings-hint';
                hint.textContent = 'Not supported in this browser';
                keepAwakeInput.insertAdjacentElement('afterend', hint);
            }
            hint.classList.remove('hidden');
        } else if (hint) {
            hint.classList.add('hidden');
        }
    }
}

function onSettingChange(input) {
    const key = input.dataset.setting;
    if (input.type === 'checkbox') {
        settings[key] = !!input.checked;
        if (key === 'keepAwake') {
            if (settings.keepAwake && state.matchStarted && !state.matchOver) {
                acquireWakeLock();
            } else if (!settings.keepAwake) {
                releaseWakeLock();
            }
        }
    } else {
        const raw = String(input.value).trim();
        if (raw === '' && NULLABLE_SETTINGS.has(key)) {
            // Clearing the field is a real choice ("unlimited"), not invalid input.
            settings[key] = null;
            input.value = '';
        } else {
            const n = parseInt(raw, 10);
            const range = SETTINGS_RANGES[key];
            if (Number.isNaN(n)) {
                input.value = settings[key] ?? ''; // invalid → revert (null renders as empty)
                return;
            }
            const clamped = range ? Math.min(range[1], Math.max(range[0], n)) : n;
            settings[key] = clamped;
            input.value = clamped; // reflect clamping back to the field
        }
    }
    saveSettings();
    track('settings_changed', { setting: key, value: String(settings[key]) });
}

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
    if (fromVersion === 2) {
        const st = saved.state || {};
        // Hardcoded v2-era values — do NOT use DEFAULT_SETTINGS here; a v2 match
        // was definitionally played under the old fixed constants.
        st.rules = {
            timeoutDuration: 30, timeoutsPerSet: 2, technicalTimeouts: false,
            setBreakDuration: 180, regularSetPoints: 25, finalSetPoints: 15
        };
        st.techTimeoutsFired = [];
        return { _schema: 3, state: st, rotationSetup: saved.rotationSetup || null };
    }
    if (fromVersion === 3) {
        // v4.21 — Tasks 1, 9 and 10 all add persisted state; one bump covers all three.
        const st = saved.state || {};
        st.team1SubPairs = [];
        st.team2SubPairs = [];
        st.currentSetStartedAt = null;   // v3 never recorded it; the set's duration stays hidden
        // A v3 match was definitionally played with no substitution limit — same reasoning as
        // the hardcoded v2-era constants above. getRules() reads `== null` so an absent key
        // would also fail open, but seed it explicitly so the snapshot states its own rules.
        if (st.rules) st.rules.substitutionsPerSet = null;
        // Undo snapshots are hand-maintained field lists; seed the new fields in the ones
        // already on the stack or an undo into a v3 point would restore `undefined`.
        (Array.isArray(st.pointHistory) ? st.pointHistory : []).forEach(snap => {
            snap.team1SubPairs = [];
            snap.team2SubPairs = [];
            snap.currentSetStartedAt = null;
        });
        return { _schema: 4, state: st, rotationSetup: saved.rotationSetup || null };
    }
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
        // endMatch() shows #matchResult and hides #scoreboard, but NOT #setup — which carries
        // no `hidden` class in the markup and is therefore the default-visible screen. Every
        // sibling branch below hides it explicitly; this one did not, so reloading on the
        // result screen rendered the entire setup form ABOVE the result and read as a reset.
        document.getElementById('setup').classList.add('hidden');
        document.getElementById('rotationSetup').classList.add('hidden');
        endMatch({ fromRestore: true });
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
            && isDeciderSet()
            && (state.team1Score >= deciderSwitchPoint() || state.team2Score >= deciderSwitchPoint())) {
        showDeciderSwitchModal();
    }

    if (matchIsLive()) acquireWakeLock();

    return true;
}

function init() {
    loadSettings();
    track('launch', { display_mode: getDisplayMode(), online: navigator.onLine });
    initWebVitals();
    window.addEventListener('appinstalled', () => track('pwa_installed'));

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
            track('color_swatch_used', { team: parseInt(team), color });
        });
    });

    document.getElementById('startMatch').addEventListener('click', startMatch);
    document.getElementById('shareResult').addEventListener('click', shareResult);
    document.getElementById('playAgain').addEventListener('click', resetToSetup);
    document.getElementById('undoPoint').addEventListener('click', undoLastPoint);
    document.getElementById('historyBtn').addEventListener('click', () => { track('history_open'); showHistoryModal(); });
    document.getElementById('closeHistory').addEventListener('click', closeHistoryModal);
    document.getElementById('historyModal').addEventListener('click', e => {
        if (e.target === document.getElementById('historyModal')) closeHistoryModal();
    });
    updateHistoryButton();

    // Changelog modal
    document.getElementById('changelogBtn').addEventListener('click', openChangelogModal);
    document.getElementById('closeChangelog').addEventListener('click', closeChangelogModal);
    document.getElementById('changelogModal').addEventListener('click', e => {
        if (e.target === document.getElementById('changelogModal')) closeChangelogModal();
    });

    // Feedback modal
    document.getElementById('feedbackBtn').addEventListener('click', openFeedbackModal);
    document.getElementById('cancelFeedback').addEventListener('click', closeFeedbackModal);
    document.getElementById('feedbackModal').addEventListener('click', e => {
        if (e.target === document.getElementById('feedbackModal')) closeFeedbackModal();
    });
    document.getElementById('feedbackForm').addEventListener('submit', submitFeedback);
    window.addEventListener('online', updateFeedbackOnlineState);
    window.addEventListener('offline', updateFeedbackOnlineState);

    // Settings modal
    document.getElementById('settingsBtn').addEventListener('click', openSettingsModal);
    document.getElementById('closeSettings').addEventListener('click', closeSettingsModal);
    document.getElementById('settingsModal').addEventListener('click', e => {
        if (e.target === document.getElementById('settingsModal')) closeSettingsModal();
    });
    document.getElementById('resetSettings').addEventListener('click', () => {
        settings = { ...DEFAULT_SETTINGS };
        saveSettings();
        syncSettingsInputs();
        if (settings.keepAwake && matchIsLive()) acquireWakeLock();
        track('settings_reset');
    });
    document.querySelectorAll('#settingsModal [data-setting]').forEach(input => {
        input.addEventListener('change', () => onSettingChange(input));
    });

    document.querySelectorAll('.btn-score').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const team = parseInt(e.target.dataset.team);
            addPoint(team);
        });
    });

    document.getElementById('serveIndicator').addEventListener('click', toggleService);
    document.getElementById('serveIndicator').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleService();
        }
    });
    document.getElementById('swapTeams').addEventListener('click', () => { track('swap_teams_manual', { set: state.currentSet }); swapTeams(); });

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
    document.getElementById('cancelServeSwitch').addEventListener('click', closeServeSwitchModal);
    document.getElementById('confirmServeSwitch').addEventListener('click', confirmServeSwitch);
    document.getElementById('returnToSetupFromRotation').addEventListener('click', returnToSetupFromRotation);
    document.getElementById('openSettingsFromSetup').addEventListener('click', openSettingsModal);

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
            track('use_prev_rotation', { team, set: state.currentSet });
        });
    });

    // SoundFX: unlock AudioContext on first gesture (required by browser autoplay policy)
    ['pointerdown', 'keydown'].forEach(evt =>
        document.addEventListener(evt, () => SoundFX.unlock(), { once: true, passive: true }));

    // Wake Lock: re-acquire when tab becomes visible mid-match (OS may have released it)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && matchIsLive()) acquireWakeLock();
    });

    // Modal accessibility: focus trap + Escape + invoker-restore (Batch E / Task 4). Must be
    // registered BEFORE restoreSavedMatch() below — that call can itself open
    // #deciderSwitchModal (a reload landing mid-decider-set, past the side-switch score) with no
    // preceding user gesture, and the MutationObserver has to already be attached to catch it.
    document.addEventListener('pointerdown', stashModalInvoker, true);
    document.addEventListener('keydown', stashModalInvoker, true);
    document.addEventListener('keydown', handleModalKeydown, true);
    MODAL_IDS.forEach(id => observeModalVisibility(document.getElementById(id)));

    restoreSavedMatch();

    // Catch-all AFTER restore: covers the default landing on #setup and every restoreSavedMatch()
    // branch that routes to a screen without a named entry point. Branches that do have one
    // (endMatch, showRotationSetup, showNewSetRotationSetup) have already reported, and the
    // trackScreen dedupe swallows this call for them.
    trackVisibleScreen();
}

function toggleService() {
    if (state.currentSetPoints.length === 0) {
        // Free switch: no points played yet in this set, so there is nothing to confirm.
        performServiceSwitch();
    } else {
        openServeSwitchModal();
    }
}

function performServiceSwitch() {
    state.serving = state.serving === 1 ? 2 : 1;
    if (state.currentSetPoints.length === 0) {
        state.firstServer = state.serving;
    }
    // Libero cannot serve: if serve is manually switched onto a team that has its
    // libero at position 1 (legal while receiving), evict it so the original player
    // is the server — mirrors the automatic eviction that rotateTeam does on a side-out.
    checkLiberoAtServer(state.serving);
    updateDisplay();
}

function openServeSwitchModal() {
    document.getElementById('serveSwitchModal').classList.remove('hidden');
}

function closeServeSwitchModal() {
    document.getElementById('serveSwitchModal').classList.add('hidden');
}

function confirmServeSwitch() {
    performServiceSwitch();
    closeServeSwitchModal();
}

function rotateTeam(team) {
    const rotation = team === 1 ? state.team1Rotation : state.team2Rotation;
    const subs = team === 1 ? state.team1Subs : state.team2Subs;

    if (rotation.length === 6) {
        const first = rotation.shift();
        rotation.push(first);

        const newSubs = {};
        Object.entries(subs).forEach(([idx, sub]) => {
            const newIdx = (parseInt(idx) + 5) % 6;
            newSubs[newIdx] = sub;
        });

        if (team === 1) {
            state.team1Subs = newSubs;
            if (state.team1LiberoIn !== null) {
                state.team1LiberoIn = (state.team1LiberoIn + 5) % 6;
            }
        } else {
            state.team2Subs = newSubs;
            if (state.team2LiberoIn !== null) {
                state.team2LiberoIn = (state.team2LiberoIn + 5) % 6;
            }
        }

        checkLiberoFrontRow(team);
        checkLiberoAtServer(team);
    }
}

function useTimeout(team) {
    if (team === 1 && state.team1Timeouts > 0) {
        state.team1Timeouts--;
        track('timeout_used', { team: 1, set: state.currentSet });
        showTimeoutModal({ title: `${state.team1Name} Timeout`, durationSec: getRules().timeoutDuration });
    } else if (team === 2 && state.team2Timeouts > 0) {
        state.team2Timeouts--;
        track('timeout_used', { team: 2, set: state.currentSet });
        showTimeoutModal({ title: `${state.team2Name} Timeout`, durationSec: getRules().timeoutDuration });
    }
    updateDisplay();
}

function showTimeoutModal({ title, durationSec }) {
    const modal = document.getElementById('timeoutModal');
    const timerText = document.getElementById('timerText');
    const timerProgress = document.getElementById('timerProgress');
    const teamNameDisplay = document.getElementById('timeoutTeamName');

    teamNameDisplay.textContent = title;
    modal.classList.remove('hidden');

    const timeoutDurationMs = durationSec * 1000;
    const startTime = performance.now();
    timerProgress.style.strokeDashoffset = 0;
    timeoutPrevSeconds = -1;

    const updateInterval = 10;

    timeoutInterval = setInterval(() => {
        const timeLeft = Math.max(0, timeoutDurationMs - (performance.now() - startTime));

        const seconds = Math.ceil(timeLeft / 1000);
        if (seconds !== timeoutPrevSeconds) {
            timerText.textContent = `${seconds}`;
            timeoutPrevSeconds = seconds;
        }

        const offset = TIMER_CIRCLE_CIRCUMFERENCE * (1 - timeLeft / timeoutDurationMs);
        timerProgress.style.strokeDashoffset = offset;

        if (timeLeft <= 0) {
            timerText.textContent = '0';
            clearInterval(timeoutInterval);
            timeoutInterval = null;
            SoundFX.play('timeoutEnd');
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

    const setBreakDurationMs = getRules().setBreakDuration * 1000;
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
            SoundFX.play('timeoutEnd');
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

// ── Substitution rules (FIVB 15.6.1 / 15.6.2 / 15.6.3) — v4.21 ────────────────────────
// 15.6.2  A starter may leave the game only once per set and re-enter only once per set,
//         and only into their previous position in the line-up.
// 15.6.3  A substitute may enter only once per set in place of a starter, and may only be
//         replaced by that same starter.
// Together these lock a starter and their substitute into a pair for the rest of the set,
// which is exactly what state.team{1,2}SubPairs records. Enforcement is by PAIR IDENTITY,
// not court position: rotateTeam() moves position indices under us every side-out.
//
// The libero is governed by FIVB 19, not 15.6 — a libero replacement is NOT a substitution.
// It never reaches any function below, never creates a pair, and never counts against the cap.

function subPairs(team) {
    const key = team === 1 ? 'team1SubPairs' : 'team2SubPairs';
    if (!Array.isArray(state[key])) state[key] = []; // self-heal legacy/partial restores
    return state[key];
}

// Court ENTRIES used this set — FIVB 15.6.1 counts entries onto the court, not pairs, so a
// starter going out and coming back consumes two of the allowance. Derived, never stored:
// one structure, two readers (the pair lock above and the cap below).
function subEntriesUsed(team) {
    const pairs = subPairs(team);
    return pairs.length + pairs.filter(p => p.returned).length;
}

// Why the cap forbids another entry, or null if it doesn't. `== null` (loose) so a legacy
// rules snapshot with the key absent reads as unlimited rather than throwing — failing open
// matches the pre-v4.21 behaviour, which is the safe direction.
function subCapBlockReason(team) {
    const cap = getRules().substitutionsPerSet;
    if (cap == null) return null;
    if (subEntriesUsed(team) < cap) return null;
    return cap === 0
        ? 'No substitutions are permitted under this match’s rules.'
        : `Substitution limit reached — ${cap} per team per set (FIVB 15.6.1).`;
}

// Why this substitution is illegal, or null if it is legal. Player numbers are strings
// everywhere (setup parses them with .split(',').map(n => n.trim())) and dataset.player is a
// string too, but normalise anyway: a strict-equality mismatch here would fail OPEN silently.
function substitutionBlockReason(team, rotationIndex, newPlayer) {
    const rotation = team === 1 ? state.team1Rotation : state.team2Rotation;
    const pairs = subPairs(team);
    const current = String(rotation[rotationIndex]);
    const incoming = String(newPlayer);

    if (incoming === current) return null; // no-op, nothing to police

    // The slot may be held by the LIBERO, who is not a party to any substitution pair. Treating
    // that as an ordinary substitution would file a pair naming the libero as the starter — see
    // liberoSlotBlockReason() for why that is not a bookkeeping detail.
    const liberoSlot = liberoSlotBlockReason(team, rotationIndex, newPlayer);
    if (liberoSlot) return liberoSlot;

    const openForCurrent = pairs.find(p => p.sub === current && !p.returned);
    if (openForCurrent) {
        // The player on court came on as a substitute (FIVB 15.6.3): only the starter they
        // replaced may replace them.
        if (incoming !== openForCurrent.starter) {
            return `#${current} came on for #${openForCurrent.starter} and can only be replaced by #${openForCurrent.starter} (FIVB 15.6.3).`;
        }
        return subCapBlockReason(team); // legal pairing — only the cap can still stop it
    }

    // From here, `incoming` would be entering as a substitute for `current`.
    if (pairs.some(p => p.sub === incoming)) {
        return `#${incoming} has already been substituted on in this set and cannot enter again (FIVB 15.6.3).`;
    }
    const openForIncoming = pairs.find(p => p.starter === incoming && !p.returned);
    if (openForIncoming) {
        return `#${incoming} started this set and can only return in place of #${openForIncoming.sub} (FIVB 15.6.2).`;
    }
    if (pairs.some(p => p.starter === incoming)) {
        // Left and returned already, so no entries remain. Not reachable while they are on
        // court (and they would be), but fail closed rather than trust the caller.
        return `#${incoming} has already used their re-entry in this set (FIVB 15.6.2).`;
    }
    if (pairs.some(p => p.starter === current)) {
        return `#${current} has already been substituted once in this set and cannot leave again (FIVB 15.6.2).`;
    }
    return subCapBlockReason(team);
}

// Writes the pair record for a substitution already cleared by substitutionBlockReason().
function recordSubstitution(team, rotationIndex, newPlayer) {
    const rotation = team === 1 ? state.team1Rotation : state.team2Rotation;
    const pairs = subPairs(team);
    const current = String(rotation[rotationIndex]);
    const incoming = String(newPlayer);

    const openForCurrent = pairs.find(p => p.sub === current && !p.returned);
    if (openForCurrent && incoming === openForCurrent.starter) {
        openForCurrent.returned = true; // starter re-enters: the pair's second entry
    } else {
        pairs.push({ starter: current, sub: incoming, returned: false });
    }
}

// True when selecting `newPlayer` at this slot is the LIBERO leaving the court (the original
// player returning), not a substitution. This flows through makeSubstitution() with
// isLibero === false — the "Return original player" chip carries no data-is-libero — so it
// must be recognised here or a libero replacement would be counted and rule-checked.
function isLiberoReturn(team, rotationIndex, newPlayer) {
    const rotation = team === 1 ? state.team1Rotation : state.team2Rotation;
    const subs = team === 1 ? state.team1Subs : state.team2Subs;
    const libero = team === 1 ? state.team1Libero : state.team2Libero;
    if (!libero || String(rotation[rotationIndex]) !== String(libero)) return false;
    return !!subs[rotationIndex] && String(subs[rotationIndex].original) === String(newPlayer);
}

// A slot the LIBERO is currently covering cannot be substituted into in one step. Under FIVB 19
// the libero replacement is undone first (the covered player returns), and only then is a
// substitution possible — so the app must not offer the shortcut.
//
// This is a rule gate, not bookkeeping. Allowing it filed a pair of {starter: <libero>, sub: B},
// because recordSubstitution() reads the slot's current occupant as the starter. That pair then
// matched FIVB 15.6.3 against the covered player forever after: they could never come back on,
// and the refusal quoted the LIBERO's number at the scorer. It also burned a cap entry.
function liberoSlotBlockReason(team, rotationIndex, newPlayer) {
    const rotation = team === 1 ? state.team1Rotation : state.team2Rotation;
    const subs = team === 1 ? state.team1Subs : state.team2Subs;
    const libero = team === 1 ? state.team1Libero : state.team2Libero;

    if (!libero || String(rotation[rotationIndex]) !== String(libero)) return null;
    if (isLiberoReturn(team, rotationIndex, newPlayer)) return null; // the libero going back off

    const covered = subs[rotationIndex] && subs[rotationIndex].original;
    return covered
        ? `The libero is covering #${covered} here — bring #${covered} back on first, then substitute.`
        : 'The libero is on court here — take the libero off first, then substitute.';
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

    // v4.21: the first pair-lock reason among the chips we grey out, surfaced on screen below.
    // `title=` tooltips never fire on touch and this app is used on a phone at the scorer's
    // table, so a tooltip alone IS a silent failure. Cap reasons are excluded — the allowance
    // line already states those.
    let lockReason = null;
    const capReasonText = subCapBlockReason(team);
    const noteLockReason = reason => {
        if (reason && !lockReason && reason !== capReasonText) lockReason = reason;
    };

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
        // A libero going back off is not a substitution, so it is never rule- or cap-checked.
        // A starter returning IS an entry (FIVB 15.6.1) and can be blocked by the cap.
        const reason = isLiberoReturn(team, rotationIndex, original)
            ? null
            : substitutionBlockReason(team, rotationIndex, original);
        if (reason) {
            noteLockReason(reason);
            fragment.appendChild(makeSubEl(original, ['return-player', 'disabled'], { title: reason }));
        } else {
            fragment.appendChild(makeSubEl(original, ['return-player'], { title: 'Return original player' }));
        }
    }

    if (libero && !playersOnCourt.includes(libero)) {
        const teamIsServing = state.serving === team;
        if (isBackRow && !(position === 1 && teamIsServing)) {
            // Back-row spot the libero may occupy. Position 1 is allowed while receiving;
            // only barred when this team is serving (the libero cannot serve, FIVB 19.3.2.5).
            fragment.appendChild(makeSubEl(libero, ['libero'], { 'data-is-libero': 'true', title: 'Libero' }));
        } else if (position === 1) {
            fragment.appendChild(makeSubEl(libero, ['libero', 'disabled'], { title: 'Libero cannot serve (FIVB rule 19.3.2.5)' }));
        } else {
            fragment.appendChild(makeSubEl(libero, ['libero', 'disabled'], { title: 'Libero can only sub in back row' }));
        }
    }

    // Every element below is a real substitution — the libero was already handled above and
    // is skipped on the first line, so none of the v4.21 rule/cap gating can touch it.
    availableSubs.forEach(player => {
        if (player === libero) return;
        if (subs[rotationIndex] && player === subs[rotationIndex].original) return;

        // v4.21: FIVB 15.6.2 / 15.6.3 pair lock + the per-set substitution cap.
        const reason = substitutionBlockReason(team, rotationIndex, player);
        if (reason) {
            noteLockReason(reason);
            fragment.appendChild(makeSubEl(player, ['disabled'], { title: reason }));
            return;
        }

        // Structural guard, not a rule: `player` can also be off court because the LIBERO is
        // covering their slot, which leaves a subs[] entry but creates no substitution pair.
        // Bringing them on elsewhere would duplicate them the moment the libero is evicted.
        const subEntry = Object.entries(subs).find(([idx, sub]) => sub.original === player);
        if (subEntry) {
            const [subIdx] = subEntry;
            if (parseInt(subIdx) !== rotationIndex) {
                const posReason = `#${player} is covered by the libero at position ${parseInt(subIdx) + 1} and can only return there.`;
                noteLockReason(posReason);
                fragment.appendChild(makeSubEl(player, ['disabled'], { title: posReason }));
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

    // v4.21 Task 10: show the allowance so a referee sees the limit before tapping, rather
    // than meeting a silently disabled chip. Hidden entirely when no cap is configured.
    const noteEl = document.getElementById('subRuleNote');
    if (noteEl) {
        const cap = getRules().substitutionsPerSet;
        const atLimit = cap != null && subEntriesUsed(team) >= cap;
        const lines = [];
        if (cap != null) {
            lines.push(`Substitutions: ${subEntriesUsed(team)} of ${cap} used${atLimit ? ' — limit reached' : ''}`);
        }
        if (lockReason) lines.push(lockReason);
        // escapeHtml per line: reasons interpolate jersey numbers, which are user-entered.
        noteEl.innerHTML = lines.map(escapeHtml).join('<br>');
        noteEl.classList.toggle('at-limit', atLimit);
        noteEl.classList.toggle('hidden', lines.length === 0);
    }

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

    // v4.21 Tasks 1 + 10 — defence in depth; showSubModal() already gates the UI.
    // Deliberately scoped to real substitutions: `isLibero` covers the libero coming ON, and
    // isLiberoReturn() covers the libero going back OFF (which arrives here with isLibero
    // false, via the "Return original player" chip). Neither is a substitution under FIVB 19,
    // so neither is rule-checked, recorded, or counted against the cap.
    if (!isLibero && !isLiberoReturn(team, rotationIndex, newPlayer)) {
        if (String(newPlayer) === String(currentPlayer)) return; // no-op
        const blocked = substitutionBlockReason(team, rotationIndex, newPlayer);
        if (blocked) {
            track('substitution_blocked', { team, set: state.currentSet });
            return;
        }
        // Structural guard mirroring showSubModal(): the incoming player is still recorded as
        // the original of a libero replacement elsewhere on court, so bringing them on here
        // would duplicate them when that libero is evicted.
        const occupied = Object.entries(subs).find(([idx, sub]) => String(sub.original) === String(newPlayer));
        if (occupied && parseInt(occupied[0]) !== rotationIndex) return;

        recordSubstitution(team, rotationIndex, newPlayer);
    }

    let subType;
    if (isLibero) {
        // FIVB rule 19.3.2.5: the libero cannot serve. Reject only when index 0 is
        // the live server (this team is serving). While receiving, position 1 is a
        // legal back-row spot — the side-out rotation will carry the libero off it
        // before this team ever serves. This is defence-in-depth; the UI gates it too.
        if (rotationIndex === 0 && state.serving === team) {
            return;
        }
        if (team === 1) {
            state.team1LiberoIn = rotationIndex;
        } else {
            state.team2LiberoIn = rotationIndex;
        }
        subs[rotationIndex] = { original: currentPlayer, liberoFor: currentPlayer };
        subType = 'libero';
    } else if (subs[rotationIndex] && subs[rotationIndex].original === newPlayer) {
        delete subs[rotationIndex];
        if (team === 1 && state.team1LiberoIn === rotationIndex) {
            state.team1LiberoIn = null;
        } else if (team === 2 && state.team2LiberoIn === rotationIndex) {
            state.team2LiberoIn = null;
        }
        subType = 'revert';
    } else {
        if (!subs[rotationIndex]) {
            subs[rotationIndex] = { original: currentPlayer };
        }
        subType = 'sub';
    }

    rotation[rotationIndex] = newPlayer;
    track('substitution', { team, type: subType, set: state.currentSet });
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
    closeServeSwitchModal();
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

// ── Changelog modal ──────────────────────────────────────────────────────
function renderChangelogModal() {
    const listEl = document.getElementById('changelogList');
    listEl.innerHTML = CHANGELOG_ENTRIES.map(entry => `
        <div class="changelog-entry">
            <div class="changelog-entry-header">
                <span class="changelog-version">${escapeHtml(entry.version)}</span>
                <span class="changelog-date">${escapeHtml(entry.date)}</span>
            </div>
            <ul class="changelog-changes">
                ${entry.changes.map(c => `<li>${escapeHtml(c)}</li>`).join('')}
            </ul>
        </div>`).join('');
}

function openChangelogModal() {
    renderChangelogModal();
    document.getElementById('changelogModal').classList.remove('hidden');
    track('changelog_open');
}

function closeChangelogModal() {
    document.getElementById('changelogModal').classList.add('hidden');
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

// FIVB rule 19.3.2.5: the libero cannot serve. Position 1 (array index 0) is the
// server, which is technically a back-row spot so checkLiberoFrontRow does not
// cover it. If a rotation brings the libero into index 0, force them out and
// restore the original player they replaced.
function checkLiberoAtServer(team) {
    const libero = team === 1 ? state.team1Libero : state.team2Libero;
    const rotation = team === 1 ? state.team1Rotation : state.team2Rotation;
    const subs = team === 1 ? state.team1Subs : state.team2Subs;
    const liberoIn = team === 1 ? state.team1LiberoIn : state.team2LiberoIn;

    if (!libero || liberoIn === null) return;

    if (rotation[0] === libero && subs[0]) {
        rotation[0] = subs[0].original;
        delete subs[0];
        if (team === 1) {
            state.team1LiberoIn = null;
        } else {
            state.team2LiberoIn = null;
        }
    }
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
    // v4.21: the pair log is team-specific (unlike techTimeoutsFired), so it must swap.
    [state.team1SubPairs, state.team2SubPairs] = [subPairs(2), subPairs(1)];
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
        // v4.21: team-specific, so it swaps with everything else. currentSetStartedAt is
        // deliberately absent — it is team-neutral and the `...snap` spread carries it over.
        team1SubPairs: snap.team2SubPairs,
        team2SubPairs: snap.team1SubPairs,
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
    if (!isDeciderSet()) return;
    const sw = deciderSwitchPoint();
    if (state.team1Score < sw && state.team2Score < sw) return;
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

function maybeTriggerTechnicalTimeout() {
    const rules = getRules();
    if (!rules.technicalTimeouts) return;
    if (state.matchOver || isDeciderSet()) return;
    const leadScore = Math.max(state.team1Score, state.team2Score);
    for (const threshold of TECH_TIMEOUT_THRESHOLDS) {
        if (threshold >= rules.regularSetPoints) continue;        // degenerate-config guard
        if (leadScore >= threshold && !state.techTimeoutsFired.includes(threshold)) {
            state.techTimeoutsFired.push(threshold);              // mark BEFORE showing (sticky)
            track('technical_timeout', { set: state.currentSet, threshold,
                t1_score: state.team1Score, t2_score: state.team2Score });
            vibrateDevice([250]);
            SoundFX.play('techTimeout');
            saveState();
            showTimeoutModal({ title: 'Technical Timeout', durationSec: TECH_TIMEOUT_DURATION });
            return;
        }
    }
}

function closeDeciderSwitchModal() {
    const modal = document.getElementById('deciderSwitchModal');
    if (modal.classList.contains('hidden')) return;
    state.deciderSideSwitched = true;
    modal.classList.add('hidden');
    track('decider_side_switch', {
        t1_score: state.team1Score,
        t2_score: state.team2Score
    });
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
    if (!settings.vibration) return;
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
        vibrateDevice([200, 100, 200]);
        contentEl.classList.remove('modal-shake');
        void contentEl.offsetWidth;
        contentEl.classList.add('modal-shake');
    }

    pulse();
    vibrateInterval = setInterval(pulse, 1500);
}

// ── Modal accessibility: focus trap, Escape, invoker-restore (Batch E / Task 4) ────────────
// One shared utility for all ten modals rather than ten copies. Built on a MutationObserver
// watching each modal's `class` attribute, NOT on edits inside the ten open/close functions —
// confirmReturnToSetup() hides #setBreakModal and #deciderSwitchModal by calling
// classList.add('hidden') DIRECTLY, bypassing their close functions on purpose (calling
// closeDeciderSwitchModal() there would trigger swapTeams()). A trap torn down inside close
// functions would leak on exactly that path; an observer on the class attribute catches every
// hide path for free and keeps this change additive rather than a refactor of match-flow code.

const MODAL_IDS = ['subModal', 'timeoutModal', 'setBreakModal', 'deciderSwitchModal',
    'returnToSetupModal', 'serveSwitchModal', 'historyModal', 'changelogModal',
    'settingsModal', 'feedbackModal'];

// Escape policy. Invokes the existing close FUNCTION, never the `hidden` class directly —
// #timeoutModal and #setBreakModal own live intervals and a repeating vibration, and bypassing
// their close functions would leave the device vibrating and the interval running silently.
//
// Two modals are deliberately absent below. Do not "complete" this table:
//   - #setBreakModal: closeSetBreakModal() branches into showNewSetRotationSetup(), a full
//     screen transition. Escape triggering screen navigation is a behaviour change, not an a11y
//     fix, and this modal opens with no user gesture (an automatic timer). #continueSetBreak
//     stays the only way through.
//   - #deciderSwitchModal: its only close function (closeDeciderSwitchModal) sets
//     state.deciderSideSwitched = true and calls swapTeams(). Wiring Escape to it would let a
//     stray keypress silently perform the court switch. It is confirm-only, with no cancel path.
// Escape must never reach a confirm action — #returnToSetupModal and #serveSwitchModal map to
// their CANCEL functions only, never confirmReturnToSetup() / confirmServeSwitch().
const MODAL_ESCAPE_CLOSERS = {
    subModal: closeSubModal,
    timeoutModal: closeTimeoutModal,
    returnToSetupModal: closeReturnToSetupModal,
    serveSwitchModal: closeServeSwitchModal,
    historyModal: closeHistoryModal,
    changelogModal: closeChangelogModal,
    settingsModal: closeSettingsModal,
    feedbackModal: closeFeedbackModal
};

// Elements a Tab press should be able to reach inside the currently-open modal.
// The `[tabindex]:not([tabindex="-1"])` clause below is NOT sufficient on its own to exclude
// negative-tabindex elements: the earlier type clauses match independently, so an <input> or
// <button> carrying tabindex="-1" is still selected by them. #feedbackBotcheck is exactly that —
// a spam honeypot (<input type="checkbox" tabindex="-1">) parked off-screen at left:-9999px with
// real 13x13 layout, so neither the selector nor the getClientRects() filter drops it. The
// explicit el.tabIndex < 0 filter in getModalFocusables() is what actually removes it, and the
// .modal-content container along with it. Do not drop that filter on the belief that this
// selector already covers it — verified in-browser 10-Aug-2026.
const MODAL_FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(', ');

// Recomputed on every Tab press (see trapModalTab) rather than cached at open time — #setKeepAwake
// (disabled when 'wakeLock' in navigator is false) and #submitFeedback (disabled while offline or
// mid-submit) toggle `disabled` while their modal is open, and a cached list would land focus on a
// now-disabled control.
function getModalFocusables(modalEl) {
    const nodes = Array.from(modalEl.querySelectorAll(MODAL_FOCUSABLE_SELECTOR))
        .filter(el => el.tabIndex >= 0 && el.getClientRects().length > 0);

    // Collapse each radio group (#feedbackModal's feedbackCategory) to ONE tab stop — the checked
    // radio, or the first in DOM order if none is checked — matching native browser behaviour.
    // Getting this wrong breaks Shift+Tab wrap-around (the group would occupy N stops, not 1).
    const seenGroups = new Set();
    const stops = [];
    for (const el of nodes) {
        if (el.tagName === 'INPUT' && el.type === 'radio' && el.name) {
            if (seenGroups.has(el.name)) continue;
            seenGroups.add(el.name);
            const group = nodes.filter(o => o.tagName === 'INPUT' && o.type === 'radio' && o.name === el.name);
            stops.push(group.find(o => o.checked) || group[0]);
        } else {
            stops.push(el);
        }
    }
    return stops;
}

// Guards for focus restore on modal close. A stashed/observer-time invoker can be stale in ways
// that would otherwise strand focus on <body>: the element can vanish (#subModal rebuilds
// #subOptions on every open), sit under a `.hidden` ancestor (#changelogBtn/#historyBtn/
// #returnToSetup are hidden on other screens, or after confirmReturnToSetup() tears down the
// scoreboard), or be hidden via inline style.display rather than the `.hidden` class — which is
// exactly how #changelogBtn/#historyBtn hide themselves, so getClientRects() is load-bearing
// here and not merely a belt-and-suspenders check.
function isRestorableFocusTarget(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (el.disabled) return false;
    if (!document.contains(el)) return false;
    if (el.closest('.hidden')) return false;
    return el.getClientRects().length > 0;
}

// Invoker capture. Reading document.activeElement AT OBSERVER TIME is unreliable — Safari does
// not focus a clicked <button>, and by the time the class mutation is observed several other
// things may have happened. Instead, remember the last plausible invoker AS IT HAPPENS via
// pointerdown/keydown, and let the "open" transition consume it. `.rotation-pos` (the #subModal
// invokers) are plain non-focusable <div>s, included anyway so a rotation click still overwrites
// this stash with something — calling .focus() on a div with no tabindex is a benign no-op later,
// which is exactly the "do nothing" outcome isRestorableFocusTarget()/onModalClose() want, rather
// than silently reusing a stale button from minutes earlier. `_lastModalInvoker` is a single slot,
// not per-modal: it always holds the most recent candidate, which is what the very next
// modal-open transition should attribute itself to.
const MODAL_INVOKER_SELECTOR = 'a[href], button, input, select, textarea, [tabindex], .rotation-pos';
let _lastModalInvoker = null;

function stashModalInvoker(e) {
    if (!e.target || !e.target.closest) return;
    const el = e.target.closest(MODAL_INVOKER_SELECTOR);
    if (el && !el.closest('.modal')) _lastModalInvoker = el;
}

const _modalInvokerFor = new Map(); // modalId -> element to refocus when that modal closes

// Watches ONE modal's `class` attribute. attributeOldValue lets the callback compare the NET
// transition across the whole batch (mutations[0].oldValue, the true "before") against the live
// class (the true "after") rather than trusting any single record — classList.add('hidden') on an
// already-hidden element still queues a real mutation record, so a [close, redundant re-hide]
// batch on one modal would otherwise read as "no change" off the last record alone and silently
// swallow the close (no focus restore, a leaked _modalInvokerFor entry). Comparing the batch's
// net effect instead means only a genuine hidden<->visible transition ever fires open/close.
function observeModalVisibility(modalEl) {
    // Guard a missing element rather than throwing: this runs in init() BEFORE restoreSavedMatch()
    // and trackVisibleScreen(), so a TypeError here (e.g. after a future modal id rename) would
    // take out in-flight match restore and every pageview, leaving the user on a blank-ish #setup.
    if (!modalEl) return;

    const observer = new MutationObserver(mutations => {
        const wasHidden = (mutations[0].oldValue || '').split(/\s+/).includes('hidden');
        const isHidden = modalEl.classList.contains('hidden');
        if (wasHidden === isHidden) return;
        if (wasHidden) onModalOpen(modalEl);
        else onModalClose(modalEl);
    });
    observer.observe(modalEl, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
}

function onModalOpen(modalEl) {
    _modalInvokerFor.set(modalEl.id, _lastModalInvoker || document.activeElement);
    _lastModalInvoker = null;

    // Focus the container, not the first control — lets a screen reader announce the dialog's
    // aria-labelledby title, rather than the jarring result of pre-focusing a "Close"/"Cancel"
    // button. Tab then moves to the first real control (see trapModalTab).
    const contentEl = modalEl.querySelector('.modal-content');
    if (contentEl) contentEl.focus();
}

function onModalClose(modalEl) {
    const invoker = _modalInvokerFor.get(modalEl.id) || null;
    _modalInvokerFor.delete(modalEl.id);
    if (isRestorableFocusTarget(invoker)) invoker.focus();
    // else: leave focus wherever the browser already put it. Never force it onto <body> — several
    // invokers legitimately have nowhere valid to return to (see isRestorableFocusTarget above),
    // e.g. #timeoutModal fired by a technical timeout, #setBreakModal (always automatic), and
    // #deciderSwitchModal (can open at page load from restoreSavedMatch(), with no user gesture).
}

// Cycles Tab/Shift+Tab within the currently-open modal. Only the boundary transitions need
// explicit handling — modal children are DOM-contiguous, so an un-intercepted Tab from the
// middle of the list already lands correctly on the next/previous stop without help.
function trapModalTab(e, modalEl) {
    const contentEl = modalEl.querySelector('.modal-content');
    const stops = getModalFocusables(modalEl);

    if (stops.length === 0) {
        e.preventDefault();
        if (contentEl) contentEl.focus();
        return;
    }

    const first = stops[0];
    const last = stops[stops.length - 1];
    const active = document.activeElement;
    const onContainer = active === contentEl;
    const index = stops.indexOf(active);

    if (e.shiftKey) {
        if (onContainer || index <= 0) {
            e.preventDefault();
            last.focus();
        }
    } else if (onContainer || index === -1 || index === stops.length - 1) {
        e.preventDefault();
        first.focus();
    }
}

// Single document-level keydown listener (capture phase) covering Escape + Tab for whichever
// modal is currently visible. No collision with the app's other two keydown listeners: the
// #serveIndicator Enter/Space handler ignores everything but Enter/Space, and the SoundFX unlock
// listener is `{ once: true, passive: true }` and self-removes after the first keypress.
function handleModalKeydown(e) {
    // An IME composition swallows its own Escape (used to cancel the candidate list). Without this
    // guard, cancelling a composition in #feedbackMessage would close the modal instead.
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key !== 'Escape' && e.key !== 'Tab') return;
    const modals = document.querySelectorAll('.modal:not(.hidden)');
    if (modals.length === 0) return;
    const modalEl = modals[modals.length - 1]; // last in DOM order, if more than one is ever visible

    if (e.key === 'Escape') {
        const closeFn = MODAL_ESCAPE_CLOSERS[modalEl.id];
        if (closeFn) {
            e.preventDefault();
            closeFn();
        }
        return;
    }

    trapModalTab(e, modalEl);
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
    trackScreen('rotationSetup');
}

function showNewSetRotationSetup() {
    state.team1Rotation = [];
    state.team2Rotation = [];
    saveState();
    // #setup carries no `hidden` class in the markup, so it is the default-visible screen on a
    // fresh page. Mid-match some earlier transition has already hidden it — but on a RELOAD
    // straight into this screen (restoreSavedMatch's `hasRotation` branch) nothing has, and the
    // whole setup form renders ABOVE the rotation screen, pushing it below the fold. Same bug
    // class as the matchOver branch documented in restoreSavedMatch(). Hiding it here fixes
    // every caller at once, and is a harmless no-op when it is already hidden.
    document.getElementById('setup').classList.add('hidden');
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
    trackScreen('rotationSetup');
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
        trackScreen('scoreboard');
    } else {
        // Start a new match - this will reset state and set up all UI elements
        beginMatch();
    }
}

function returnToSetupFromRotation() {
    if (matchIsLive()) {
        // Mid-match (set 2+): abandoning here forfeits an in-progress match, so confirm first.
        showReturnToSetupModal();
    } else {
        // Set-1 / pre-match: this is just a "back" button, no confirmation needed.
        resetToSetup();
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
    state.matchStartedAt = Date.now();
    state.team1Rotation = savedR1;
    state.team2Rotation = savedR2;
    state.hasRotation = savedHasRotation;
    state.lastStartingRotation1 = savedLast1;
    state.lastStartingRotation2 = savedLast2;

    state.rules = snapshotRules();
    state.techTimeoutsFired = [];
    state.team1Timeouts = state.rules.timeoutsPerSet;
    state.team2Timeouts = state.rules.timeoutsPerSet;

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

    trackScreen('scoreboard');

    track('match_start', {
        match_type: state.matchType,
        sets_to_win: state.setsToWin,
        has_rotation: state.hasRotation,
        t1_players: state.team1Players.length,
        t2_players: state.team2Players.length,
        timeouts_per_set: state.rules.timeoutsPerSet,
        regular_set_points: state.rules.regularSetPoints,
        final_set_points: state.rules.finalSetPoints,
        technical_timeouts: state.rules.technicalTimeouts
    });

    acquireWakeLock();
    updateDisplay();
}

function resetMatchState() {
    clearState();
    state.currentSet = 1;
    state.team1Score = 0;
    state.team2Score = 0;
    state.team1Sets = 0;
    state.team2Sets = 0;
    state.team1Timeouts = settings.timeoutsPerSet;
    state.team2Timeouts = settings.timeoutsPerSet;
    state.rules = null;
    state.techTimeoutsFired = [];
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
    state.team1SubPairs = [];
    state.team2SubPairs = [];
    state.team1LiberoIn = null;
    state.team2LiberoIn = null;
    state.hasRotation = false;
    state.lastStartingRotation1 = null;
    state.lastStartingRotation2 = null;
    state.matchStarted = false;
    state.deciderSideSwitched = false;
    state.matchStartedAt = null;
    state.currentSetStartedAt = null;
    state.matchDurationSec = null;
    _restoredRotationSetup = null;
}

function resetToSetup() {
    releaseWakeLock();
    document.getElementById('setup').classList.remove('hidden');
    document.getElementById('scoreboard').classList.add('hidden');
    document.getElementById('matchResult').classList.add('hidden');
    document.getElementById('rotationSetup').classList.add('hidden');
    resetMatchState();
    trackScreen('setup');
}

function isDeciderSet() {
    return state.currentSet === state.matchType;
}

function deciderSwitchPoint() {
    return Math.ceil(getRules().finalSetPoints / 2);
}

function getPointsToWin() {
    const r = getRules();
    return isDeciderSet() ? r.finalSetPoints : r.regularSetPoints;
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
        // Deep copy, not a spread: recordSubstitution() flips `returned` in place on an
        // existing pair object, so a shallow copy would let that flip rewrite history.
        team1SubPairs: JSON.parse(JSON.stringify(subPairs(1))),
        team2SubPairs: JSON.parse(JSON.stringify(subPairs(2))),
        currentSetStartedAt: state.currentSetStartedAt,
        team1LiberoIn: state.team1LiberoIn,
        team2LiberoIn: state.team2LiberoIn
    });

    // v4.21 Task 9: stamp the set's first rally. Pushed AFTER the snapshot above, so undoing
    // the first point of a set correctly clears the stamp again.
    if (state.currentSetStartedAt == null) state.currentSetStartedAt = Date.now();

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
    maybeTriggerTechnicalTimeout();
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
            // v4.21 Task 9. Null on a set that began before the timestamps existed (a
            // migrated schema-3 save) — the duration is simply hidden for that set.
            startedAt: state.currentSetStartedAt,
            endedAt: Date.now(),
            points: [...state.currentSetPoints]
        });
        // Cleared here rather than in the set-transition branch below so it is also cleared
        // on the match-ending branch, which does not fall through to those resets.
        state.currentSetStartedAt = null;

        if (setWinner === 1) {
            state.team1Sets++;
        } else {
            state.team2Sets++;
        }

        track('set_complete', {
            set_number: state.currentSet,
            winner: setWinner,
            t1_score: state.team1Score,
            t2_score: state.team2Score,
            point_diff: Math.abs(state.team1Score - state.team2Score),
            is_decider: state.currentSet === (state.matchType === 3 ? 3 : 5)
        });

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
            state.team1Timeouts = getRules().timeoutsPerSet;
            state.team2Timeouts = getRules().timeoutsPerSet;
            state.team1Subs = {};
            state.team2Subs = {};
            // v4.21: substitution allowances and the FIVB 15.6 pair locks are per-set. Reset
            // before switchSides() — which deliberately does not swap the substitution state,
            // exactly because it is already cleared by this point.
            state.team1SubPairs = [];
            state.team2SubPairs = [];
            state.team1LiberoIn = null;
            state.team2LiberoIn = null;
            state.currentSetPoints = [];
            state.serving = (state.currentSet % 2 === 1) ? 1 : 2;
            state.firstServer = state.serving;
            state.deciderSideSwitched = false;
            state.techTimeoutsFired = [];

            switchSides();

            SoundFX.play('setEnd');
            vibrateDevice([200, 100, 200]);
            showSetBreakModal(state.currentSet);
        }
    }
}

// Resolves the identity-mapped --team1-color/--team2-color (+ rgb) custom props into
// side-mapped colors (team1 = current left/side1, team2 = current right/side2). Shared by
// renderSetChart() and renderFinalScore() so post-swap color mapping is derived once. v4.20.
function sideColors() {
    const cssStyle = getComputedStyle(document.documentElement);
    const colorA = cssStyle.getPropertyValue('--team1-color').trim();
    const colorB = cssStyle.getPropertyValue('--team2-color').trim();
    const rgbA   = cssStyle.getPropertyValue('--team1-rgb').trim();
    const rgbB   = cssStyle.getPropertyValue('--team2-rgb').trim();
    return {
        team1Color: state.team1OriginalId === 'A' ? colorA : colorB,
        team2Color: state.team2OriginalId === 'A' ? colorA : colorB,
        team1Rgb:   state.team1OriginalId === 'A' ? rgbA   : rgbB,
        team2Rgb:   state.team2OriginalId === 'A' ? rgbA   : rgbB
    };
}

function renderSetChart(set) {
    const pts = set.points;
    if (!pts || pts.length < 2) return '';

    const w = 280, dataH = 78, padX = 4, padY = 6, tickZone = 18;
    const svgH = dataH + tickZone;
    const allPts = [{ team1Score: 0, team2Score: 0 }, ...pts];
    const n = allPts.length - 1;
    const maxScore = Math.max(set.team1Score, set.team2Score, 1);

    const { team1Color, team2Color, team1Rgb, team2Rgb } = sideColors();

    const toX = i => (padX + (n > 0 ? (i / n) * (w - 2 * padX) : 0)).toFixed(1);
    const toY = s => ((dataH - padY) - (s / maxScore) * (dataH - 2 * padY)).toFixed(1);

    // Per-segment lines — trailing team rendered at low opacity each interval. `.sc-seg` +
    // `--i` (rally index) drive the CSS draw-in stagger (v4.20 T4) — opacity only, so it
    // composes with (never overrides) the stroke-opacity leader/trailer encoding above.
    let lines1 = '', lines2 = '';
    for (let i = 1; i <= n; i++) {
        const prev = allPts[i - 1], cur = allPts[i];
        const x1 = toX(i - 1), x2 = toX(i);
        const op1 = prev.team1Score < prev.team2Score ? '0.28' : '1';
        const op2 = prev.team2Score < prev.team1Score ? '0.28' : '1';
        lines1 += `<line class="sc-seg" style="--i:${i}" x1="${x1}" y1="${toY(prev.team1Score)}" x2="${x2}" y2="${toY(cur.team1Score)}" stroke="${team1Color}" stroke-width="2.5" stroke-opacity="${op1}" stroke-linecap="round"/>`;
        lines2 += `<line class="sc-seg" style="--i:${i}" x1="${x1}" y1="${toY(prev.team2Score)}" x2="${x2}" y2="${toY(cur.team2Score)}" stroke="${team2Color}" stroke-width="2.5" stroke-opacity="${op2}" stroke-linecap="round"/>`;
    }

    // Score markers — tick at each 5-point score milestone (labels show score, not rally count)
    let ticks = '';
    for (let score = 5; score <= maxScore; score += 5) {
        const idx = allPts.findIndex(p => Math.max(p.team1Score, p.team2Score) >= score);
        if (idx > 0) {
            const x = toX(idx);
            ticks += `<line x1="${x}" y1="${dataH - 1}" x2="${x}" y2="${dataH + 4}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>`;
            ticks += `<text x="${x}" y="${svgH - 2}" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.38)" font-family="Saira Semi Condensed,sans-serif">${score}</text>`;
        }
    }

    const winnerOriginalId = set.winnerOriginalId || (set.winner === 1 ? 'A' : 'B');
    const winLabel = winnerOriginalId === state.team1OriginalId ? state.team1Name : state.team2Name;
    const winColor = winnerOriginalId === state.team1OriginalId ? team1Color : team2Color;

    // v4.20 T4: two annotations only, sharing longestRunInSet() with the Match Story "Longest
    // Run" card so the chart and the card never disagree about what counts as a run. Y
    // coordinates are clamped to stay inside the SVG's own coordinate space (not relying on
    // `.set-chart { overflow: visible }`) since the ≤600px carousel below makes `.set-charts`
    // a scroll container that clips overflow on both axes.
    let annotations = '';
    const run = longestRunInSet(pts);
    if (run.len >= 3) { // same threshold buildMatchStoryCards() uses for the card
        const vertexIdx = run.startIdx + 1; // allPts index of the run's first scored point
        const runScore = run.team === 1 ? allPts[vertexIdx].team1Score : allPts[vertexIdx].team2Score;
        const rx = toX(vertexIdx);
        // A run that STARTS in the final stretch is the closing surge, so its marker lands on
        // the final-score label — and both otherwise clamp into the same top band, so they
        // overlap. Flip the marker below its vertex in that case rather than dropping it, so
        // no information is lost and the chart still agrees with the "Longest Run" card.
        const nearEnd = n > 0 && vertexIdx / n > 0.82;
        const ry = nearEnd
            ? Math.min(dataH - 2, Number(toY(runScore)) + 12)
            : Math.max(padY + 8, Number(toY(runScore)) - 6);
        annotations += `<text class="sc-run-marker" x="${rx}" y="${ry}">&#9656;</text>`;
    }

    const winnerIsTeam1 = winnerOriginalId === state.team1OriginalId;
    const finalScore = winnerIsTeam1 ? set.team1Score : set.team2Score;
    const finalX = toX(n);
    const finalY = Math.max(padY + 8, Number(toY(finalScore)) - 8);
    annotations += `<circle class="sc-final-marker" cx="${toX(n)}" cy="${toY(finalScore)}" r="4.5" fill="${winColor}"/>`;
    annotations += `<text class="sc-final-label" x="${finalX - 8}" y="${finalY}" fill="${winColor}">${set.team1Score}&ndash;${set.team2Score}</text>`;

    return `
        <div class="set-chart-wrap" style="--panel-i:${set.set - 1}">
            <div class="set-chart-header">
                <span class="set-chart-label">Set ${set.set}</span>
                <span class="set-chart-score">${set.team1Score} – ${set.team2Score}</span>
                <span class="set-chart-winner" style="color:${winColor}">${escapeHtml(winLabel)}</span>
            </div>
            <svg viewBox="0 0 ${w} ${svgH}" class="set-chart" preserveAspectRatio="none">
                ${lines1}${lines2}${ticks}${annotations}
            </svg>
            <div class="set-chart-axis">
                <span style="color:${team1Color}">${escapeHtml(state.team1Name)}</span>
                <span style="color:${team2Color}">${escapeHtml(state.team2Name)}</span>
            </div>
        </div>
    `;
}

function endMatch({ fromRestore = false } = {}) {
    state.matchOver = true;
    const winner = state.team1Sets > state.team2Sets ? state.team1Name : state.team2Name;
    const totalT1Pts = state.setHistory.reduce((a, s) => a + s.team1Score, 0);
    const totalT2Pts = state.setHistory.reduce((a, s) => a + s.team2Score, 0);

    if (!fromRestore) {
        if (state.matchStartedAt && state.matchDurationSec == null) {
            state.matchDurationSec = Math.round((Date.now() - state.matchStartedAt) / 1000);
        }
        track('match_complete', {
            match_type: state.matchType,
            sets_played: state.setHistory.length,
            t1_sets: state.team1Sets,
            t2_sets: state.team2Sets,
            winner_side: state.team1Sets > state.team2Sets ? 1 : 2,
            total_points: totalT1Pts + totalT2Pts,
            went_to_decider: state.setHistory.length === (state.matchType === 3 ? 3 : 5),
            duration_sec: state.matchDurationSec != null ? state.matchDurationSec : null
        });
        SoundFX.play('matchEnd');
        vibrateDevice([300, 120, 300, 120, 600]);
        releaseWakeLock();
    }

    document.getElementById('scoreboard').classList.add('hidden');
    document.getElementById('matchResult').classList.remove('hidden');

    document.getElementById('winner').textContent = `${winner} Wins!`;

    renderFinalScore(fromRestore);
    // Fires on the restore path too, and should: reloading onto the result screen IS a view of it.
    trackScreen('matchResult');
}

// v4.20 T1: semantic box-score table (replaces the .set-results-row pill row).
// Dots reuse sideColors() — the same identity->side resolution renderSetChart uses.
function buildBoxScoreTable(team1Color, team2Color) {
    const sets = state.setHistory;
    const t1Wins = state.team1Sets > state.team2Sets;

    const headerCells = sets.map(s => `<th>S${s.set}</th>`).join('');
    const team1Cells = sets.map(s =>
        `<td class="${s.winner === 1 ? 'box-score-win' : 'box-score-lose'}">${s.team1Score}</td>`).join('');
    const team2Cells = sets.map(s =>
        `<td class="${s.winner === 2 ? 'box-score-win' : 'box-score-lose'}">${s.team2Score}</td>`).join('');

    // v4.21 Task 9: per-set durations as a footer row, aligned to the set columns. The whole
    // row is omitted when no set carries timestamps (legacy saves); an individual set missing
    // them renders an em dash. The Sets column has no meaningful total here — match duration
    // already has its own Match Story card — so it stays a dash.
    const durations = sets.map(s => formatSetDuration(s.startedAt, s.endedAt));
    const durationFoot = durations.some(d => d != null) ? `
                <tfoot>
                    <tr>
                        <td class="box-score-name">Duration</td>
                        ${durations.map(d => `<td>${d != null ? escapeHtml(d) : '&mdash;'}</td>`).join('')}
                        <td class="box-score-sets-col">&mdash;</td>
                    </tr>
                </tfoot>` : '';

    return `
        <div class="box-score-wrap">
            <table class="box-score">
                <thead>
                    <tr>
                        <th class="box-score-name"></th>
                        ${headerCells}
                        <th class="box-score-sets-col">Sets</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="box-score-name"><span class="box-score-dot" style="background:${team1Color}"></span>${escapeHtml(state.team1Name)}</td>
                        ${team1Cells}
                        <td class="box-score-sets-col ${t1Wins ? 'box-score-win' : 'box-score-lose'}">${state.team1Sets}</td>
                    </tr>
                    <tr>
                        <td class="box-score-name"><span class="box-score-dot" style="background:${team2Color}"></span>${escapeHtml(state.team2Name)}</td>
                        ${team2Cells}
                        <td class="box-score-sets-col ${!t1Wins ? 'box-score-win' : 'box-score-lose'}">${state.team2Sets}</td>
                    </tr>
                </tbody>${durationFoot}
            </table>
        </div>
    `;
}

// v4.20 T2: rAF count-up for the full-time hero digits, 0 -> final over ~600ms.
// Skipped entirely (caller renders final values instantly) on restore or reduced-motion.
function runSetsCountUp(el1, el2, final1, final2) {
    const duration = 600;
    const start = performance.now();
    function step(now) {
        const t = Math.min(1, (now - start) / duration);
        el1.textContent = Math.round(final1 * t);
        el2.textContent = Math.round(final2 * t);
        if (t < 1) {
            requestAnimationFrame(step);
        }
    }
    requestAnimationFrame(step);
}

// v4.20 T3: pure stat-derivation functions for the "Match Story" card strip. Each takes only
// the `sets` array (state.setHistory) — no state access, no DOM reads — so re-running the same
// derivation on reload (endMatch({fromRestore:true})) reproduces identical cards. Every one
// tolerates legacy saves via `(s.points || [])`: setHistory entries predate per-rally point
// logging in some old saves and simply yield a zero/degenerate result, never a crash.

// v4.20 T4: single-set run scanner. Extracted out of longestRun() so the chart marker (which
// needs a start index into ONE set's points) and the Match Story "Longest Run" card (which
// needs the best run across the WHOLE match) share one source of truth — two independent
// scanners would risk disagreeing about what counts as the longest run on the same screen.
function longestRunInSet(points) {
    let best = { len: 0, team: 0, startIdx: -1 };
    let len = 0, team = 0, startIdx = -1;
    (points || []).forEach((p, i) => {
        if (p.team === team) {
            len += 1;
        } else {
            len = 1;
            team = p.team;
            startIdx = i;
        }
        if (len > best.len) best = { len, team, startIdx };
    });
    return best; // best.len === 0 → no data
}

function longestRun(sets) {
    let best = { len: 0, team: 0, set: 0 };
    sets.forEach(s => {
        const r = longestRunInSet(s.points || []);
        // Strict `>` (not `>=`) preserves the original point-by-point scan's tie behaviour:
        // when two sets share the same max run length, the earlier set in `sets` order wins.
        if (r.len > best.len) best = { len: r.len, team: r.team, set: s.set };
    });
    return best; // best.len === 0 → no data
}

function biggestComeback(sets) {
    let best = { deficit: 0, set: 0, winner: 0 };
    sets.forEach(s => {
        let maxDeficit = 0;
        (s.points || []).forEach(p => {
            const winnerScore = s.winner === 1 ? p.team1Score : p.team2Score;
            const loserScore  = s.winner === 1 ? p.team2Score : p.team1Score;
            maxDeficit = Math.max(maxDeficit, loserScore - winnerScore);
        });
        if (maxDeficit > best.deficit) best = { deficit: maxDeficit, set: s.set, winner: s.winner };
    });
    return best;
}

// A lead change is when the team that is AHEAD changes hands. A tie is NOT a lead change,
// and it does not clear the incumbent leader — so lead → tie → same team ahead counts as
// ZERO (the lead never changed hands), while lead → tie → other team ahead counts as ONE.
// This is the only stat where a naive "count sign flips" reading double-counts every deuce.
function leadChanges(sets) {
    let total = 0, worst = { count: 0, set: 0 };
    sets.forEach(s => {
        let count = 0, leader = 0; // 0 = nobody has led yet
        (s.points || []).forEach(p => {
            const sign = Math.sign(p.team1Score - p.team2Score); // 1 | -1 | 0
            if (sign === 0) return;                  // tie: retain incumbent leader
            if (leader !== 0 && sign !== leader) count++;
            leader = sign;
        });
        total += count;
        if (count > worst.count) worst = { count, set: s.set };
    });
    return { total, worst }; // total === 0 → hide the card; worst.set names the wildest set
}

// No reference impl given in the plan doc (§3.3) — written in the same style as the three
// above. Spec: max abs(team1Score - team2Score) reached at any rally across the whole match,
// plus which side held it and in which set.
function largestLead(sets) {
    let best = { lead: 0, team: 0, set: 0 };
    sets.forEach(s => {
        (s.points || []).forEach(p => {
            const lead = Math.abs(p.team1Score - p.team2Score);
            if (lead > best.lead) best = { lead, team: p.team1Score > p.team2Score ? 1 : 2, set: s.set };
        });
    });
    return best; // best.lead === 0 → no data
}

function formatMatchDuration(sec) {
    if (sec == null) return null;
    const h = Math.floor(sec / 3600);
    // floor, not round: rounding carries 3590s to "60m" and 7175s to "1h 60m".
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// v4.21 Task 9: a single set's duration from its setHistory timestamps. Returns null when
// either stamp is missing (any set played before v4.21, i.e. a migrated schema-3 save), which
// is the signal the box score uses to hide the cell — and the whole row when no set has one.
// Sub-minute sets read in seconds; formatMatchDuration would render a 40-second test set "0m".
function formatSetDuration(startedAt, endedAt) {
    if (startedAt == null || endedAt == null) return null;
    const ms = endedAt - startedAt;
    if (!(ms >= 0)) return null;  // negative (clock moved) or NaN — not >0, so a 0ms set reads "0s"
    const sec = Math.round(ms / 1000);
    return sec < 60 ? `${sec}s` : formatMatchDuration(sec);
}

// Side name (1/2) for card details — indexes the CURRENT team1Name/team2Name, which is
// correct post-swap because setHistory[].points is remapped by swapTeams() (see CLAUDE.md,
// "Side-swap vs. team-swap"). team === 0 (no data) falls back to team1Name; the caller never
// renders that case since the owning card is hidden when its stat is degenerate.
function sideName(team) {
    return team === 2 ? state.team2Name : state.team1Name;
}

// v4.20 T3: assembles the Match Story card strip — at most 5 cards, in the table-priority
// order from plan doc §3.3 (Duration, Total Rallies, Longest Run, Lead Changes, Biggest
// Comeback, Largest Lead, Points). Degenerate cards are omitted outright, never rendered as
// "0" — an empty-ish strip with 2 strong cards beats 7 weak ones.
function buildMatchStoryCards() {
    const sets = state.setHistory;
    const candidates = [];

    const durationLabel = formatMatchDuration(state.matchDurationSec);
    if (durationLabel != null) {
        candidates.push({ eyebrow: 'Duration', value: escapeHtml(durationLabel), detail: '' });
    }

    const totalRallies = sets.reduce((a, s) => a + (s.points || []).length, 0);
    candidates.push({
        eyebrow: 'Total Rallies',
        value: String(totalRallies),
        detail: `${sets.length} set${sets.length === 1 ? '' : 's'} played`
    });

    const run = longestRun(sets);
    if (run.len >= 3) {
        candidates.push({
            eyebrow: 'Longest Run',
            value: `${run.len}-0 run`,
            detail: `${escapeHtml(sideName(run.team))} &middot; Set ${run.set}`
        });
    }

    const changes = leadChanges(sets);
    if (changes.total > 0) {
        candidates.push({
            eyebrow: 'Lead Changes',
            value: String(changes.total),
            detail: `Wildest in Set ${changes.worst.set}`
        });
    }

    const comeback = biggestComeback(sets);
    if (comeback.deficit >= 3) {
        candidates.push({
            eyebrow: 'Biggest Comeback',
            value: `from ${comeback.deficit} down`,
            detail: `${escapeHtml(sideName(comeback.winner))} &middot; Set ${comeback.set}`
        });
    }

    const lead = largestLead(sets);
    if (lead.lead >= 4) {
        candidates.push({
            eyebrow: 'Largest Lead',
            value: `${lead.lead}-point lead`,
            detail: `${escapeHtml(sideName(lead.team))} &middot; Set ${lead.set}`
        });
    }

    const totalT1 = sets.reduce((a, s) => a + s.team1Score, 0);
    const totalT2 = sets.reduce((a, s) => a + s.team2Score, 0);
    candidates.push({
        eyebrow: 'Points',
        value: String(totalT1 + totalT2),
        detail: `${escapeHtml(state.team1Name)} ${totalT1} &middot; ${escapeHtml(state.team2Name)} ${totalT2}`
    });

    // Cap the strip so a rich match doesn't render a wall of cards. A plain slice(0, 5) in
    // table order would drop Points from a match that triggered every situational card —
    // contradicting its own "never hide" rule, since its value is always meaningful. So the
    // two never-hide cards get guaranteed slots, and the rest are selected story-first: a
    // run / comeback / lead-change is the whole point of a "Match Story" strip, whereas
    // Duration is context and is the first thing worth losing.
    const MAX_CARDS = 5;
    const SELECTION_PRIORITY = [
        'Total Rallies', 'Points',                                   // never-hide: guaranteed
        'Longest Run', 'Biggest Comeback', 'Lead Changes',            // the story
        'Largest Lead', 'Duration'                                   // context
    ];
    const kept = new Set(
        candidates
            .slice()
            .sort((a, b) => SELECTION_PRIORITY.indexOf(a.eyebrow) - SELECTION_PRIORITY.indexOf(b.eyebrow))
            .slice(0, MAX_CARDS)
            .map(c => c.eyebrow)
    );
    // filter preserves the §3.3 table order the candidates were pushed in, so selection
    // priority changes only WHICH cards survive, never the left-to-right reading order.
    return candidates.filter(c => kept.has(c.eyebrow));
}

// Renders buildMatchStoryCards() into the `.story-strip` wrap-row of `.story-card`s. The
// empty-cards guard below is defensive only and is currently unreachable: Total Rallies and
// Points are pushed unconditionally, so the card list is never shorter than 2. Keep the guard
// so the function stays safe if either of those ever gains a hide-rule.
function renderMatchStoryStrip() {
    const cards = buildMatchStoryCards();
    if (cards.length === 0) return '';
    const cardsHTML = cards.map(c => `
        <div class="story-card">
            <div class="story-card-eyebrow">${c.eyebrow}</div>
            <div class="story-card-value">${c.value}</div>
            ${c.detail ? `<div class="story-card-detail">${c.detail}</div>` : ''}
        </div>
    `).join('');
    return `<div class="story-strip">${cardsHTML}</div>`;
}

// v4.20 T0: extracted from endMatch() — builds the #finalScore innerHTML. Must receive
// fromRestore explicitly (not read from a global) since count-up animation (T2) is gated on it.
function renderFinalScore(fromRestore) {
    const { team1Color, team2Color } = sideColors();
    const t1Wins = state.team1Sets > state.team2Sets;
    // Count-up only on a live match end; restore and reduced-motion render final values instantly.
    const skipCountUp = fromRestore || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let scoreHTML = `
        <div class="ft-scoreline">
            <div class="ft-team">
                <span class="ft-dot" style="background:${team1Color}"></span>
                <span class="ft-name">${escapeHtml(state.team1Name)}</span>
            </div>
            <div class="ft-sets">
                <span id="ftDigit1" class="ft-digit ${t1Wins ? 'ft-digit-win' : ''}">${skipCountUp ? state.team1Sets : 0}</span>
                <span class="ft-sep">&mdash;</span>
                <span id="ftDigit2" class="ft-digit ${!t1Wins ? 'ft-digit-win' : ''}">${skipCountUp ? state.team2Sets : 0}</span>
            </div>
            <div class="ft-team">
                <span class="ft-dot" style="background:${team2Color}"></span>
                <span class="ft-name">${escapeHtml(state.team2Name)}</span>
            </div>
        </div>`;

    // v4.20 T3: Match Story card strip (replaces the Batch A placeholder). The old
    // total-points line now lives inside the "Points" card — see buildMatchStoryCards().
    scoreHTML += renderMatchStoryStrip();

    scoreHTML += buildBoxScoreTable(team1Color, team2Color);

    scoreHTML += '<div class="set-charts">';
    state.setHistory.forEach(set => {
        scoreHTML += renderSetChart(set);
    });
    scoreHTML += '</div>';

    document.getElementById('finalScore').innerHTML = scoreHTML;

    if (!skipCountUp) {
        runSetsCountUp(
            document.getElementById('ftDigit1'),
            document.getElementById('ftDigit2'),
            state.team1Sets,
            state.team2Sets
        );
    }
}

function buildResultSummary() {
    const t1Won = state.team1Sets > state.team2Sets;
    const winner = t1Won ? state.team1Name : state.team2Name;
    const loser  = t1Won ? state.team2Name : state.team1Name;
    const setsW  = Math.max(state.team1Sets, state.team2Sets);
    const setsL  = Math.min(state.team1Sets, state.team2Sets);
    const sets = state.setHistory.map(s =>
        t1Won ? `${s.team1Score}-${s.team2Score}` : `${s.team2Score}-${s.team1Score}`).join(', ');
    const url = location.origin + location.pathname;
    return `🏐 ${winner} def. ${loser} ${setsW}-${setsL} (${sets})\nScored with SpikeSheet — ${url}`;
}

async function shareResult() {
    const text = buildResultSummary();
    if (navigator.share) {
        try {
            await navigator.share({ text });
            track('result_shared', { method: 'share' });
        } catch (err) {
            if (err && err.name !== 'AbortError') track('share_error', { reason: 'share_failed' });
        }
        return;
    }
    try {
        await navigator.clipboard.writeText(text);
        track('result_shared', { method: 'clipboard' });
        flashButtonLabel('shareResult', 'Copied!');
    } catch (_) {
        track('share_error', { reason: 'clipboard_failed' });
        flashButtonLabel('shareResult', 'Copy failed');
    }
}

const originalButtonLabels = {};

function flashButtonLabel(id, label) {
    const button = document.getElementById(id);
    if (!button) return;

    if (!originalButtonLabels[id]) {
        originalButtonLabels[id] = button.textContent;
    }

    const originalLabel = originalButtonLabels[id];

    if (button.dataset.flashTimer) {
        clearTimeout(button.dataset.flashTimer);
    }

    button.textContent = label;

    button.dataset.flashTimer = setTimeout(() => {
        button.textContent = originalLabel;
        delete button.dataset.flashTimer;
    }, 1500);
}

function undoLastPoint() {
    if (state.pointHistory.length === 0) return;
    track('undo_point', { set: state.currentSet });

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
    // Array.isArray guards a snapshot pushed before v4.21 (migrate() seeds those, so this is
    // belt-and-braces); undefined here would leave the pair log unusable until the next reset.
    state.team1SubPairs = Array.isArray(lastState.team1SubPairs) ? lastState.team1SubPairs : [];
    state.team2SubPairs = Array.isArray(lastState.team2SubPairs) ? lastState.team2SubPairs : [];
    state.currentSetStartedAt = lastState.currentSetStartedAt ?? null;
    state.team1LiberoIn = lastState.team1LiberoIn;
    state.team2LiberoIn = lastState.team2LiberoIn;
    state.matchOver = false;

    updateDisplay();
}

function updateTimeoutDots(team, timeoutsLeft) {
    const container = document.getElementById(`timeoutDots${team}`);
    const total = getRules().timeoutsPerSet;
    let html = '';
    for (let i = 0; i < total; i++) {
        html += `<span class="timeout-dot${i < timeoutsLeft ? ' active' : ''}"></span>`;
    }
    container.innerHTML = html;
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

    // v4.10: expose side-mapped color + readable ink for CSS (score buttons, plates)
    const rootCS = getComputedStyle(document.documentElement);
    const rgbA = rootCS.getPropertyValue('--team1-rgb').trim();
    const rgbB = rootCS.getPropertyValue('--team2-rgb').trim();
    const inkFor = rgb => {
        const [r, g, b] = rgb.split(',').map(Number);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#0a1437' : '#ffffff';
    };
    const side1 = state.team1OriginalId === 'A' ? rgbA : rgbB;
    const side2 = state.team2OriginalId === 'A' ? rgbA : rgbB;
    document.documentElement.style.setProperty('--side1-rgb', side1);
    document.documentElement.style.setProperty('--side2-rgb', side2);
    document.documentElement.style.setProperty('--side1-ink', inkFor(side1));
    document.documentElement.style.setProperty('--side2-ink', inkFor(side2));
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

    // Set --serve-rgb to match the serving team's identity color
    const serveIndicatorEl = document.getElementById('serveIndicator');
    const sideId = state.serving === 1 ? state.team1OriginalId : state.team2OriginalId;
    const rootStyle = getComputedStyle(document.documentElement);
    const serveRgb = sideId === 'A'
        ? rootStyle.getPropertyValue('--team1-rgb').trim()
        : rootStyle.getPropertyValue('--team2-rgb').trim();
    serveIndicatorEl.style.setProperty('--serve-rgb', serveRgb);

    updateTimeoutDots(1, state.team1Timeouts);
    updateTimeoutDots(2, state.team2Timeouts);

    const timeoutsEnabled = getRules().timeoutsPerSet > 0;
    document.querySelectorAll('.timeout-container').forEach(el => {
        el.classList.toggle('hidden', !timeoutsEnabled);
    });

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

    const team1TimelineEl = document.getElementById('team1Timeline');
    const team2TimelineEl = document.getElementById('team2Timeline');
    team1TimelineEl.innerHTML = team1HTML;
    team2TimelineEl.innerHTML = team2HTML;

    team1TimelineEl.scrollLeft = team1TimelineEl.scrollWidth;
    team2TimelineEl.scrollLeft = team2TimelineEl.scrollWidth;
    saveState();
}

document.addEventListener('DOMContentLoaded', init);
