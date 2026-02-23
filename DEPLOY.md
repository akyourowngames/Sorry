# Deploy Guide (Render Web Service + Vercel)

## 1) Firebase setup (message persistence)
1. In Firebase Console, create a project and enable Firestore (production mode).
2. Create a service account key:
`Project Settings -> Service Accounts -> Generate new private key`
3. You will use:
- `project_id` -> `FIREBASE_PROJECT_ID`
- `client_email` -> `FIREBASE_CLIENT_EMAIL`
- `private_key` -> `FIREBASE_PRIVATE_KEY` (keep `\n` escaped)

## 2) Deploy backend on Render (Web Service, not Blueprint)
1. Render -> New -> **Web Service** -> connect this repo.
2. Settings:
- Runtime: `Node`
- Build Command: `npm install`
- Start Command: `npm run start`
3. Environment Variables:
- `NODE_ENV=production`
- `FRONTEND_ORIGIN=https://<your-short-vercel-name>.vercel.app`
- `FIREBASE_PROJECT_ID=...`
- `FIREBASE_CLIENT_EMAIL=...`
- `FIREBASE_PRIVATE_KEY=...`
4. Deploy. Copy service URL, e.g. `https://pki-chat.onrender.com`

## 3) Deploy frontend on Vercel (short name)
Suggested short names:
- `pki-chat`
- `pookie`
- `amsg`

1. Vercel -> Add New -> Project -> import this repo.
2. Framework preset: `Vite`.
3. Environment Variable:
- `VITE_SOCKET_URL=https://<your-render-service>.onrender.com`
4. Deploy.

## 4) Important
- Open frontend from Vercel URL.
- Chat websocket/API goes to Render URL via `VITE_SOCKET_URL`.
- Render health check endpoint: `/health`
