# HPmcpe Website

Minecraft server website with **Supabase** authentication.

## Features
- Register / Login with IGN + email + password
- IGN uniqueness check
- Auto session restore
- Password reset via email

## Setup

1. Create a Supabase project
2. Run the SQL from `setup.sql` (see steps above)
3. Disable email confirmation in Supabase Auth settings
4. Copy your Project URL and anon key into `index.html`
5. Deploy the static files (HTML, CSS, JS)

## Files
- `index.html` – main page
- `style.css` – styling
- `script.js` – Supabase auth logic

No backend server required.