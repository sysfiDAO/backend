import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

let _db   = null;
let _auth = null;

const initApp = () => {
  if (getApps().length > 0) return getApps()[0];

  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      '[firebase] FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and ' +
      'FIREBASE_PRIVATE_KEY must all be set in .env',
    );
  }

  return initializeApp({
    credential: cert({ project_id: projectId, client_email: clientEmail, private_key: privateKey }),
  });
};

export const getAdminDb = () => {
  if (!_db) _db = getFirestore(initApp());
  return _db;
};

export const getAdminAuth = () => {
  if (!_auth) _auth = getAuth(initApp());
  return _auth;
};
