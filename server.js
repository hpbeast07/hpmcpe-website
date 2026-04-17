const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const RESET_TOKEN_TTL_MS = 1000 * 60 * 10;
const MAX_JSON_BODY_BYTES = 1024 * 1024;
const PORT = Number(process.env.PORT || 3000);
const SESSION_COOKIE = "hpmcpe_session";
const SESSION_SECRET = process.env.SESSION_SECRET || "change-this-session-secret";
const PBKDF2_ITERATIONS = 120000;
const RATE_LIMIT_WINDOW_MS = 1000 * 60 * 10;
const RATE_LIMIT_MAX_ATTEMPTS = 25;
const AUTH_ROUTES = new Set([
  "/api/auth/register",
  "/api/auth/login",
  "/api/auth/forgot/verify",
  "/api/auth/forgot/reset"
]);
const STATIC_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp"
};

const resetTokens = new Map();
const rateLimits = new Map();

async function ensureDataFile() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  try {
    await fsp.access(USERS_FILE, fs.constants.F_OK);
  } catch {
    await fsp.writeFile(USERS_FILE, JSON.stringify({ users: {} }, null, 2));
  }
}

async function readUsers() {
  await ensureDataFile();
  try {
    const raw = await fsp.readFile(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && parsed.users ? parsed : { users: {} };
  } catch {
    return { users: {} };
  }
}

async function writeUsers(data) {
  await ensureDataFile();
  await fsp.writeFile(USERS_FILE, JSON.stringify(data, null, 2));
}

function normalizeIgn(ign) {
  return String(ign || "").trim().toLowerCase();
}

function validIgn(ign) {
  return /^[A-Za-z0-9_]{3,16}$/.test(String(ign || "").trim());
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function validPassword(password) {
  return typeof password === "string" && password.length >= 8;
}

function makePasswordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 64, "sha512").toString("hex");
  return `${PBKDF2_ITERATIONS}:${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [iterationsText, salt, expectedHash] = String(storedHash || "").split(":");
  const iterations = Number(iterationsText);
  if (!iterations || !salt || !expectedHash) {
    return false;
  }

  const actual = crypto.pbkdf2Sync(password, salt, iterations, 64, "sha512");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(actual, expected);
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[SESSION_COOKIE];
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = crypto.createHmac("sha256", SESSION_SECRET).update(encodedPayload).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!payload || typeof payload.usernameKey !== "string" || typeof payload.expiresAt !== "number") {
      return null;
    }
    if (payload.expiresAt < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader) {
  return cookieHeader.split(";").reduce((acc, piece) => {
    const [name, ...rest] = piece.trim().split("=");
    if (!name) {
      return acc;
    }
    acc[name] = decodeURIComponent(rest.join("=") || "");
    return acc;
  }, {});
}

function buildSessionCookie(usernameKey) {
  const payload = {
    usernameKey,
    expiresAt: Date.now() + SESSION_TTL_MS
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(encodedPayload).digest("base64url");
  const token = `${encodedPayload}.${signature}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(
    SESSION_TTL_MS / 1000
  )}${secure}`;
}

function expiredSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

function signResetToken(rawToken) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(rawToken).digest("hex");
}

function issueResetToken(usernameKey) {
  const rawToken = crypto.randomBytes(24).toString("hex");
  resetTokens.set(signResetToken(rawToken), {
    usernameKey,
    expiresAt: Date.now() + RESET_TOKEN_TTL_MS
  });
  return rawToken;
}

function useResetToken(rawToken) {
  const signed = signResetToken(rawToken);
  const entry = resetTokens.get(signed);
  if (!entry) {
    return null;
  }
  resetTokens.delete(signed);
  if (entry.expiresAt < Date.now()) {
    return null;
  }
  return entry;
}

function cleanupExpiredState() {
  const now = Date.now();
  for (const [token, entry] of resetTokens.entries()) {
    if (entry.expiresAt < now) {
      resetTokens.delete(token);
    }
  }
  for (const [key, entry] of rateLimits.entries()) {
    if (entry.resetAt < now) {
      rateLimits.delete(key);
    }
  }
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];
  let totalSize = 0;
  for await (const chunk of req) {
    chunks.push(chunk);
    totalSize += chunk.length;
    if (totalSize > MAX_JSON_BODY_BYTES) {
      const error = new Error("Payload too large");
      error.statusCode = 413;
      throw error;
    }
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Invalid JSON body");
    error.statusCode = 400;
    throw error;
  }
}

function requireJsonRequest(req) {
  if (req.method !== "POST") {
    return;
  }

  const contentType = String(req.headers["content-type"] || "");
  if (!contentType.toLowerCase().includes("application/json")) {
    const error = new Error("Content-Type must be application/json.");
    error.statusCode = 415;
    throw error;
  }
}

function sanitizeUser(user) {
  return {
    ign: user.ign,
    email: user.email,
    registered: user.registered,
    lastLogin: user.lastLogin || null
  };
}

async function handleLookup(req, res, url) {
  const ign = String(url.searchParams.get("ign") || "").trim();
  if (!validIgn(ign)) {
    return sendJson(res, 200, { exists: false });
  }

  const users = await readUsers();
  const user = users.users[normalizeIgn(ign)];
  return sendJson(res, 200, { exists: Boolean(user) });
}

async function handleRegister(req, res) {
  const body = await readJsonBody(req);
  const ign = String(body.ign || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!validIgn(ign)) {
    return sendJson(res, 400, { error: "IGN must be 3-16 characters and use only letters, numbers, or underscores." });
  }
  if (!validEmail(email)) {
    return sendJson(res, 400, { error: "Enter a valid email address." });
  }
  if (!validPassword(password)) {
    return sendJson(res, 400, { error: "Password must be at least 8 characters." });
  }

  const users = await readUsers();
  const usernameKey = normalizeIgn(ign);
  if (users.users[usernameKey]) {
    return sendJson(res, 409, { error: "That IGN is already registered." });
  }

  const emailTaken = Object.values(users.users).some((user) => user.email === email);
  if (emailTaken) {
    return sendJson(res, 409, { error: "That email is already registered." });
  }

  users.users[usernameKey] = {
    ign,
    email,
    passwordHash: makePasswordHash(password),
    registered: Date.now(),
    lastLogin: Date.now()
  };
  await writeUsers(users);

  return sendJson(
    res,
    201,
    { ok: true, user: sanitizeUser(users.users[usernameKey]), isNew: true },
    { "Set-Cookie": buildSessionCookie(usernameKey) }
  );
}

async function handleLogin(req, res) {
  const body = await readJsonBody(req);
  const ign = String(body.ign || "").trim();
  const password = String(body.password || "");
  if (!validIgn(ign) || !password) {
    return sendJson(res, 400, { error: "Enter your IGN and password." });
  }

  const users = await readUsers();
  const usernameKey = normalizeIgn(ign);
  const user = users.users[usernameKey];
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return sendJson(res, 401, { error: "Wrong IGN or password." });
  }

  user.lastLogin = Date.now();
  await writeUsers(users);

  return sendJson(
    res,
    200,
    { ok: true, user: sanitizeUser(user), isNew: false },
    { "Set-Cookie": buildSessionCookie(usernameKey) }
  );
}

async function handleSession(req, res) {
  const session = getSession(req);
  if (!session) {
    return sendJson(res, 200, { authenticated: false });
  }

  const users = await readUsers();
  const user = users.users[session.usernameKey];
  if (!user) {
    return sendJson(res, 200, { authenticated: false }, { "Set-Cookie": expiredSessionCookie() });
  }

  return sendJson(
    res,
    200,
    { authenticated: true, user: sanitizeUser(user) },
    { "Set-Cookie": buildSessionCookie(session.usernameKey) }
  );
}

async function handleLogout(req, res) {
  return sendJson(res, 200, { ok: true }, { "Set-Cookie": expiredSessionCookie() });
}

async function handleForgotVerify(req, res) {
  const body = await readJsonBody(req);
  const ign = normalizeIgn(body.ign);
  const email = String(body.email || "").trim().toLowerCase();

  if (!ign || !email) {
    return sendJson(res, 400, { error: "Enter your IGN and email." });
  }

  const users = await readUsers();
  const user = users.users[ign];
  if (!user || user.email !== email) {
    return sendJson(res, 404, { error: "No account matched that IGN and email." });
  }

  const resetToken = issueResetToken(ign);
  return sendJson(res, 200, { ok: true, resetToken, ign: user.ign });
}

async function handleForgotReset(req, res) {
  const body = await readJsonBody(req);
  const resetToken = String(body.resetToken || "");
  const password = String(body.password || "");

  if (!resetToken) {
    return sendJson(res, 400, { error: "Reset token is missing." });
  }
  if (!validPassword(password)) {
    return sendJson(res, 400, { error: "Password must be at least 8 characters." });
  }

  const tokenEntry = useResetToken(resetToken);
  if (!tokenEntry) {
    return sendJson(res, 400, { error: "Reset session expired. Verify your account again." });
  }

  const users = await readUsers();
  const user = users.users[tokenEntry.usernameKey];
  if (!user) {
    return sendJson(res, 404, { error: "Account no longer exists." });
  }

  user.passwordHash = makePasswordHash(password);
  await writeUsers(users);

  return sendJson(res, 200, { ok: true });
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

function applyRateLimit(req, res, url) {
  if (!AUTH_ROUTES.has(url.pathname)) {
    return false;
  }

  const key = `${getClientIp(req)}:${url.pathname}`;
  const now = Date.now();
  const existing = rateLimits.get(key);
  if (!existing || existing.resetAt < now) {
    rateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  existing.count += 1;
  if (existing.count > RATE_LIMIT_MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    sendJson(
      res,
      429,
      { error: "Too many attempts. Please wait a few minutes and try again." },
      { "Retry-After": String(retryAfterSeconds) }
    );
    return true;
  }

  return false;
}

function setSecurityHeaders(res) {
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
}

function verifySameOrigin(req) {
  if (req.method !== "POST") {
    return;
  }

  const origin = req.headers.origin;
  if (!origin) {
    return;
  }

  const requestOrigin = new URL(origin);
  const host = req.headers.host || "";
  if (requestOrigin.host !== host) {
    const error = new Error("Cross-origin requests are not allowed.");
    error.statusCode = 403;
    throw error;
  }
}

function safeJoin(root, requestedPath) {
  const resolved = path.normalize(path.join(root, requestedPath));
  if (!resolved.startsWith(root)) {
    return null;
  }
  return resolved;
}

async function serveStatic(req, res, url) {
  const requestedPath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const filePath = safeJoin(ROOT, requestedPath);
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const stat = await fsp.stat(filePath);
    if (stat.isDirectory()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = STATIC_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

async function route(req, res) {
  cleanupExpiredState();
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  setSecurityHeaders(res);
  verifySameOrigin(req);
  requireJsonRequest(req);

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, service: "hpmcpe-auth" });
  }

  if (applyRateLimit(req, res, url)) {
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/lookup") {
    return handleLookup(req, res, url);
  }
  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    return handleRegister(req, res);
  }
  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    return handleLogin(req, res);
  }
  if (req.method === "GET" && url.pathname === "/api/auth/session") {
    return handleSession(req, res);
  }
  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    return handleLogout(req, res);
  }
  if (req.method === "POST" && url.pathname === "/api/auth/forgot/verify") {
    return handleForgotVerify(req, res);
  }
  if (req.method === "POST" && url.pathname === "/api/auth/forgot/reset") {
    return handleForgotReset(req, res);
  }
  if (req.method === "GET" || req.method === "HEAD") {
    return serveStatic(req, res, url);
  }

  res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: "Method not allowed." }));
}

const server = http.createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, error.statusCode || 500, { error: error.statusCode ? error.message : "Internal server error." });
  }
});

server.listen(PORT, () => {
  console.log(`HPmcpe server running at http://localhost:${PORT}`);
  if (SESSION_SECRET === "change-this-session-secret") {
    console.warn("Warning: using default SESSION_SECRET. Set a strong secret before deploying.");
  }
});
