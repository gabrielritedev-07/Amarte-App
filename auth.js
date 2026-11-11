/**
 * A...MARTE · Identidad, vinculación, Firestore y demostración explícita.
 * Integración con Google Auth.
 */
import { initializeFirebase } from './firebase-config.js';
import { GoogleAuthProvider, signInWithPopup } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';

const DEMO_KEY = 'amarte-demo-v1';
const DEMO_ACTIVE = 'amarte-demo-activa';
const DEMO_PARTNER_CODE = 'DEMO-PAREJA';
let backend = null;

export async function startBackend() {
  backend = await initializeFirebase();
  return backend;
}
export function backendStatus() { return backend || { enabled: false, reason: 'config' }; }
export function isDemoActive() { try { return localStorage.getItem(DEMO_ACTIVE) === '1'; } catch { return false; } }

function needFirebase() {
  if (!backend?.enabled) throw new Error('Firebase no está configurado o no está disponible. Entra a la demostración para probar la aplicación.');
  return backend;
}
function currentUid() {
  const user = needFirebase().auth.currentUser;
  if (!user) throw new Error('Inicia sesión para continuar.');
  return user.uid;
}
function readDemo() {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { throw new Error('Tu navegador no permite utilizar LocalStorage para la demostración.'); }
}
function writeDemo(data) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(data));
    localStorage.setItem(DEMO_ACTIVE, '1');
  } catch { throw new Error('No fue posible guardar la demostración en este navegador.'); }
}
function newId() {
  if (!crypto?.randomUUID) throw new Error('Se requiere HTTPS o localhost para crear identificadores seguros.');
  return crypto.randomUUID();
}
function newInviteCode() {
  if (!crypto?.getRandomValues) throw new Error('Se requiere HTTPS o localhost para crear códigos seguros.');
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const hex = Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `AM-${hex.match(/.{1,4}/g).join('-')}`;
}
export function normalizeCode(raw) { return String(raw || '').trim().replace(/\s/g, '').toUpperCase(); }

export async function launchDemo(nombre = '') {
  const stored = readDemo();
  if (!stored) {
    writeDemo({
      user: { uid: 'demo-usuario', nombre: nombre.trim().slice(0, 70) || 'Mi espacio', email: '', codigo_pareja_id: 'DEMO-TU-CODIGO', id_relacion: null },
      couple: null, partner: null, notes: [], goals: [], conflicts: []
    });
  } else {
    try { localStorage.setItem(DEMO_ACTIVE, '1'); } catch { throw new Error('LocalStorage está bloqueado.'); }
  }
  return readDemo();
}
export function exitDemo() {
  try { localStorage.removeItem(DEMO_ACTIVE); } catch { /* Solo sesión local */ }
}
export function deleteDemoData() {
  try { localStorage.removeItem(DEMO_KEY); localStorage.removeItem(DEMO_ACTIVE); } catch { /* Sin datos accesibles */ }
}
export function getDemoWorkspace() { return readDemo(); }
export function getDemoLinkHint() { return DEMO_PARTNER_CODE; }

export function watchAuth(callback) {
  const fb = needFirebase();
  return fb.authApi.onAuthStateChanged(fb.auth, async user => {
    try { callback(user ? await fetchWorkspace() : null, null); }
    catch (error) { callback(null, error); }
  }, error => callback(null, error));
}

async function createProfile(authUser, nombre) {
  const { db, dbApi: f } = needFirebase();
  const code = newInviteCode();
  const batch = f.writeBatch(db);
  batch.set(f.doc(db, 'Users', authUser.uid), {
    uid: authUser.uid, nombre: nombre.trim().slice(0, 70),
    email: authUser.email, codigo_pareja_id: code, id_relacion: null
  });
  batch.set(f.doc(db, 'Pair_Codes', code), { uid_owner: authUser.uid, nombre_publico: nombre.trim().slice(0, 70) });
  await batch.commit();
}

export async function loginConGoogle() {
  const fb = needFirebase();
  const provider = new GoogleAuthProvider();
  // Fuerza a elegir cuenta siempre para evitar errores de sesión automática no deseada
  provider.setCustomParameters({ prompt: 'select_account' });
  
  const result = await signInWithPopup(fb.auth, provider);
  const user = result.user;

  // Verificamos si ya existe el perfil en Firestore
  const userRef = fb.dbApi.doc(fb.db, 'Users', user.uid);
  const userSnap = await fb.dbApi.getDoc(userRef);

  if (!userSnap.exists()) {
    // Escenario: Usuario 100% Nuevo
    await createProfile(user, user.displayName || 'Usuario');
  }
  
  // El fetchWorkspace automáticamente maneja los 3 escenarios 
  // devolviendo si tiene pareja o si debe ir a la pantalla de vincular
  return fetchWorkspace();
}

export async function logoutAccount() {
  if (isDemoActive()) { exitDemo(); return; }
  const fb = needFirebase();
  await fb.authApi.signOut(fb.auth);
}

export async function fetchWorkspace() {
  if (isDemoActive()) return readDemo();
  const { auth, db, dbApi: f } = needFirebase();
  if (!auth.currentUser) return null;
  const userRef = f.doc(db, 'Users', auth.currentUser.uid);
  let userSnap = await f.getDoc(userRef);
  if (!userSnap.exists()) {
    if (!auth.currentUser.displayName) throw new Error('Tu perfil no está disponible. Contacta al administrador de la aplicación.');
    await createProfile(auth.currentUser, auth.currentUser.displayName);
    userSnap = await f.getDoc(userRef);
  }
  const user = userSnap.data();
  let couple = null, partner = null, goals = [], conflicts = [];
  if (user.id_relacion) {
    const coupleSnap = await f.getDoc(f.doc(db, 'Couples', user.id_relacion));
    if (coupleSnap.exists()) {
      couple = coupleSnap.data();
      const partnerUid = couple.uid_1 === user.uid ? couple.uid_2 : couple.uid_1;
      const [partnerSnap, goalsSnap, conflictsSnap] = await Promise.all([
        f.getDoc(f.doc(db, 'Users', partnerUid)),
        f.getDocs(f.query(f.collection(db, 'Shared_Goals'), f.where('id_relacion', '==', user.id_relacion))),
        f.getDocs(f.query(f.collection(db, 'Timeline_Conflicts'), f.where('id_relacion', '==', user.id_relacion)))
      ]);
      if (partnerSnap.exists()) partner = { uid: partnerUid, nombre: partnerSnap.data().nombre };
      goals = goalsSnap.docs.map(s => s.data());
      conflicts = conflictsSnap.docs.map(s => s.data());
    }
  }
  const privateSnap = await f.getDocs(f.query(f.collection(db, 'Private_Notes'), f.where('uid_creador', '==', user.uid)));
  const notes = privateSnap.docs.map(s => s.data());
  return { user, couple, partner, notes, goals, conflicts };
}

export async function linkPartner(codeRaw) {
  const code = normalizeCode(codeRaw);
  if (isDemoActive()) {
    if (code !== DEMO_PARTNER_CODE) throw new Error('Código de demostración no válido. Prueba DEMO-PAREJA.');
    const store = readDemo();
    if (store.couple) throw new Error('La demostración ya tiene una vinculación activa.');
    store.couple = { id_relacion: 'demo-relacion', uid_1: store.user.uid, uid_2: 'demo-pareja', fecha_conocidos: '', fecha_aniversario: '' };
    store.partner = { uid: 'demo-pareja', nombre: 'Pareja de demostración' };
    store.user.id_relacion = store.couple.id_relacion;
    writeDemo(store);
    return readDemo();
  }
  if (!/^AM-(?:[A-F0-9]{4}-){4}[A-F0-9]{4}$/.test(code)) throw new Error('Código de pareja no válido. Revisa el formato y vuelve a intentarlo.');
  const { db, dbApi: f } = needFirebase();
  const uid = currentUid();
  const ownSnap = await f.getDoc(f.doc(db, 'Users', uid));
  if (!ownSnap.exists() || ownSnap.data().id_relacion) throw new Error('Tu perfil ya está vinculado o no está disponible.');
  if (ownSnap.data().codigo_pareja_id === code) throw new Error('No puedes vincular tu perfil consigo mismo.');
  const codeSnap = await f.getDoc(f.doc(db, 'Pair_Codes', code));
  if (!codeSnap.exists()) throw new Error('Código de pareja no válido. Pide a tu pareja que copie su código desde Inicio.');
  const invitedUid = codeSnap.data().uid_owner;
  if (invitedUid === uid) throw new Error('No puedes usar tu propio código.');
  const coupleRef = f.doc(f.collection(db, 'Couples'));
  const batch = f.writeBatch(db);
  batch.set(coupleRef, {
    id_relacion: coupleRef.id, uid_1: uid, uid_2: invitedUid,
    codigo_invitacion: code, fecha_conocidos: '', fecha_aniversario: ''
  });
  batch.update(f.doc(db, 'Users', uid), { id_relacion: coupleRef.id });
  batch.update(f.doc(db, 'Users', invitedUid), { id_relacion: coupleRef.id });
  try { await batch.commit(); }
  catch (error) {
    if (error?.code === 'permission-denied') throw new Error('No se pudo vincular: el código puede haber caducado o tu pareja ya está vinculada.');
    throw error;
  }
  return fetchWorkspace();
}

function assertLinked(workspace) {
  if (!workspace?.couple) throw new Error('Primero vincula los perfiles desde Inicio para compartir información.');
}
export async function saveCoupleDates(fecha_conocidos, fecha_aniversario) {
  if (isDemoActive()) { const store = readDemo(); assertLinked(store); Object.assign(store.couple, { fecha_conocidos, fecha_aniversario }); writeDemo(store); return readDemo(); }
  const workspace = await fetchWorkspace(); assertLinked(workspace);
  const { db, dbApi: f } = needFirebase();
  await f.updateDoc(f.doc(db, 'Couples', workspace.couple.id_relacion), { fecha_conocidos, fecha_aniversario });
  return fetchWorkspace();
}
export async function addPrivateNote(contenido) {
  const fecha = new Date().toISOString();
  if (isDemoActive()) { const store = readDemo(); store.notes.push({ id_nota: newId(), uid_creador: store.user.uid, contenido, fecha }); writeDemo(store); return readDemo(); }
  const { db, dbApi: f } = needFirebase();
  const ref = f.doc(f.collection(db, 'Private_Notes'));
  await f.setDoc(ref, { id_nota: ref.id, uid_creador: currentUid(), contenido, fecha });
  return fetchWorkspace();
}
export async function deletePrivateNote(id) {
  if (isDemoActive()) { const store = readDemo(); store.notes = store.notes.filter(n => n.id_nota !== id); writeDemo(store); return readDemo(); }
  const { db, dbApi: f } = needFirebase();
  await f.deleteDoc(f.doc(db, 'Private_Notes', id));
  return fetchWorkspace();
}
export async function addGoal(tipo, descripcion) {
  if (isDemoActive()) { const store = readDemo(); assertLinked(store); store.goals.push({ id_meta: newId(), id_relacion: store.couple.id_relacion, uid_creador: store.user.uid, tipo, descripcion }); writeDemo(store); return readDemo(); }
  const workspace = await fetchWorkspace(); assertLinked(workspace);
  const { db, dbApi: f } = needFirebase();
  const ref = f.doc(f.collection(db, 'Shared_Goals'));
  await f.setDoc(ref, { id_meta: ref.id, id_relacion: workspace.couple.id_relacion, uid_creador: currentUid(), tipo, descripcion });
  return fetchWorkspace();
}
export async function deleteGoal(id) {
  if (isDemoActive()) { const store = readDemo(); store.goals = store.goals.filter(g => g.id_meta !== id || g.uid_creador !== store.user.uid); writeDemo(store); return readDemo(); }
  const { db, dbApi: f } = needFirebase();
  await f.deleteDoc(f.doc(db, 'Shared_Goals', id));
  return fetchWorkspace();
}
export async function addLearning({ problema, acuerdo, enseñanza, fecha }) {
  if (isDemoActive()) { const store = readDemo(); assertLinked(store); store.conflicts.push({ id_conflicto: newId(), id_relacion: store.couple.id_relacion, uid_creador: store.user.uid, problema, acuerdo, enseñanza, fecha }); writeDemo(store); return readDemo(); }
  const workspace = await fetchWorkspace(); assertLinked(workspace);
  const { db, dbApi: f } = needFirebase();
  const ref = f.doc(f.collection(db, 'Timeline_Conflicts'));
  await f.setDoc(ref, { id_conflicto: ref.id, id_relacion: workspace.couple.id_relacion, uid_creador: currentUid(), problema, acuerdo, enseñanza, fecha });
  return fetchWorkspace();
}
export async function deleteLearning(id) {
  if (isDemoActive()) { const store = readDemo(); store.conflicts = store.conflicts.filter(c => c.id_conflicto !== id || c.uid_creador !== store.user.uid); writeDemo(store); return readDemo(); }
  const { db, dbApi: f } = needFirebase();
  await f.deleteDoc(f.doc(db, 'Timeline_Conflicts', id));
  return fetchWorkspace();
}

export function friendlyError(error) {
  const known = {
    'auth/invalid-credential': 'El correo o la contraseña no coinciden.',
    'auth/email-already-in-use': 'Ya existe una cuenta con este correo.',
    'auth/weak-password': 'Usa una contraseña de al menos seis caracteres.',
    'auth/invalid-email': 'Revisa el formato del correo electrónico.',
    'auth/too-many-requests': 'Demasiados intentos. Inténtalo más tarde.',
    'auth/network-request-failed': 'No hay conexión con Firebase. Verifica tu conexión.',
    'auth/popup-closed-by-user': 'Se canceló el inicio de sesión con Google.',
    'permission-denied': 'No tienes permisos para realizar esta acción. Comprueba las reglas de Firestore.',
    unavailable: 'El servicio no está disponible. Tu información no se ha guardado.'
  };
  return known[error?.code] || error?.message || 'Ocurrió un error inesperado.';
}