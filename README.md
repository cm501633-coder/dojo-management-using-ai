# Dojo Management

A first Android app for dojo staff to keep student, attendance, and fee records in one place. Phones sync through a small API to a MySQL database running on the dojo's computer. The app does not connect to MySQL directly.

## What it does

- Sign in as the dojo administrator; the server creates the first account from `.env`.
- Add students with a name, optional phone, and belt/rank; archive students without removing their history.
- Mark each active student present once per day and see the attendance list for today.
- Record payments by student, amount, fee period, date, and payment method.
- View active-student, today's-attendance, and current-month payment totals.

Records are stored on the dojo computer and shared by all phones that can reach it. The app needs a live connection to the server; offline edits and automatic conflict resolution are not included. Fee amounts are stored as decimal values without a currency code, so use the same currency consistently.

## Run the MySQL server on Windows

1. Install and start Docker Desktop.
2. From the repository folder, copy `.env.example` to `.env`. Edit `.env` and fill every blank with unique values. The administrator password must be at least 12 characters and no more than 72 UTF-8 bytes; the JWT secret must be at least 32 characters. Keep `.env` private and do not commit it. Docker Compose will refuse to start while any required value is blank.
3. Start the database and API:

   ```powershell
   docker compose up --build -d
   ```

   The first start creates the MySQL tables and administrator account. The database is kept in a Docker volume across restarts. Check startup with `docker compose logs -f api`; the API health check is at `http://localhost:3000/api/health`.

MySQL's port is not published to the network. Only the API on port 3000 accepts connections from phones. Do not forward ports on your router or expose this HTTP API to the public internet. On Windows, allow inbound TCP 3000 only on the **Private** network profile if Windows Firewall asks. Keep the dojo computer powered on and connected to the same trusted Wi-Fi as the phones.

## Run on an Android phone

Install Node.js 22 or later, then install Expo Go from the Play Store. On the dojo computer, find its private Wi-Fi IPv4 address (for example, with `ipconfig`). From the repository:

```powershell
cd android
npm install
$env:EXPO_PUBLIC_API_URL = "http://192.168.1.50:3000/api"
npm start
```

Replace `192.168.1.50` with the computer's actual private address. Scan the Expo QR code with Expo Go. Both devices must be on the same Wi-Fi; guest networks and client-isolation settings can block phone-to-computer connections. The Android emulator can use the default `http://10.0.2.2:3000/api` address instead.

The sign-in screen lets you enter and save the dojo server address on each phone, so you can install the same APK everywhere without knowing the computer's IP when building it. Use the address above, ending in `/api`.

For an installable debug APK, use the **Android APK** GitHub Actions workflow from the repository's Actions tab. It uploads `app-debug.apk` as a downloadable workflow artifact. This build is for testing and uses Android's debug signing key. Alternatively, configure `EXPO_PUBLIC_API_URL` and run `npx eas-cli@latest build --platform android --profile preview` from `android`; Expo's build service requires an Expo account and will prompt to create or select Android signing credentials.

Use only a trusted private network for this starter setup: local API traffic uses plain HTTP, so credentials and records are not encrypted in transit. Android cleartext traffic is enabled for this local-network setup. Before use over the internet or an untrusted network, put the API behind HTTPS, update the app's API URL, and disable cleartext traffic. Protect the computer with full-disk encryption and make separate backups of the database volume; the project does not configure automatic backups.

## Administrator and data notes

- Fill all `.env` values before the first start. The administrator is seeded only when the database has no account with that username; changing `.env` later does not change an existing password.
- The app has one shared administrator login and no staff roles, in-app password reset, or account-management screen. The server rate-limits login attempts and stores password hashes rather than plaintext passwords.
- Attendance is limited to one entry per student per calendar date. Payments and attendance are retained when a student is archived. Records cannot currently be edited or deleted in the app.
- `docker compose down` stops services but preserves records. Do not use `docker compose down -v` unless you intend to permanently delete the database volume.

## Developer checks

```powershell
cd server
npm install
npm run typecheck
npm test
```

```powershell
cd android
npm install
npm run typecheck
```
