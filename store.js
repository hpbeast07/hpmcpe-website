// ===============================
// HPmcpe Store
// ===============================

let currentSession = null;

// ---------- Restore Session ----------
async function restoreStoreSession() {

    // Guest Mode
    if (localStorage.getItem("guestMode")) {

        const navIgn = document.getElementById("navIgn");
        if (navIgn) navIgn.textContent = "Guest";

        const loginBtn = document.getElementById("loginBtn");
        const logoutBtn = document.querySelector(".logout-btn");

        if (loginBtn) loginBtn.style.display = "inline-block";
        if (logoutBtn) logoutBtn.style.display = "none";

        return;
    }

    // Logged In Player
    const {
        data: { session }
    } = await window.supabase.auth.getSession();

    if (!session) {

        const navIgn = document.getElementById("navIgn");
        if (navIgn) navIgn.textContent = "Guest";

        const loginBtn = document.getElementById("loginBtn");
        const logoutBtn = document.querySelector(".logout-btn");

        if (loginBtn) loginBtn.style.display = "inline-block";
        if (logoutBtn) logoutBtn.style.display = "none";

        return;
    }

    currentSession = session;

    const { data: profile } = await window.supabase
        .from("profiles")
        .select("ign")
        .eq("id", session.user.id)
        .single();

    if (profile) {

        document.getElementById("navIgn").textContent = profile.ign;

        document.getElementById("loginBtn").style.display = "none";
        document.querySelector(".logout-btn").style.display = "inline-block";
    }
}

// ---------- Logout ----------
async function doLogout() {

    await window.supabase.auth.signOut();

    localStorage.removeItem("guestMode");

    window.location.href = "index.html";
}

// ---------- Login Button ----------
const loginBtn = document.getElementById("loginBtn");

if (loginBtn) {

    loginBtn.onclick = function () {

        localStorage.removeItem("guestMode");

        window.location.href = "index.html";
    };
}

// ---------- Buy Buttons ----------
document.querySelectorAll(".buy").forEach(btn => {

    btn.addEventListener("click", function (e) {

        e.preventDefault();

        alert("Payment system coming soon!");
    });

});

// ---------- Start ----------
restoreStoreSession();