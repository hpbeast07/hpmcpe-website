// merged script

const STORE_KEY = 'hpmcpe_players';

function getPlayers() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
  catch { return {}; }
}

function savePlayers(obj) {
  localStorage.setItem(STORE_KEY, JSON.stringify(obj));
}

function hashPass(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(16);
}

function onIgn(val) {
  console.log("IGN:", val);
}

function doLogin() {
  const ign  = document.getElementById('ignInput').value.trim();
  const pass = document.getElementById('passInput').value;

  if (!ign || ign.length < 3) return alert("Invalid IGN");
  if (!pass || pass.length < 4) return alert("Invalid Pass");

  const players = getPlayers();
  const key = ign.toLowerCase();
  const hashed = hashPass(pass);

  if (players[key]) {
    if (players[key].password === hashed) {
      enterMain(ign);
    } else alert("Wrong password");
  } else {
    players[key] = { ign, password: hashed };
    savePlayers(players);
    enterMain(ign);
  }
}

function enterMain(ign) {
  document.getElementById('navIgn').textContent = ign;
  document.getElementById('heroWelcome').textContent = "Welcome " + ign;
  document.getElementById('onlineCnt').textContent = Math.floor(Math.random()*50);

  document.getElementById('screen-login').style.display = "none";
  document.getElementById('screen-main').style.display = "block";
}

function doLogout() {
  document.getElementById('screen-login').style.display = "block";
  document.getElementById('screen-main').style.display = "none";
}
