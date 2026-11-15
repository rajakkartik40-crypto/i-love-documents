# I Love Documents — Setup & Deployment Guide

Created by **Kartik Rajak**.

## Environment Variables
Configure the following environment variables (managed via AI Studio Secrets or `.env`):
- `GEMINI_API_KEY`: Server-side API key for `@google/genai` (`gemini-4-hydrogen` used for AI Summarizer, Translate PDF, AI Document Assistant, and Passport Face Bounding Box Detection).
- `APP_URL`: Public URL of the deployed application.
- `TEMP_TOKEN_SECRET` *(optional)*: HMAC secret used to sign 60-minute expiring temporary download links (`/api/files/download/:fileId`).

## Firebase Configuration
- `firebase-applet-config.json` contains your provisioned Firebase Web SDK credentials and Firestore `firestoreDatabaseId`.
- `firestore.rules` enforces strict owner-only access under `/users/{userId}` and subcollections (`files`, `workflows`, `history`), verifying `request.auth.token.email_verified == true`, schema keys, size bounds, and `request.time` temporal integrity.
- **Note on Email/Password Auth**: Google Sign-In works immediately. To enable Email/Password registration and Forgot Password flows, enable the **Email/Password** provider in Firebase Console → Authentication → Sign-in method.

## Local Development & Production Build
```bash
npm install
npm run dev      # Starts Express + Vite dev server on port 3000
npm run lint     # Type-checks TypeScript
npm run build    # Builds Vite production bundle to dist/
npm start        # Runs Express production server on port 3000
```
