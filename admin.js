const SUPABASE_URL = "https://wbzvnsxoxubcsctzkxcc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndienZuc3hveHViY3NjdHpreGNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MjEwNzMsImV4cCI6MjA5MjM5NzA3M30.UXQOsqZg0vTtIJ_Bqqmqg-BfLomTf7PYulKXZPNZkjg";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

// ---------- Logout ----------
async function doLogout() {
    await supabaseClient.auth.signOut();
    window.location.href = "index.html";
}

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", doLogout);
}

// ---------- Status badge helper ----------
function statusBadge(status) {

    const raw = (status || "").toString();
    const s = raw.toLowerCase();

    let cls = "badge-other";

    if (s === "paid" || s === "captured" || s === "success") {
        cls = "badge-paid";
    } else if (s === "pending" || s === "created") {
        cls = "badge-pending";
    } else if (s === "failed" || s === "cancelled" || s === "canceled") {
        cls = "badge-failed";
    }

    return `<span class="badge-status ${cls}">${raw || "Unknown"}</span>`;
}

// ---------- Stats ----------
function renderStats(purchases) {

    const statTotal = document.getElementById("statTotal");
    const statRevenue = document.getElementById("statRevenue");
    const statPaid = document.getElementById("statPaid");

    const total = purchases.length;

    let revenue = 0;
    let paidCount = 0;

    purchases.forEach(purchase => {

        const s = (purchase.status || "").toString().toLowerCase();
        const isPaid = s === "paid" || s === "captured" || s === "success";

        if (isPaid) {
            revenue += Number(purchase.amount) / 100;
            paidCount++;
        }
    });

    if (statTotal) statTotal.textContent = total;
    if (statRevenue) statRevenue.textContent = `₹${revenue.toFixed(2)}`;
    if (statPaid) statPaid.textContent = paidCount;
}

async function loadAdminDashboard() {

    const loading = document.getElementById("loading");
    const denied = document.getElementById("denied");
    const deniedText = document.getElementById("deniedText");
    const dashboard = document.getElementById("dashboard");
    const orders = document.getElementById("orders");
    const navIgn = document.getElementById("navIgn");

    loading.style.display = "block";
    denied.style.display = "none";
    dashboard.style.display = "none";

    // Check login
    const {
        data: {
            session
        }
    } = await supabaseClient.auth.getSession();

    if (!session) {

        loading.style.display = "none";

        if (deniedText) deniedText.textContent = "Please login first.";
        denied.style.display = "block";

        return;
    }

    // Check admin role
    const {
        data: profile,
        error: profileError
    } = await supabaseClient
        .from("profiles")
        .select("role, ign")
        .eq("id", session.user.id)
        .single();

    if (
        profileError ||
        !profile ||
        profile.role !== "admin"
    ) {

        console.error(
            "Admin check error:",
            profileError
        );

        loading.style.display = "none";

        if (deniedText) deniedText.textContent = "Access Denied";
        denied.style.display = "block";

        return;
    }

    // Admin confirmed
    loading.style.display = "none";
    dashboard.style.display = "block";

    if (navIgn && profile.ign) {
        navIgn.textContent = profile.ign;
    }

    // Load purchases
    const {
        data: purchases,
        error
    } = await supabaseClient
        .from("purchases")
        .select(`
            id,
            product_name,
            amount,
            currency,
            status,
            razorpay_payment_id,
            razorpay_order_id,
            paid_at
        `)
        .order("paid_at", {
            ascending: false
        });

    if (error) {

        console.error(
            "Orders error:",
            error
        );

        orders.innerHTML = `
            <tr>
                <td colspan="6" class="error-row">
                    Failed to load orders.
                </td>
            </tr>
        `;

        return;
    }

    if (
        !purchases ||
        purchases.length === 0
    ) {

        renderStats([]);

        orders.innerHTML = `
            <tr>
                <td colspan="6" class="empty-row">
                    No purchases found.
                </td>
            </tr>
        `;

        return;
    }

    renderStats(purchases);

    orders.innerHTML = "";

    purchases.forEach(purchase => {

        const amount =
            Number(purchase.amount) / 100;

        const row =
            document.createElement("tr");

        row.innerHTML = `
            <td>
                ${purchase.product_name}
            </td>

            <td>
                ₹${amount.toFixed(2)}
            </td>

            <td>
                ${statusBadge(purchase.status)}
            </td>

            <td class="mono">
                ${purchase.razorpay_payment_id || "—"}
            </td>

            <td class="mono">
                ${purchase.razorpay_order_id || "—"}
            </td>

            <td>
                ${purchase.paid_at ? new Date(
                    purchase.paid_at
                ).toLocaleString("en-IN") : "—"}
            </td>
        `;

        orders.appendChild(row);

    });
}

const refreshBtn = document.getElementById("refreshBtn");
if (refreshBtn) {
    refreshBtn.addEventListener("click", loadAdminDashboard);
}

loadAdminDashboard();