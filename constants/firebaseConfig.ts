import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

// TODO: Replace with your Firebase project config
const firebaseConfig = {
  apiKey: "AIzaSyAZWbRzY6L0M-3biNEx6iNnStlW0LwJTeI",
  authDomain: "mathtatag-2025.firebaseapp.com",
  projectId: "mathtatag-2025",
  storageBucket: "mathtatag-2025.firebasestorage.app",
  messagingSenderId: "760754624848",
  appId: "1:760754624848:web:e9ccbc079c912e5de5f455",
  measurementId: "G-TN0JLXZ4SW"
};

// Initialize Firebase only once
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Use getAuth for all platforms
const auth = getAuth(app);

export const db = getDatabase(app);

export { auth };

