/* ═══════════════════════════════════════════
   HPmcpe — Main Script (v2)
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

// SHA-256 via Web Crypto API
async function hashPass(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── IGN INPUT — show/hide email & forgot link ──
const emojis = ['🧑','👦','👧','🧔','🧑‍🦱','🧑‍🦰','🧑‍🦳','🧒'];

function onIgn(raw) {
  const val      = raw.trim();
  const row      = document.getElementById('skinRow');
  const av       = document.getElementById('skinAv');
  const nm       = document.getElementById('skinNm');
  const st       = document.getElementById('skinSt');
  const hint     = document.getElementById('regHint');
  const emailWrap= document.getElementById('emailWrap');
  const forgotW  = document.getElementById('forgotWrap');

  if (val.length >= 3) {
    av.textContent = emojis[val.charCodeAt(0) % emojis.length];
    nm.textContent = val;
    row.classList.add('lit');

    const players = getPlayers();
    if (players[val.toLowerCase()]) {
      st.textContent    = '✔ Account found — enter password';
      hint.textContent  = '🔑 Returning player — welcome back!';
      hint.className    = 'reg-hint exists';
      emailWrap.style.display = 'none';     // Existing player — no email needed
      forgotW.style.display   = 'block';   // Show "Forgot password?"
    } else {
      st.textContent    = '✨ New player detected';
      hint.textContent  = '🆕 First time? Fill in email & password to register!';
      hint.className    = 'reg-hint new';
      emailWrap.style.display = 'block';   // New player — needs email
      forgotW.style.display   = 'none';
    }
  } else if (val.length > 0) {
    av.textContent    = '🤔';
    nm.textContent    = val + '...';
    st.textContent    = 'Too short (min 3 chars)';
    hint.textContent  = '';
    hint.className    = 'reg-hint';
    row.classList.remove('lit');
    emailWrap.style.display = 'none';
    forgotW.style.display   = 'none';
  } else {
    av.textContent    = '🧑';
    nm.textContent    = 'Who are you?';
    st.textContent    = 'Enter your IGN below';
    hint.textContent  = '';
    hint.className    = 'reg-hint';
    row.classList.remove('lit');
    emailWrap.style.display = 'none';
    forgotW.style.display   = 'none';
  }
}

// ── LOGIN / REGISTER ──
async function doLogin() {
  const ign   = document.getElementById('ignInput').value.trim();
  const email = document.getElementById('emailInput').value.trim().toLowerCase();
  const pass  = document.getElementById('passInput').value;
  const btn   = document.getElementById('enterBtn');

  if (!ign || ign.length < 3) { setMsg('⚠ Enter a valid IGN (min 3 chars).', 'err'); return; }
  if (!pass || pass.length < 4) { setMsg('⚠ Password must be at least 4 characters.', 'err'); return; }

  const players = getPlayers();
  const key     = ign.toLowerCase();

  // New player — validate email
  if (!players[key]) {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMsg('⚠ Please enter a valid email address.', 'err'); return;
    }
    // Check if email already used by someone else
    const emailTaken = Object.values(players).some(p => p.email === email);
    if (emailTaken) { setMsg('⚠ This email is already registered with another account.', 'err'); return; }
  }

  btn.disabled    = true;
  btn.textContent = '⏳ Loading world...';
  setMsg('', '');

  const hashed = await hashPass(pass);

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
      // New player — register
      players[key] = {
        ign:        ign,
        email:      email,
        password:   hashed,
        registered: Date.now(),
        lastLogin:  Date.now()
      };
      savePlayers(players);
      enterMain(ign, true);
    }
  }, 1000);
}

// ── FORGOT PASSWORD ──
function showForgot() {
  const ign = document.getElementById('ignInput').value.trim();
  document.getElementById('fpIgn').value = ign;  // Pre-fill IGN
  document.getElementById('cardLogin').style.display  = 'none';
  document.getElementById('cardForgot').style.display = 'block';
  resetFpSteps();
}

function showLogin() {
  document.getElementById('cardForgot').style.display = 'none';
  document.getElementById('cardLogin').style.display  = 'block';
}

function resetFpSteps() {
  document.getElementById('fpStep1').style.display = 'block';
  document.getElementById('fpStep2').style.display = 'none';
  document.getElementById('fpEmail').value   = '';
  document.getElementById('fpNewPass').value = '';
  document.getElementById('fpConfPass').value= '';
  document.getElementById('fpMsg1').textContent = '';
  document.getElementById('fpMsg2').textContent = '';
}

// Step 1 — verify IGN + email
function fpVerify() {
  const ign   = document.getElementById('fpIgn').value.trim().toLowerCase();
  const email = document.getElementById('fpEmail').value.trim().toLowerCase();
  const msg   = document.getElementById('fpMsg1');

  if (!ign || ign.length < 3) { fpMsg1('⚠ Enter your IGN.', 'err'); return; }
  if (!email)                  { fpMsg1('⚠ Enter your email.', 'err'); return; }

  const players = getPlayers();
  if (!players[ign]) { fpMsg1('❌ No account found with that IGN.', 'err'); return; }
  if (players[ign].email !== email) { fpMsg1('❌ Email does not match our records.', 'err'); return; }

  // Verified — move to step 2
  document.getElementById('fpVerifiedIgn').textContent = players[ign].ign;
  document.getElementById('fpStep1').style.display = 'none';
  document.getElementById('fpStep2').style.display = 'block';
}

function fpMsg1(t, c) {
  const m = document.getElementById('fpMsg1');
  m.textContent = t;
  m.className   = 'login-msg' + (c ? ' ' + c : '');
}

// Step 2 — set new password
async function fpReset() {
  const ign     = document.getElementById('fpIgn').value.trim().toLowerCase();
  const newPass = document.getElementById('fpNewPass').value;
  const confPass= document.getElementById('fpConfPass').value;
  const msg     = document.getElementById('fpMsg2');

  if (!newPass || newPass.length < 4) { fpMsg2('⚠ Password must be at least 4 characters.', 'err'); return; }
  if (newPass !== confPass)            { fpMsg2('⚠ Passwords do not match.', 'err'); return; }

  const btn = document.querySelector('#fpStep2 .enter-btn');
  btn.disabled    = true;
  btn.textContent = '⏳ Updating...';

  const hashed  = await hashPass(newPass);
  const players = getPlayers();
  players[ign].password = hashed;
  savePlayers(players);

  fpMsg2('✅ Password updated! You can now log in.', 'ok');
  btn.textContent = '▶ Go to Login';
  btn.disabled    = false;
  btn.onclick     = () => {
    showLogin();
    document.getElementById('ignInput').value  = players[ign].ign;
    document.getElementById('passInput').value = '';
    onIgn(players[ign].ign);
    btn.onclick = fpReset;
    btn.textContent = '🔒 Update Password';
  };
}

function fpMsg2(t, c) {
  const m = document.getElementById('fpMsg2');
  m.textContent = t;
  m.className   = 'login-msg' + (c ? ' ' + c : '');
}

// ── LOGOUT ──
function doLogout() {
  const main   = document.getElementById('screen-main');
  const login  = document.getElementById('screen-login');
  const heroBg = document.getElementById('heroBg');

  main.classList.remove('in');
  heroBg.classList.remove('zoomed');

  setTimeout(() => {
    main.style.zIndex = '5';
    login.classList.remove('out');

    document.getElementById('ignInput').value       = '';
    document.getElementById('passInput').value      = '';
    document.getElementById('emailInput').value     = '';
    document.getElementById('enterBtn').disabled    = false;
    document.getElementById('enterBtn').textContent = '▶ ENTER WORLD';
    setMsg('', '');

    document.getElementById('skinAv').textContent   = '🧑';
    document.getElementById('skinNm').textContent   = 'Who are you?';
    document.getElementById('skinSt').textContent   = 'Enter your IGN below';
    document.getElementById('regHint').textContent  = '';
    document.getElementById('regHint').className    = 'reg-hint';
    document.getElementById('skinRow').classList.remove('lit');
    document.getElementById('emailWrap').style.display  = 'none';
    document.getElementById('forgotWrap').style.display = 'none';

    // Make sure login card is shown (not forgot card)
    document.getElementById('cardLogin').style.display  = 'block';
    document.getElementById('cardForgot').style.display = 'none';
  }, 600);
}

// ── ENTER MAIN SCREEN ──
function enterMain(ign, isNew) {
  document.getElementById('navIgn').textContent      = ign;
  document.getElementById('heroWelcome').textContent = isNew
    ? 'Welcome to HPmcpe, ' + ign + '! 🎉'
    : 'Welcome back, ' + ign + '! 👋';

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
  navigator.clipboard.writeText('description-todd.gl.joinmc.link').catch(() => {});
  const tip = el.querySelector('.ip-tip');
  if (tip) { tip.style.opacity = '1'; setTimeout(() => tip.style.opacity = '0', 2000); }
}

async function updateServerStatus() {
  const serverIP = "description-todd.gl.joinmc.link";

  try {
    const res = await fetch(`https://api.mcstatus.io/v2/status/java/${serverIP}`);
    const data = await res.json();

    const onlineText = data.online
      ? `${data.players.online}/${data.players.max}`
      : "Offline";

    document.getElementById("onlineCnt").textContent = onlineText;

    // login screen top status pill
    const pill = document.querySelector(".status-pill");
    if (pill) {
      pill.innerHTML = data.online
        ? `<span class="s-dot"></span>Server Online`
        : `<span class="s-dot" style="background:red"></span>Server Offline`;
    }
  } catch (e) {
    document.getElementById("onlineCnt").textContent = "Error";
  }
}

function miniCopy(el) {
  navigator.clipboard.writeText('description-todd.gl.joinmc.link').catch(() => {});
  const o = el.textContent;
  el.textContent = '✔ Copied!';
  setTimeout(() => el.textContent = o, 2000);
}

updateServerStatus();
setInterval(updateServerStatus, 30000);