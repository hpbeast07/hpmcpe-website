const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

async function loadAdminDashboard() {

    const loading = document.getElementById("loading");
    const denied = document.getElementById("denied");
    const dashboard = document.getElementById("dashboard");
    const orders = document.getElementById("orders");

    // Check login
    const {
        data: {
            session
        }
    } = await supabase.auth.getSession();

    if (!session) {
        loading.style.display = "none";
        denied.textContent = "❌ Please login first.";
        denied.style.display = "block";
        return;
    }

    // Check admin role
    const {
        data: profile,
        error: profileError
    } = await supabase
        .from("profiles")
        .select("role, ign")
        .eq("id", session.user.id)
        .single();

    if (profileError || !profile || profile.role !== "admin") {

        loading.style.display = "none";
        denied.textContent = "❌ Access Denied";
        denied.style.display = "block";

        return;
    }

    // Admin confirmed
    loading.style.display = "none";
    dashboard.style.display = "block";

    // Load purchases
    const {
        data: purchases,
        error
    } = await supabase
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

        console.error("Orders error:", error);

        orders.innerHTML = `
            <tr>
                <td colspan="6" class="error">
                    Failed to load orders.
                </td>
            </tr>
        `;

        return;
    }

    if (!purchases || purchases.length === 0) {

        orders.innerHTML = `
            <tr>
                <td colspan="6">
                    No purchases found.
                </td>
            </tr>
        `;

        return;
    }

    orders.innerHTML = "";

    purchases.forEach(purchase => {

        const amount =
            Number(purchase.amount) / 100;

        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${purchase.product_name}</td>

            <td>
                ₹${amount.toFixed(2)}
            </td>

            <td class="paid">
                ${purchase.status}
            </td>

            <td>
                ${purchase.razorpay_payment_id}
            </td>

            <td>
                ${purchase.razorpay_order_id}
            </td>

            <td>
                ${new Date(
                    purchase.paid_at
                ).toLocaleString("en-IN")}
            </td>
        `;

        orders.appendChild(row);

    });
}

loadAdminDashboard();