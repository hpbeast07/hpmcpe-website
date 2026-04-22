// ==================== GLOBALS ====================
let lookupRequestId = 0;
let ignExists = false;
let currentSession = null;

// Helper: show status messages
function setMsg(elId, text, kind) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text;
  el.className = "login-msg" + (kind ? " " + kind : "");
}

function setAuthNote(text, isOnline) {
  const note = document.getElementById("authNote");
  if (!note) return;
  note.textContent = text;
  note.className = "auth-note " + (isOnline ? "online" : "offline");
}

function setButtonState(button, text, disabled) {
  button.textContent = text;
  button.disabled = disabled;
}

function togglePassword(inputId, button) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const showing = input.type === "text";
  input.type = showing ? "password" : "text";
  button.textContent = showing ? "Show" : "Hide";
}

// ==================== PROFILE / IGN ====================
async function checkIgnExists(ign) {
  const { data, error } = await window.supabase
    .from("profiles")
    .select("ign")
    .eq("ign", ign)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    console.error("Lookup error", error);
    return false;
  }
  return !!data;
}

async function onIgn(raw) {
  const value = raw.trim();
  const hint = document.getElementById("regHint");
  const emailWrap = document.getElementById("emailWrap");
  const forgotWrap = document.getElementById("forgotWrap");
  const status = document.getElementById("skinSt");
  const requestId = ++lookupRequestId;

  const avatar = document.getElementById("skinAv");
  const name = document.getElementById("skinNm");
  const row = document.getElementById("skinRow");
  if (!value) {
    avatar.textContent = "?";
    name.textContent = "Who are you?";
    status.textContent = "Enter your IGN below";
    row.classList.remove("lit");
    return;
  }
  const emojis = ["S", "A", "M", "C", "E", "R", "P", "N"];
  avatar.textContent = emojis[value.charCodeAt(0) % emojis.length];
  name.textContent = value.length >= 3 ? value : value + "...";
  status.textContent = value.length >= 3 ? "Checking account..." : "Too short (min 3 chars)";
  row.classList.toggle("lit", value.length >= 3);
  if (value.length < 3) return;

  try {
    const exists = await checkIgnExists(value);
    if (requestId !== lookupRequestId) return;

    ignExists = exists;
    if (exists) {
      status.textContent = "Account found. Enter your password.";
      hint.textContent = "Returning player detected. Welcome back.";
      hint.className = "reg-hint exists";
      forgotWrap.style.display = "block";
      emailWrap.style.display = "none";
    } else {
      status.textContent = "New player detected";
      hint.textContent = "First time here? Add your email and password to register.";
      hint.className = "reg-hint new";
      emailWrap.style.display = "block";
      forgotWrap.style.display = "none";
    }
  } catch (err) {
    console.error(err);
    status.textContent = "Could not reach login server";
    hint.textContent = "Backend connection failed. Check your network.";
  }
}

// ==================== REGISTER / LOGIN ====================
async function doLogin() {
  const ign = document.getElementById("ignInput").value.trim();
  const email = document.getElementById("emailInput").value.trim().toLowerCase();
  const password = document.getElementById("passInput").value;
  const button = document.getElementById("enterBtn");

  if (!/^[A-Za-z0-9_]{3,16}$/.test(ign)) {
    setMsg("loginMsg", "Enter a valid IGN (3-16 letters, numbers, or underscores).", "err");
    return;
  }
  if (!ignExists && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setMsg("loginMsg", "Enter a valid email address to register.", "err");
    return;
  }
  if (password.length < 8) {
    setMsg("loginMsg", "Password must be at least 8 characters.", "err");
    return;
  }

  setButtonState(button, "LOADING WORLD...", true);
  setMsg("loginMsg", "", "");

  try {
    if (ignExists) {
      // LOGIN
      const { data: profile, error: profileError } = await window.supabase
        .from("profiles")
        .select("email")
        .eq("ign", ign)
        .single();
      if (profileError || !profile) throw new Error("Account not found. Try registering.");
      const { error: signInError } = await window.supabase.auth.signInWithPassword({
        email: profile.email,
        password,
      });
      if (signInError) throw signInError;
    } else {
      // REGISTER (no CAPTCHA)
      const { data: signUpData, error: signUpError } = await window.supabase.auth.signUp({
        email,
        password,
        options: {
          data: { ign },
        },
      });
      if (signUpError) throw signUpError;
      if (!signUpData.user) throw new Error("Registration failed.");

      const { error: insertError } = await window.supabase.from("profiles").insert({
        id: signUpData.user.id,
        ign: ign,
        email: email,
      });
      if (insertError) throw insertError;
    }

    const { data: sessionData } = await window.supabase.auth.getSession();
    if (sessionData.session) {
      currentSession = sessionData.session;
      const { data: profile } = await window.supabase
        .from("profiles")
        .select("ign")
        .eq("id", sessionData.session.user.id)
        .single();
      enterMain(profile?.ign || ign, !ignExists);
    } else {
      throw new Error("Could not establish session.");
    }
  } catch (error) {
    console.error(error);
    setButtonState(button, "ENTER WORLD", false);
    setMsg("loginMsg", error.message, "err");
  }
}

// ==================== SESSION RESTORE ====================
async function restoreSession() {
  const { data: { session } } = await window.supabase.auth.getSession();
  if (session) {
    currentSession = session;
    const { data: profile } = await window.supabase
      .from("profiles")
      .select("ign")
      .eq("id", session.user.id)
      .single();
    if (profile) {
      enterMain(profile.ign, false);
      return;
    }
  }
  setAuthNote("Secure backend (Supabase) ready", true);
}

// ==================== LOGOUT ====================
async function doLogout() {
  await window.supabase.auth.signOut();
  const main = document.getElementById("screen-main");
  const login = document.getElementById("screen-login");
  const heroBg = document.getElementById("heroBg");

  main.classList.remove("in");
  heroBg?.classList.remove("zoomed");

  setTimeout(() => {
    main.style.zIndex = "5";
    login.classList.remove("out");
    resetLoginForm();
  }, 600);
}

// ==================== FORGOT PASSWORD ====================
async function fpVerify() {
  const ign = document.getElementById("fpIgn").value.trim();
  const email = document.getElementById("fpEmail").value.trim().toLowerCase();

  if (!ign || !email) {
    fpMsg1("Enter your IGN and registered email.", "err");
    return;
  }

  const { data: profile, error } = await window.supabase
    .from("profiles")
    .select("email")
    .eq("ign", ign)
    .single();

  if (error || profile?.email !== email) {
    fpMsg1("No account found with that IGN and email.", "err");
    return;
  }

  const { error: resetError } = await window.supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/reset-password.html",
  });

  if (resetError) {
    fpMsg1("Failed to send reset email. Try again later.", "err");
  } else {
    fpMsg1("Password reset link sent to your email. Check your inbox.", "ok");
    setTimeout(() => showLogin(), 3000);
  }
}

function fpMsg1(text, kind) {
  const msg = document.getElementById("fpMsg1");
  if (!msg) return;
  msg.textContent = text;
  msg.className = "login-msg" + (kind ? " " + kind : "");
}

function showForgot() {
  const ign = document.getElementById("ignInput").value.trim();
  document.getElementById("fpIgn").value = ign;
  document.getElementById("cardLogin").style.display = "none";
  document.getElementById("cardForgot").style.display = "block";
  resetFpSteps();
}

function showLogin() {
  document.getElementById("cardForgot").style.display = "none";
  document.getElementById("cardLogin").style.display = "block";
}

function resetFpSteps() {
  document.getElementById("fpStep1").style.display = "block";
  document.getElementById("fpStep2").style.display = "none";
  document.getElementById("fpEmail").value = "";
  document.getElementById("fpMsg1").textContent = "";
}

function resetLoginForm() {
  document.getElementById("ignInput").value = "";
  document.getElementById("passInput").value = "";
  document.getElementById("emailInput").value = "";
  setButtonState(document.getElementById("enterBtn"), "ENTER WORLD", false);
  document.getElementById("cardLogin").style.display = "block";
  document.getElementById("cardForgot").style.display = "none";
  setMsg("loginMsg", "", "");
  lookupRequestId++;
  ignExists = false;
  const avatar = document.getElementById("skinAv");
  const name = document.getElementById("skinNm");
  const status = document.getElementById("skinSt");
  const row = document.getElementById("skinRow");
  if (avatar) avatar.textContent = "?";
  if (name) name.textContent = "Who are you?";
  if (status) status.textContent = "Enter your IGN below";
  if (row) row.classList.remove("lit");
  const hint = document.getElementById("regHint");
  if (hint) {
    hint.textContent = "";
    hint.className = "reg-hint";
  }
  const emailWrap = document.getElementById("emailWrap");
  const forgotWrap = document.getElementById("forgotWrap");
  if (emailWrap) emailWrap.style.display = "none";
  if (forgotWrap) forgotWrap.style.display = "none";
}

function enterMain(ign, isNew) {
  document.getElementById("navIgn").textContent = ign;
  document.getElementById("heroWelcome").textContent = isNew
    ? `Welcome to HPmcpe, ${ign}!`
    : `Welcome back, ${ign}!`;

  document.getElementById("screen-login").classList.add("out");
  const main = document.getElementById("screen-main");
  main.style.zIndex = "20";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      main.classList.add("in");
      setTimeout(() => {
        const heroBg = document.getElementById("heroBg");
        if (heroBg) heroBg.classList.add("zoomed");
      }, 200);
    });
  });
}

// ==================== COPY IP ETC ====================
function copyIP(element) {
  navigator.clipboard.writeText("description-todd.gl.joinmc.link");
  const tip = element.querySelector(".ip-tip");
  if (tip) {
    tip.style.opacity = "1";
    setTimeout(() => (tip.style.opacity = "0"), 2000);
  }
}
function miniCopy(element) {
  navigator.clipboard.writeText("description-todd.gl.joinmc.link");
  const original = element.textContent;
  element.textContent = "Copied!";
  setTimeout(() => (element.textContent = original), 2000);
}
async function updateServerStatus() {
  const ip = "description-todd.gl.joinmc.link";
  try {
    const [javaRes, bedrockRes] = await Promise.all([
      fetch(`https://api.mcstatus.io/v2/status/java/${ip}`),
      fetch(`https://api.mcstatus.io/v2/status/bedrock/${ip}`),
    ]);
    const javaData = await javaRes.json();
    const bedrockData = await bedrockRes.json();
    const javaOnline = javaData.online ? javaData.players?.online || 0 : 0;
    const bedrockOnline = bedrockData.online ? bedrockData.players?.online || 0 : 0;
    const totalOnline = javaOnline + bedrockOnline;
    const totalMax = Math.max(javaData.players?.max || 0, bedrockData.players?.max || 0);
    document.getElementById("onlineCnt").textContent =
      totalOnline > 0 ? `${totalOnline}/${totalMax}` : "Offline";
    const pill = document.querySelector(".status-pill");
    if (pill) {
      pill.innerHTML =
        totalOnline > 0
          ? '<span class="s-dot"></span>' + totalOnline + " Players Online"
          : '<span class="s-dot" style="background:red"></span>Server Offline';
    }
  } catch {
    document.getElementById("onlineCnt").textContent = "Offline";
  }
}

// ==================== INIT ====================
restoreSession();
updateServerStatus();
setInterval(updateServerStatus, 30000);