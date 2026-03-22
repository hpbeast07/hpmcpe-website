/* ═══════════════════════════════════════════
   HPmcpe — Main Script
   ═══════════════════════════════════════════ */

// ── STORAGE ──
const STORE_KEY = 'hpmcpe_players';

function getPlayers() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
  catch (e) { return {}; }
}

function savePlayers(obj) {
  localStorage.setItem(STORE_KEY, JSON.stringify(obj));
}

// ✅ FIX 3: SHA-256 via Web Crypto API — much stronger than djb2
async function hashPass(str) {
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── IGN INPUT ──
const emojis = ['🧑','👦','👧','🧔','🧑‍🦱','🧑‍🦰','🧑‍🦳','🧒'];

function onIgn(raw) {
  // ✅ FIX 2: trim() added so spaces don't cause false "new player" detection
  const val  = raw.trim();

  const row  = document.getElementById('skinRow');
  const av   = document.getElementById('skinAv');
  const nm   = document.getElementById('skinNm');
  const st   = document.getElementById('skinSt');
  const hint = document.getElementById('regHint');

  if (val.length >= 3) {
    av.textContent = emojis[val.charCodeAt(0) % emojis.length];
    nm.textContent = val;
    row.classList.add('lit');

    const players = getPlayers();
    if (players[val.toLowerCase()]) {
      st.textContent   = '✔ Account found — enter password';
      hint.textContent = '🔑 Returning player — welcome back!';
      hint.className   = 'reg-hint exists';
    } else {
      st.textContent   = '✨ New player detected';
      hint.textContent = '🆕 First time? A new account will be created!';
      hint.className   = 'reg-hint new';
    }
  } else if (val.length > 0) {
    av.textContent   = '🤔';
    nm.textContent   = val + '...';
    st.textContent   = 'Too short (min 3 chars)';
    hint.textContent = '';
    hint.className   = 'reg-hint';
    row.classList.remove('lit');
  } else {
    av.textContent   = '🧑';
    nm.textContent   = 'Who are you?';
    st.textContent   = 'Enter your IGN below';
    hint.textContent = '';
    hint.className   = 'reg-hint';
    row.classList.remove('lit');
  }
}

// ── LOGIN / REGISTER ──
async function doLogin() {
  const ign  = document.getElementById('ignInput').value.trim();
  const pass = document.getElementById('passInput').value;
  const btn  = document.getElementById('enterBtn');

  if (!ign || ign.length < 3) { setMsg('⚠ Enter a valid IGN (min 3 chars).', 'err'); return; }
  if (!pass || pass.length < 4) { setMsg('⚠ Password must be at least 4 characters.', 'err'); return; }

  btn.disabled    = true;
  btn.textContent = '⏳ Loading world...';
  setMsg('', '');

  // ✅ FIX 3: await SHA-256 hash before comparing
  const hashed  = await hashPass(pass);
  const players = getPlayers();
  const key     = ign.toLowerCase();

  setTimeout(() => {
    if (players[key]) {
      // Returning player — verify password
      if (players[key].password === hashed) {
        players[key].lastLogin = Date.now();
        savePlayers(players);
        enterMain(ign, false);
      } else {
        btn.disabled    = false;
        btn.textContent = '▶ ENTER WORLD';
        setMsg('❌ Wrong password! Try again.', 'err');
      }
    } else {
      // New player — register and save
      players[key] = {
        ign:        ign,
        password:   hashed,
        registered: Date.now(),
        lastLogin:  Date.now()
      };
      savePlayers(players);
      enterMain(ign, true);
    }
  }, 1000);
}

// ── LOGOUT ──
function doLogout() {
  const main  = document.getElementById('screen-main');
  const login = document.getElementById('screen-login');
  const heroBg = document.getElementById('heroBg');

  main.classList.remove('in');
  heroBg.classList.remove('zoomed');

  setTimeout(() => {
    main.style.zIndex = '5';
    login.classList.remove('out');

    document.getElementById('ignInput').value       = '';
    document.getElementById('passInput').value      = '';
    document.getElementById('enterBtn').disabled    = false;
    document.getElementById('enterBtn').textContent = '▶ ENTER WORLD';
    setMsg('', '');

    document.getElementById('skinAv').textContent  = '🧑';
    document.getElementById('skinNm').textContent  = 'Who are you?';
    document.getElementById('skinSt').textContent  = 'Enter your IGN below';
    document.getElementById('regHint').textContent = '';
    document.getElementById('regHint').className   = 'reg-hint';
    document.getElementById('skinRow').classList.remove('lit');
  }, 600);
}

// ── ENTER MAIN SCREEN ──
function enterMain(ign, isNew) {
  document.getElementById('navIgn').textContent      = ign;
  document.getElementById('heroWelcome').textContent = isNew
    ? 'Welcome to HPmcpe, ' + ign + '! 🎉'
    : 'Welcome back, ' + ign + '! 👋';
  document.getElementById('onlineCnt').textContent   = Math.floor(Math.random() * 40 + 10);

  document.getElementById('screen-login').classList.add('out');

  const main = document.getElementById('screen-main');
  main.style.zIndex = '20';

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      main.classList.add('in');
      setTimeout(() => {
        document.getElementById('heroBg').classList.add('zoomed');
      }, 200);
    });
  });
}

// ── HELPERS ──
function setMsg(t, c) {
  const m = document.getElementById('loginMsg');
  m.textContent = t;
  m.className   = 'login-msg' + (c ? ' ' + c : '');
}

function copyIP(el) {
  navigator.clipboard.writeText('after-citations.gl.joinmc.link').catch(() => {});
  const tip = el.querySelector('.ip-tip');
  if (tip) { tip.style.opacity = '1'; setTimeout(() => tip.style.opacity = '0', 2000); }
}

function miniCopy(el) {
  navigator.clipboard.writeText('after-citations.gl.joinmc.link').catch(() => {});
  const o = el.textContent;
  el.textContent = '✔ Copied!';
  setTimeout(() => el.textContent = o, 2000);
}
