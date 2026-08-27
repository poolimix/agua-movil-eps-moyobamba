import { getApps, initializeApp, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json';

let adminApp: App | null = null;

if (!getApps().length) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const serviceAccount = require(serviceAccountPath);
    adminApp = initializeApp({
      credential: cert(serviceAccount),
    });
    console.log('✅ Firebase Admin SDK initialized');
  } catch (e) {
    console.warn('⚠️  Firebase Admin SDK not initialized. Place firebase-service-account.json in backend root.');
  }
} else {
  adminApp = getApps()[0];
}

export const auth = adminApp ? getAuth(adminApp) : null;
export default adminApp;
