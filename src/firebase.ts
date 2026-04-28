import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getRedirectResult,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithCustomToken,
  signInWithRedirect,
  signInWithPopup,
  signOut,
  browserLocalPersistence,
  type Unsubscribe,
  type User,
  type UserCredential,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import firebaseConfig from "../firebase-applet-config.json";

type FirebaseAppletConfig = typeof firebaseConfig & {
  firestoreDatabaseId?: string;
};

const typedFirebaseConfig = firebaseConfig as FirebaseAppletConfig;
const app = initializeApp(typedFirebaseConfig);
export const auth = getAuth(app);
export const db = typedFirebaseConfig.firestoreDatabaseId
  ? getFirestore(app, typedFirebaseConfig.firestoreDatabaseId)
  : getFirestore(app);
export const storage = getStorage(app);
export const googleAuthProvider = new GoogleAuthProvider();

googleAuthProvider.setCustomParameters({
  prompt: "select_account",
});

let authReadyPromise: Promise<User | null> | null = null;
let authPersistencePromise: Promise<void> | null = null;

async function ensureAuthPersistence(): Promise<void> {
  if (!authPersistencePromise) {
    authPersistencePromise = setPersistence(auth, browserLocalPersistence).catch((error) => {
      authPersistencePromise = null;
      throw error;
    });
  }
  await authPersistencePromise;
}

function prefersRedirectGoogleSignIn(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  if (standalone) return true;

  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

function shouldFallbackToRedirect(error: unknown): boolean {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';

  return code === 'auth/popup-blocked'
    || code === 'auth/operation-not-supported-in-this-environment'
    || code === 'auth/web-storage-unsupported';
}

export function ensureFirebaseAuthReady(): Promise<User | null> {
  if (!authReadyPromise) {
    authReadyPromise = new Promise<User | null>((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          unsubscribe();
          resolve(user);
        },
        (error) => {
          unsubscribe();
          reject(error);
        },
      );
    });
  }

  return authReadyPromise;
}

export function subscribeToFirebaseAuth(
  listener: (user: User | null) => void,
): Unsubscribe {
  return onAuthStateChanged(auth, listener);
}

export function getCurrentFirebaseUser(): User | null {
  return auth.currentUser;
}

export async function getCurrentFirebaseIdToken(
  forceRefresh = false,
): Promise<string | null> {
  await ensureFirebaseAuthReady();
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

export async function signInWithGoogle(): Promise<UserCredential | null> {
  await ensureAuthPersistence();
  if (prefersRedirectGoogleSignIn()) {
    await signInWithRedirect(auth, googleAuthProvider);
    return null;
  }

  try {
    return await signInWithPopup(auth, googleAuthProvider);
  } catch (error) {
    if (!shouldFallbackToRedirect(error)) throw error;
    await signInWithRedirect(auth, googleAuthProvider);
    return null;
  }
}

export async function consumeGoogleRedirectResult(): Promise<UserCredential | null> {
  await ensureAuthPersistence();
  return getRedirectResult(auth);
}

export async function signInWithFirebaseCustomToken(
  customToken: string,
): Promise<UserCredential> {
  await ensureAuthPersistence();
  return signInWithCustomToken(auth, customToken);
}

export async function signOutFromFirebase(): Promise<void> {
  await signOut(auth);
}
