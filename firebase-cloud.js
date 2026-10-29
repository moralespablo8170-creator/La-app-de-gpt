// Firebase core for Distribuidora Zipper.
// The app remains local-first. This module only initializes Firebase and verifies member roles;
// cloud data migration/synchronization is activated separately after its review.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  onSnapshot,
  writeBatch,
  setDoc,
  deleteDoc
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAFYoHdqS1QP04MXzHbMpcpuvzNLqElZF4',
  authDomain: 'zipper-a12f1.firebaseapp.com',
  projectId: 'zipper-a12f1',
  storageBucket: 'zipper-a12f1.firebasestorage.app',
  messagingSenderId: '729619217486',
  appId: '1:729619217486:web:6350b05ead8ecd70c1171f',
  measurementId: 'G-KX0HXC2Z54'
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const ORG_ID = 'zipper-a12f1';

async function memberFor(user) {
  if (!user) return null;
  const snap = await getDoc(doc(db, 'orgs', ORG_ID, 'members', user.uid));
  if (!snap.exists()) return null;
  const profile = snap.data();
  if (profile.active !== true || !['owner', 'seller'].includes(profile.role)) return null;
  return { uid: user.uid, email: user.email || '', ...profile };
}

async function signIn(email, password) {
  await setPersistence(auth, browserLocalPersistence);
  const credential = await signInWithEmailAndPassword(auth, String(email || '').trim(), String(password || ''));
  const profile = await memberFor(credential.user);
  if (!profile) {
    await signOut(auth);
    throw new Error('Esta cuenta no tiene un perfil activo en Distribuidora Zipper. Pide al dueño que la habilite.');
  }
  return profile;
}

async function currentMember() {
  const user = auth.currentUser;
  return user ? memberFor(user) : null;
}

const api = {
  app: firebaseApp,
  auth,
  db,
  orgId: ORG_ID,
  signIn,
  signOut: () => signOut(auth),
  currentMember,
  onAuthStateChanged: callback => onAuthStateChanged(auth, callback),
  doc,
  collection,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  writeBatch,
  setDoc,
  deleteDoc
};

window.zipperFirebaseCore = api;
window.dispatchEvent(new CustomEvent('zipper-firebase-ready', { detail: { orgId: ORG_ID } }));
