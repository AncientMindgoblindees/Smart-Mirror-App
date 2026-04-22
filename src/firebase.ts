import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithCustomToken,
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

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);
export const googleAuthProvider = new GoogleAuthProvider();

googleAuthProvider.setCustomParameters({
  prompt: "select_account",
});

let authReadyPromise: Promise<User | null> | null = null;

async function ensureAuthPersistence(): Promise<void> {
  await setPersistence(auth, browserLocalPersistence);
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

export async function signInWithGoogle(): Promise<UserCredential> {
  await ensureAuthPersistence();
  return signInWithPopup(auth, googleAuthProvider);
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
