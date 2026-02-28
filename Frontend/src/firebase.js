import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getAnalytics } from "firebase/analytics"

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
// Force the auth language code to en-IN to aid SMS routing
auth.languageCode = 'en-IN'
// Disable app verification for testing to bypass ReCAPTCHA visual puzzles on emulators
auth.settings.appVerificationDisabledForTesting = true;

import { getFirestore } from "firebase/firestore"
// Removed experimentalForceLongPolling because it causes severe latency on mobile
export const db = getFirestore(app)

export const analytics = getAnalytics(app)

// Connect to emulators on localhost for testing
// Set VITE_USE_EMULATOR=false in .env to use live Firebase on localhost
const useEmulator = import.meta.env.VITE_USE_EMULATOR === 'true'

if (useEmulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
    auth.settings.appVerificationDisabledForTesting = true
    console.info('[Firebase] Using Auth + Firestore emulators')
}
