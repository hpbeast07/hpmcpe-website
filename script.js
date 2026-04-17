const emojis = ["S", "A", "M", "C", "E", "R", "P", "N"];
let lookupRequestId = 0;
let ignExists = false;
let resetToken = "";
let backendHealthy = false;

function setAuthNote(text, isOnline) {
  const note = document.getElementById("authNote");
  if (!note) {
    return;
  }
  note.textContent = text;
  note.className = "auth-note " + (isOnline ? "online" : "offline");
}

function setButtonState(button, text, disabled) {
  button.textContent = text;
  button.disabled = disabled;
}

async function apiFetch(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });
  } catch (error) {
    const networkError = new Error("Could not reach the server.");
    networkError.isNetworkError = true;
    throw networkError;
  }

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }

  if (!response.ok) {
    const requestError = new Error(data.error || "Request failed.");
    requestError.status = response.status;
    throw requestError;
  }

  return data;
}

async function checkBackendHealth() {
  try {
    await apiFetch("/api/health");
    backendHealthy = true;
    setAuthNote("Secure backend login enabled", true);
  } catch (error) {
    backendHealthy = false;
    setAuthNote("Backend offline. Start the server to log in.", false);
  }
}

function togglePassword(inputId, button) {
  const input = document.getElementById(inputId);
  if (!input) {
    return;
  }

  const showing = input.type === "text";
  input.type = showing ? "password" : "text";
  button.textContent = showing ? "Show" : "Hide";
}

function setMsg(text, kind) {
  const message = document.getElementById("loginMsg");
  message.textContent = text;
  message.className = "login-msg" + (kind ? " " + kind : "");
}

function fpMsg1(text, kind) {
  const message = document.getElementById("fpMsg1");
  message.textContent = text;
  message.className = "login-msg" + (kind ? " " + kind : "");
}

function fpMsg2(text, kind) {
  const message = document.getElementById("fpMsg2");
  message.textContent = text;
  message.className = "login-msg" + (kind ? " " + kind : "");
}

function updateIdentityPreview(value) {
  const trimmed = value.trim();
  const row = document.getElementById("skinRow");
  const avatar = document.getElementById("skinAv");
  const name = document.getElementById("skinNm");
  const status = document.getElementById("skinSt");

  if (!trimmed) {
    avatar.textContent = "?";
    name.textContent = "Who are you?";
    status.textContent = "Enter your IGN below";
    row.classList.remove("lit");
    return;
  }

  avatar.textContent = emojis[trimmed.charCodeAt(0) % emojis.length];
  name.textContent = trimmed.length >= 3 ? trimmed : trimmed + "...";
  status.textContent = trimmed.length >= 3 ? "Checking account..." : "Too short (min 3 chars)";
  row.classList.toggle("lit", trimmed.length >= 3);
}

async function onIgn(raw) {
  const value = raw.trim();
  const hint = document.getElementById("regHint");
  const emailWrap = document.getElementById("emailWrap");
  const forgotWrap = document.getElementById("forgotWrap");
  const status = document.getElementById("skinSt");
  const requestId = ++lookupRequestId;

  updateIdentityPreview(value);
  ignExists = false;
  hint.textContent = "";
  hint.className = "reg-hint";
  emailWrap.style.display = "none";
  forgotWrap.style.display = "none";

  if (!value) {
    return;
  }

  if (value.length < 3) {
    return;
  }

  try {
    const data = await apiFetch(`/api/auth/lookup?ign=${encodeURIComponent(value)}`);
    if (requestId !== lookupRequestId) {
      return;
    }

    ignExists = Boolean(data.exists);
    if (ignExists) {
      status.textContent = "Account found. Enter your password.";
      hint.textContent = "Returning player detected. Welcome back.";
      hint.className = "reg-hint exists";
      forgotWrap.style.display = "block";
      return;
    }

    status.textContent = "New player detected";
    hint.textContent = "First time here? Add your email and password to register.";
    hint.className = "reg-hint new";
    emailWrap.style.display = "block";
  } catch (error) {
    if (requestId !== lookupRequestId) {
      return;
    }
    status.textContent = "Could not reach login server";
    hint.textContent = "Backend connection failed. Start the server and try again.";
    hint.className = "reg-hint";
    setAuthNote("Backend offline. Start the server to log in.", false);
  }
}

async function doLogin() {
  const ign = document.getElementById("ignInput").value.trim();
  const email = document.getElementById("emailInput").value.trim().toLowerCase();
  const password = document.getElementById("passInput").value;
  const button = document.getElementById("enterBtn");

  if (!/^[A-Za-z0-9_]{3,16}$/.test(ign)) {
    setMsg("Enter a valid IGN using 3-16 letters, numbers, or underscores.", "err");
    return;
  }
  if (!ignExists && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setMsg("Enter a valid email address to register.", "err");
    return;
  }
  if (password.length < 8) {
    setMsg("Password must be at least 8 characters.", "err");
    return;
  }
  if (!backendHealthy) {
    setMsg("The login server is offline right now. Start the backend and try again.", "err");
    return;
  }

  setButtonState(button, "LOADING WORLD...", true);
  setMsg("", "");

  try {
    let data;
    if (ignExists) {
      data = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ ign, password })
      });
    } else {
      data = await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ ign, email, password })
      });
    }

    setAuthNote("Secure backend login enabled", true);
    enterMain(data.user.ign, data.isNew);
  } catch (error) {
    if (error.isNetworkError) {
      backendHealthy = false;
      setAuthNote("Backend offline. Start the server to log in.", false);
    }
    setButtonState(button, "ENTER WORLD", false);
    setMsg(error.message, "err");
  }
}

function showForgot() {
  const ign = document.getElementById("ignInput").value.trim();
  resetToken = "";
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
  document.getElementById("fpNewPass").value = "";
  document.getElementById("fpConfPass").value = "";
  document.getElementById("fpMsg1").textContent = "";
  document.getElementById("fpMsg2").textContent = "";
}

async function fpVerify() {
  const ign = document.getElementById("fpIgn").value.trim();
  const email = document.getElementById("fpEmail").value.trim().toLowerCase();

  if (!ign || !email) {
    fpMsg1("Enter your IGN and registered email.", "err");
    return;
  }
  if (!backendHealthy) {
    fpMsg1("The login server is offline right now.", "err");
    return;
  }

  try {
    const data = await apiFetch("/api/auth/forgot/verify", {
      method: "POST",
      body: JSON.stringify({ ign, email })
    });

    resetToken = data.resetToken;
    setAuthNote("Secure backend login enabled", true);
    document.getElementById("fpVerifiedIgn").textContent = data.ign;
    document.getElementById("fpStep1").style.display = "none";
    document.getElementById("fpStep2").style.display = "block";
    fpMsg1("", "");
  } catch (error) {
    fpMsg1(error.message, "err");
  }
}

async function fpReset() {
  const newPassword = document.getElementById("fpNewPass").value;
  const confirmPassword = document.getElementById("fpConfPass").value;
  const button = document.querySelector("#fpStep2 .enter-btn");

  if (newPassword.length < 8) {
    fpMsg2("Password must be at least 8 characters.", "err");
    return;
  }
  if (newPassword !== confirmPassword) {
    fpMsg2("Passwords do not match.", "err");
    return;
  }
  if (!resetToken) {
    fpMsg2("Reset session expired. Verify your account again.", "err");
    return;
  }

  setButtonState(button, "UPDATING...", true);

  try {
    await apiFetch("/api/auth/forgot/reset", {
      method: "POST",
      body: JSON.stringify({ resetToken, password: newPassword })
    });

    resetToken = "";
    fpMsg2("Password updated. You can log in now.", "ok");
    setButtonState(button, "GO TO LOGIN", false);
    button.onclick = () => {
      showLogin();
      document.getElementById("ignInput").value = document.getElementById("fpVerifiedIgn").textContent;
      document.getElementById("passInput").value = "";
      onIgn(document.getElementById("ignInput").value);
      button.onclick = fpReset;
      setButtonState(button, "UPDATE PASSWORD", false);
    };
  } catch (error) {
    setButtonState(button, "UPDATE PASSWORD", false);
    fpMsg2(error.message, "err");
  }
}

function resetLoginForm() {
  document.getElementById("ignInput").value = "";
  document.getElementById("passInput").value = "";
  document.getElementById("emailInput").value = "";
  setButtonState(document.getElementById("enterBtn"), "ENTER WORLD", false);
  document.getElementById("cardLogin").style.display = "block";
  document.getElementById("cardForgot").style.display = "none";
  setMsg("", "");
  lookupRequestId += 1;
  ignExists = false;
  updateIdentityPreview("");
  document.getElementById("regHint").textContent = "";
  document.getElementById("regHint").className = "reg-hint";
  document.getElementById("emailWrap").style.display = "none";
  document.getElementById("forgotWrap").style.display = "none";
}

async function doLogout() {
  const main = document.getElementById("screen-main");
  const login = document.getElementById("screen-login");
  const heroBg = document.getElementById("heroBg");

  try {
    await apiFetch("/api/auth/logout", { method: "POST", body: "{}" });
  } catch (error) {
    // Keep the UI responsive even if logout cleanup fails server-side.
  }

  main.classList.remove("in");
  heroBg.classList.remove("zoomed");

  setTimeout(() => {
    main.style.zIndex = "5";
    login.classList.remove("out");
    resetLoginForm();
  }, 600);
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
        document.getElementById("heroBg").classList.add("zoomed");
      }, 200);
    });
  });
}

async function restoreSession() {
  try {
    const data = await apiFetch("/api/auth/session");
    if (data.authenticated && data.user) {
      setAuthNote("Secure backend login enabled", true);
      enterMain(data.user.ign, false);
    }
  } catch (error) {
    // If the auth server is down we keep the login screen visible.
    backendHealthy = false;
    setAuthNote("Backend offline. Start the server to log in.", false);
  }
}

function copyIP(element) {
  navigator.clipboard.writeText("description-todd.gl.joinmc.link").catch(() => {});
  const tip = element.querySelector(".ip-tip");
  if (tip) {
    tip.style.opacity = "1";
    setTimeout(() => {
      tip.style.opacity = "0";
    }, 2000);
  }
}

function miniCopy(element) {
  navigator.clipboard.writeText("description-todd.gl.joinmc.link").catch(() => {});
  const original = element.textContent;
  element.textContent = "Copied!";
  setTimeout(() => {
    element.textContent = original;
  }, 2000);
}

async function updateServerStatus() {
  const ip = "description-todd.gl.joinmc.link";

  try {
    const [javaRes, bedrockRes] = await Promise.all([
      fetch(`https://api.mcstatus.io/v2/status/java/${ip}`),
      fetch(`https://api.mcstatus.io/v2/status/bedrock/${ip}`)
    ]);

    const javaData = await javaRes.json();
    const bedrockData = await bedrockRes.json();
    const javaOnline = javaData.online ? javaData.players?.online || 0 : 0;
    const bedrockOnline = bedrockData.online ? bedrockData.players?.online || 0 : 0;
    const javaMax = javaData.players?.max || 0;
    const bedrockMax = bedrockData.players?.max || 0;
    const totalOnline = javaOnline + bedrockOnline;
    const totalMax = Math.max(javaMax, bedrockMax);

    document.getElementById("onlineCnt").textContent = totalOnline > 0 ? `${totalOnline}/${totalMax}` : "Offline";

    const pill = document.querySelector(".status-pill");
    if (pill) {
      pill.innerHTML = totalOnline > 0
        ? '<span class="s-dot"></span>' + totalOnline + " Players Online"
        : '<span class="s-dot" style="background:red"></span>Server Offline';
    }
  } catch (error) {
    document.getElementById("onlineCnt").textContent = "Offline";
  }
}

restoreSession();
checkBackendHealth();
setInterval(checkBackendHealth, 60000);
updateServerStatus();
setInterval(updateServerStatus, 30000);
