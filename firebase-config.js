/**
 * Inicialización de Firebase Modular (v9+)
 * 
 * ATENCIÓN: Las credenciales aquí no son secretas; la protección de datos 
 * depende de las reglas de seguridad de Firestore (firestore.rules) y Authentication.
 */

// Importar las funciones de inicialización y los servicios desde los servidores de Google
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Estos servicios los usa auth.js internamente
import * as authApi from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import * as dbApi from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Tu configuración web de Firebase (Tus llaves reales)
const firebaseConfig = {
  apiKey: "AIzaSyDqbd_YLpTOQwy7PVCDTTuMIfLK-msOVB0",
  authDomain: "amarte-app.firebaseapp.com",
  projectId: "amarte-app",
  storageBucket: "amarte-app.firebasestorage.app",
  messagingSenderId: "260196850853",
  appId: "1:260196850853:web:4ae7959707227b1ec6414c",
  measurementId: "G-E65QT1LWT2"
};

let initialized = false;
let services = null;

export async function initializeFirebase() {
  if (initialized) return services;
  try {
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    services = { app, auth, db, authApi, dbApi, enabled: true };
    initialized = true;
    return services;
  } catch (error) {
    console.error("No se pudo iniciar Firebase. Verifica firebaseConfig.", error);
    return { enabled: false, reason: 'error' };
  }
}

export const db = getFirestore(initializeApp(firebaseConfig));