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

    btn.addEventListener("click", async function (e) {

        e.preventDefault();

        // Login required
        if (!currentSession) {
            alert("Please login first.");
            return;
        }

        const productId = btn.dataset.product;

        if (!productId) {
            alert("Product ID is missing.");
            console.error("Missing data-product on button:", btn);
            return;
        }

        const originalText = btn.textContent;

        try {

            // Prevent double-click
            btn.disabled = true;
            btn.textContent = "Creating Order...";

            // Ask Supabase Edge Function to create Razorpay order
            const {
                data,
                error
            } = await window.supabase.functions.invoke(
                "create-razorpay-order",
                {
                    body: {
                        product_id: productId
                    }
                }
            );

            if (error) {
                console.error(
                    "Create order error:",
                    error
                );

                alert(
                    "Unable to create payment order."
                );

                return;
            }

            if (!data || !data.success) {

                console.error(
                    "Server response:",
                    data
                );

                alert(
                    data?.error ||
                    "Unable to create payment order."
                );

                return;
            }

            // -----------------------------------------
            // Razorpay Checkout
            // -----------------------------------------

            const options = {

                key: data.key_id,

                amount: data.amount,

                currency: data.currency,

                name: "HPmcpe",

                description: data.product_name,

                order_id: data.order_id,

                prefill: {
                    name: data.ign,
                    email: currentSession.user.email || ""
                },

                theme: {
                    color: "#16a34a"
                },

                handler: async function (response) {
                    console.log(
                        "Razorpay response:",
                        response
                    );

                    alert(
                        "Payment received.\n\n" +
                        "Verifying payment..."
                    );

                    // IMPORTANT:
                    // Payment verification will be done
                    // by Supabase Edge Function.
                    try {

                        const {
                            data,
                            error
                        } = await window.supabase.functions.invoke(
                            "verify-razorpay-payment",
                            {
                                body: {
                                    razorpay_payment_id:
                                        response.razorpay_payment_id,

                                    razorpay_order_id:
                                        response.razorpay_order_id,

                                    razorpay_signature:
                                        response.razorpay_signature,

                                    product_id: productId

                                    user_id: currentSession.user.id
                                }
                            }
                        );

                        if (error) {

                            console.error(
                                "Verification error:",
                                error
                            );

                            alert(
                                "Payment verification failed."
                            );

                            return;
                        }

                        if (!data || !data.success) {

                            console.error(
                                "Verification response:",
                                data
                            );

                            alert(
                                data?.error ||
                                "Payment could not be verified."
                            );

                            return;
                        }

                        alert(
                            "Payment verified successfully! ✅"
                        );

                        console.log(
                            "Verified payment:",
                            data
                        );

                    } catch (err) {

                        console.error(
                            "Verification error:",
                            err
                        );

                        alert(
                            "Unable to verify payment."
                        );
                    }
                },

                modal: {

                    ondismiss: function () {

                        console.log(
                            "Razorpay checkout closed."
                        );

                    }

                }

            };

            const razorpay =
                new Razorpay(options);

            razorpay.open();

        } catch (error) {

            console.error(
                "Payment error:",
                error
            );

            alert(
                "Something went wrong while opening payment."
            );

        } finally {

            btn.disabled = false;
            btn.textContent = originalText;

        }

    });

});

// ---------- Start ----------
restoreStoreSession();