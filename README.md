# Backend (Render)

Node.js + Express API with two endpoints:

- `POST /api/send-otp` – body `{ "phone": "+95912345678" }`
- `POST /api/verify-otp` – body `{ "phone": "+95912345678", "code": "123456" }`

By default, OTPs are just logged to the server console (no SMS is actually sent).
To send real text messages, sign up with an SMS provider (Twilio is the easiest)
and follow the commented-out code inside `server.js`.

## Run locally

```bash
cd backend
npm install
cp .env.example .env
npm start
```

Server runs on `http://localhost:3000`.

## Deploy to GitHub + Render

1. Create a new GitHub repo, e.g. `iphone-giveaway-backend`.
2. From this `backend` folder:
   ```bash
   git init
   git add .
   git commit -m "Initial backend"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/iphone-giveaway-backend.git
   git push -u origin main
   ```
3. Go to [render.com](https://render.com) → **New** → **Web Service** → connect this GitHub repo.
4. Settings:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Add any environment variables from `.env.example` under **Environment** in the Render dashboard (only needed once you wire up a real SMS provider).
6. Deploy. Render gives you a URL like `https://iphone-giveaway-backend.onrender.com`.
7. Copy that URL into `frontend/config.js` as `window.API_BASE_URL`.

## Notes
- The OTP store is in-memory, so it resets whenever the server restarts. Fine for testing; use Redis or a database for production.
- Render's free tier spins down when idle, so the first request after inactivity can take ~30–50 seconds to wake up.
