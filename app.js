/** A...MARTE · UI accesible, navegación y cálculos sin frameworks. */
import {
  startBackend, backendStatus, watchAuth, isDemoActive, launchDemo, exitDemo,
  getDemoWorkspace, getDemoLinkHint, deleteDemoData, loginConGoogle, logoutAccount,
  fetchWorkspace, linkPartner, saveCoupleDates, addPrivateNote, deletePrivateNote,
  addGoal, deleteGoal, addLearning, deleteLearning, friendlyError
} from './auth.js';

const $ = id => document.getElementById(id);
const VIEWS = ['inicio', 'privado', 'limites', 'aprendizajes', 'biblioteca'];
const VIEW_NAMES = { inicio:'Inicio', privado:'Mi espacio privado', limites:'Límites y metas', aprendizajes:'Aprendizajes', biblioteca:'Biblioteca' };
let workspace = null;
let activeView = 'inicio';
let authProcessing = false;
let toastTimer;
let currentTip = null;

const TIPS = [
  {
    id:'celos', re:/\b(celos|celosa|celoso|desconfianza|inseguridad)\b/,
    title:'Celos y confianza',
    short:'Puedes expresar inseguridad sin pedir control. Hablar de lo que sientes suele abrir una conversación más cuidadosa.',
    body:'Los celos pueden señalar miedos o necesidades de seguridad, pero no justifican vigilar, imponer restricciones o invadir la privacidad. Expresa qué te preocupa y pregunta cómo pueden construir confianza desde el respeto mutuo.',
    prompt:'Prueba: “Cuando sucede ___, siento ___. Me ayudaría que conversemos sobre ___”.'
  },
  {
    id:'dinero', re:/\b(dinero|gastos|gasto|ahorro|deudas|presupuesto|pagar|plata)\b/,
    title:'Dinero y expectativas',
    short:'Los acuerdos financieros funcionan mejor cuando se conversan con claridad y sin imponer una única forma de aportar.',
    body:'Las personas pueden tener ingresos y responsabilidades diferentes. Una conversación útil define presupuestos, expectativas realistas y decisiones importantes en conjunto, respetando la autonomía financiera individual.',
    prompt:'Pregúntense: “¿Qué gastos compartimos, cuáles son personales y cómo revisaremos nuestros acuerdos?”'
  },
  {
    id:'tiempo', re:/\b(tiempo|horarios|horario|espacio|soledad|salidas|prioridad|disponibilidad)\b/,
    title:'Tiempo juntos y tiempo propio',
    short:'El tiempo en pareja y la independencia no compiten: ambos pueden formar parte de un vínculo saludable.',
    body:'Tener un espacio propio no significa querer menos. Pueden acordar momentos de calidad, comunicar cambios de planes y respetar el descanso, las amistades y los intereses de cada persona.',
    prompt:'Prueba: “Me gustaría que reserváramos ___ para compartir y que respetáramos ___ como tiempo personal”.'
  }
];

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function daysSince(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString || '')) return null;
  const [y,m,d] = dateString.split('-').map(Number);
  const actual = new Date(Date.UTC(y,m-1,d));
  if (actual.getUTCFullYear() !== y || actual.getUTCMonth()+1 !== m || actual.getUTCDate() !== d) return null;
  const now = new Date();
  const startUTC = Date.UTC(y,m-1,d);
  const todayUTC = Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  return startUTC > todayUTC ? null : Math.round((todayUTC-startUTC)/86400000);
}
function dateLabel(iso) {
  if (!iso) return '';
  const raw = iso.slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const [y,m,d] = raw.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO',{day:'numeric',month:'long',year:'numeric'}).format(new Date(y,m-1,d));
}
function dateError() {
  const met=$('date-met').value, anniversary=$('date-anniversary').value;
  if (met && daysSince(met) === null) return 'La fecha en que se conocieron no puede ser futura.';
  if (anniversary && daysSince(anniversary) === null) return 'El aniversario no puede estar en el futuro.';
  if (met && anniversary && anniversary < met) return 'El aniversario no puede ser anterior al día en que se conocieron.';
  return '';
}
function updateCounters() {
  const a = daysSince($('date-met').value), b=daysSince($('date-anniversary').value);
  $('days-met').textContent = a === null ? '—' : new Intl.NumberFormat('es-CO').format(a);
  $('days-anniversary').textContent = b === null ? '—' : new Intl.NumberFormat('es-CO').format(b);
  $('time-empty').hidden = a !== null || b !== null;
  const issue=dateError(); $('date-feedback').hidden = !issue;
  $('date-feedback').textContent = issue;
}
function toast(message, isError=false) {
  clearTimeout(toastTimer);
  const el=$('toast'); el.textContent=message; el.classList.toggle('error',isError); el.hidden=false;
  toastTimer=setTimeout(()=>{el.hidden=true;},4600);
}

function displayAuth() {
  $('loading-screen').hidden=true;
  $('auth-screen').hidden=false;
  $('dashboard').hidden=true;
  const status=backendStatus();
  if (!status.enabled) {
    const notice=$('connection-notice'); notice.hidden=false;
    notice.textContent=status.reason==='config'
      ? 'Modo sin Firebase: configura firebase-config.js para registrar cuentas reales. Puedes explorar la demostración de forma local.'
      : 'No se pudo establecer conexión con Firebase. Puedes explorar la demostración sin asociar perfiles reales.';
  } else { $('connection-notice').hidden=true; }
}

function setWorkspace(next) {
  workspace=next;
  if (!next) { displayAuth(); return; }
  $('loading-screen').hidden=true;
  $('auth-screen').hidden=true;
  $('dashboard').hidden=false;
  const user=workspace.user;
  const name=(user.nombre||'Tu espacio').trim();
  $('topbar-name').textContent=name;
  $('user-avatar').textContent=name.charAt(0).toUpperCase()||'♡';
  $('data-mode').textContent=isDemoActive()?'DEMOSTRACIÓN':'EN FIREBASE';
  $('data-mode').classList.toggle('demo',isDemoActive());
  $('clear-demo').hidden=!isDemoActive();
  $('today-label').textContent=new Intl.DateTimeFormat('es-CO',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
  renderConnection(); renderNotes(); renderGoals(); renderTimeline();
  navigate(activeView,false);
}

function renderConnection() {
  const {couple,partner,user}=workspace;
  $('connection-actions').hidden=!!couple;
  if ($('unlink-container')) $('unlink-container').hidden = !couple;
  $('my-pair-code').textContent=user.codigo_pareja_id||'—';
  if (couple) {
    $('connection-title').textContent=`Conectado con ${partner?.nombre || 'tu pareja'}`;
    $('connection-description').textContent=isDemoActive()
      ? 'Vinculación simulada: aquí no se conecta otra persona real. Puedes practicar los acuerdos y aprendizajes.'
      : 'Ahora comparten sus acuerdos y aprendizajes. Tu diario personal sigue siendo solo tuyo.';
  } else {
    $('connection-title').textContent='Tu historia puede comenzar aquí';
    $('connection-description').textContent=isDemoActive()
      ? `Demostración: para simular un vínculo, introduce ${getDemoLinkHint()}. No vincula perfiles reales.`
      : 'Comparte tu código con tu pareja o escribe el suyo para crear un espacio compartido.';
    $('link-help').textContent=isDemoActive()
      ? `SIMULACIÓN · Prueba el código ${getDemoLinkHint()}. No conecta cuentas reales.`
      : 'Ambas personas deben tener una cuenta. El código debe compartirse en privado.';
  }
  $('date-met').value=couple?.fecha_conocidos||'';
  $('date-anniversary').value=couple?.fecha_aniversario||'';
  $('date-met').max=localToday();
  $('date-anniversary').max=localToday();
  $('save-dates').disabled=!couple;
  $('save-dates').title=couple?'Guardar en el espacio compartido':'Vincula a tu pareja para guardar las fechas; mientras tanto puedes calcularlas.';
  $('date-feedback').hidden=true;
  updateCounters();
  $('goal-form').querySelector('button[type="submit"]').disabled=!couple;
  $('goal-unlinked').hidden=!!couple;
  $('conflict-form').querySelector('button[type="submit"]').disabled=!couple;
}

function element(tag, className, content) {
  const el=document.createElement(tag); if(className) el.className=className;
  if (content !== undefined) el.textContent=content;
  return el;
}
function empty(container,title,description) {
  const wrap=element('div','empty-state');
  wrap.append(element('span','empty-symbol','♡'),element('strong','',title),element('p','',description));
  container.append(wrap);
}
function removalButton(label, type, id) {
  const button=element('button','entry-remove');
  button.type='button';button.dataset.remove=type;button.dataset.id=id;button.title=label;button.setAttribute('aria-label',label);
  button.innerHTML='<svg><use href="#i-trash"/></svg>';
  return button;
}
function renderNotes() {
  const container=$('notes-list');container.replaceChildren();
  const notes=[...(workspace.notes||[])].sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
  if(!notes.length){empty(container,'Todavía no hay notas','Puedes comenzar escribiendo cómo te has sentido hoy.');return;}
  for(const note of notes){
    const box=element('article','entry'),head=element('div','entry-top');
    head.append(element('span','entry-date',dateLabel(note.fecha)),removalButton('Eliminar esta nota privada','note',note.id_nota));
    box.append(head,element('p','entry-body',note.contenido));container.append(box);
  }
}
function renderGoals() {
  for (const [id, isOwn] of [['my-goals',true],['partner-goals',false]]) {
    const container=$(id);container.replaceChildren();
    if(!workspace.couple){empty(container,'Aún sin vinculación',isOwn?'Conecta tu cuenta para guardar acuerdos compartidos.':'Aquí aparecerán los acuerdos que comparta tu pareja.');continue;}
    const goals=(workspace.goals||[]).filter(g=>(g.uid_creador===workspace.user.uid)===isOwn);
    if(!goals.length){empty(container,isOwn?'Un espacio por construir':'Escuchar también toma tiempo',isOwn?'Comparte un límite o una meta en el formulario.':'Tu pareja todavía no ha compartido límites ni metas.');continue;}
    for(const goal of goals){
      const box=element('article','entry'),head=element('div','entry-top');
      head.append(element('span','goal-type-badge'+(goal.tipo==='meta'?' meta':''),goal.tipo==='meta'?'META':'LÍMITE'));
      if(isOwn)head.append(removalButton('Eliminar mi acuerdo','goal',goal.id_meta));
      box.append(head,element('p','entry-body',goal.descripcion));container.append(box);
    }
  }
}
function renderTimeline() {
  const container=$('timeline-list');container.replaceChildren();
  if(!workspace.couple){empty(container,'Comiencen por conectar','Cuando vinculen sus perfiles, podrán dejar aprendizajes en común.');return;}
  const conflicts=[...(workspace.conflicts||[])].sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
  if(!conflicts.length){empty(container,'Cada historia se construye','Cuando conversen sobre una experiencia pasada, pueden registrar aquí lo que les enseñó.');return;}
  for(const conflict of conflicts){
    const box=element('article','timeline-entry'),head=element('div','entry-top');
    head.append(element('span','entry-date',dateLabel(conflict.fecha)));
    if(conflict.uid_creador===workspace.user.uid)head.append(removalButton('Eliminar aprendizaje compartido','learning',conflict.id_conflicto));
    box.append(head,element('h3','', 'Una conversación que nos enseñó'));
    for(const [heading,value] of [['La situación',conflict.problema],['El acuerdo',conflict.acuerdo],['Lo que aprendimos',conflict.enseñanza]]){
      const piece=element('div','timeline-piece');piece.append(element('strong','',heading),element('p','',value));box.append(piece);
    }
    container.append(box);
  }
}
function navigate(view, scroll=true) {
  if(!VIEWS.includes(view)) return;
  activeView=view;
  for(const v of VIEWS){const el=$('view-'+v);const selected=v===view;el.hidden=!selected;el.classList.toggle('active',selected);}
  for(const button of document.querySelectorAll('.nav-link')){
    const selected=button.dataset.go===view;
    button.classList.toggle('active',selected);
    if(selected)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  }
  $('breadcrumb-current').textContent=VIEW_NAMES[view];
  document.title=`${VIEW_NAMES[view]} · A...MARTE`;
  closeSidebar();
  if(scroll) {
    window.scrollTo({top:0,behavior:'smooth'});
    const heading=$('view-'+view).querySelector('h1');
    if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});}
  }
}
function closeSidebar(){ $('sidebar').classList.remove('open');$('sidebar-scrim').hidden=true;$('mobile-menu').setAttribute('aria-expanded','false');$('sidebar').inert=window.matchMedia('(max-width:850px)').matches; }
function toggleSidebar(){const open=!$('sidebar').classList.contains('open');$('sidebar').inert=!open;$('sidebar').classList.toggle('open',open);$('sidebar-scrim').hidden=!open;$('mobile-menu').setAttribute('aria-expanded',String(open));if(open)$('sidebar').querySelector('.nav-link')?.focus(); }
async function runAction(button,task,success,onSuccess) {
  if(button)button.disabled=true;
  try {const state=await task();if(state)setWorkspace(state);if(onSuccess)onSuccess();if(success)toast(success);}
  catch(error){toast(friendlyError(error),true);}
  finally {if(button)button.disabled=false;}
}
function updateContextualTip() {
  const input=$('goal-description').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  currentTip=TIPS.find(t=>t.re.test(input))||null;
  $('dynamic-tip').hidden=!currentTip;
  if(currentTip)$('tip-summary').textContent=currentTip.short;
}
function showTipDialog() {
  if(!currentTip) return;
  $('modal-title').textContent=currentTip.title;
  $('modal-body').textContent=currentTip.body;
  $('modal-prompt').textContent=currentTip.prompt;
  $('tip-dialog').showModal();
}
function closeTipDialog(){ $('tip-dialog').close(); }

function setupEvents() {
  
  // LOGIN CON GOOGLE
  $('auth-google').addEventListener('click', async () => {
    authProcessing = true;
    $('auth-error').hidden = true;
    $('auth-google').disabled = true;
    try {
      const next = await loginConGoogle();
      if (!next) throw new Error('No fue posible cargar tu perfil.');
      setWorkspace(next);
      toast('Bienvenido a tu espacio.');
    } catch(error) { 
      $('auth-error').textContent = friendlyError(error);
      $('auth-error').hidden = false; 
    }
    finally { 
      authProcessing = false;
      $('auth-google').disabled = false; 
    }
  });

  // LÓGICA DE EDITAR PERFIL
  $('edit-profile-btn')?.addEventListener('click', async () => {
    if (isDemoActive()) { toast('No se puede cambiar el nombre en modo demostración.', true); return; }
    const nuevoNombre = window.prompt('Escribe tu nuevo apodo o nombre:', workspace.user.nombre || '');
    if (!nuevoNombre || nuevoNombre.trim() === '' || nuevoNombre === workspace.user.nombre) return;
    
    await runAction($('edit-profile-btn'), async () => {
      const dbApi = backendStatus().dbApi;
      const db = backendStatus().db;
      const userRef = dbApi.doc(db, 'Users', workspace.user.uid);
      await dbApi.updateDoc(userRef, { nombre: nuevoNombre.trim() });
      return await fetchWorkspace(); // Recarga el espacio para mostrar el nuevo nombre
    }, 'Perfil actualizado correctamente.');
  });

  // LÓGICA DE DESVINCULAR PAREJA
  $('unlink-btn')?.addEventListener('click', async () => {
    if (isDemoActive()) { toast('No disponible en modo demostración.', true); return; }
    if (!window.confirm('¿Estás seguro de que quieres terminar la vinculación? Se borrará la conexión y las fechas, pero los acuerdos y aprendizajes se conservarán ocultos.')) return;
    
    await runAction($('unlink-btn'), async () => {
      const dbApi = backendStatus().dbApi;
      const db = backendStatus().db;
      const coupleId = workspace.couple.id_relacion;
      const myUid = workspace.user.uid;
      const partnerUid = workspace.partner?.uid;
      
      const batch = dbApi.writeBatch(db);
      // Borrar a ambos usuarios de la relación
      batch.update(dbApi.doc(db, 'Users', myUid), { id_relacion: null });
      if (partnerUid) {
        batch.update(dbApi.doc(db, 'Users', partnerUid), { id_relacion: null });
      }
      // Borrar el documento de la relación
      batch.delete(dbApi.doc(db, 'Couples', coupleId));
      
      await batch.commit();
      return await fetchWorkspace(); // Recarga el espacio para mostrar la desconexión
    }, 'Te has desvinculado de tu pareja.');
  });

  $('demo-start').addEventListener('click',async()=>{
    await runAction($('demo-start'),()=>launchDemo('Modo Demostración'),'Demostración local activada.');
  });
  
  $('clear-demo').addEventListener('click',()=>{
    if(!window.confirm('¿Borrar todas las notas, acuerdos, fechas y aprendizajes guardados en esta demostración? Esta acción es irreversible.'))return;
    deleteDemoData();workspace=null;activeView='inicio';displayAuth();toast('Datos de demostración borrados de este navegador.');
  });
  
  $('logout-btn').addEventListener('click',async()=>{
    await runAction($('logout-btn'),async()=>{await logoutAccount();return null;},null);
    if(isDemoActive())return;
    if(backendStatus().enabled&&backendStatus().auth.currentUser)return;
    workspace=null;activeView='inicio';displayAuth();toast('Has cerrado tu espacio.');
  });
  
  document.addEventListener('click',event=>{
    const nav=event.target.closest('[data-go]');
    if(nav&&workspace)navigate(nav.dataset.go);
    const remove=event.target.closest('[data-remove]');
    if(remove){
      const kind=remove.dataset.remove,id=remove.dataset.id;
      if(!window.confirm(kind==='note'?'¿Eliminar definitivamente esta nota privada?':'¿Eliminar este registro compartido?'))return;
      const action=kind==='note'?deletePrivateNote:kind==='goal'?deleteGoal:deleteLearning;
      runAction(remove,()=>action(id),'Registro eliminado.');
    }
  });
  
  $('mobile-menu').addEventListener('click',toggleSidebar);
  $('sidebar-scrim').addEventListener('click',closeSidebar);
  window.addEventListener('resize',()=>{if(!window.matchMedia('(max-width:850px)').matches)closeSidebar();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeSidebar();});
  $('copy-code').addEventListener('click',async()=>{
    try {await navigator.clipboard.writeText(workspace.user.codigo_pareja_id);toast('Código copiado. Compártelo solo con tu pareja.');}
    catch {toast('No fue posible copiar. Selecciona y copia el código manualmente.',true);}
  });
  $('link-form').addEventListener('submit',async event=>{
    event.preventDefault();if(!$('link-form').reportValidity())return;
    const code=$('partner-code').value;
    await runAction($('link-form').querySelector('button[type="submit"]'),()=>linkPartner(code),'Perfiles vinculados. Sus acuerdos ahora son compartidos.',()=>{$('partner-code').value='';});
  });
  ['date-met','date-anniversary'].forEach(id=>$(id).addEventListener('input',updateCounters));
  $('dates-form').addEventListener('submit',async event=>{
    event.preventDefault();const issue=dateError();
    if(issue){toast(issue,true);return;}
    if(!workspace?.couple){toast('Primero vincula los perfiles para guardar las fechas.',true);return;}
    await runAction($('save-dates'),()=>saveCoupleDates($('date-met').value,$('date-anniversary').value),'Fechas guardadas para ambos.');
  });
  $('note-form').addEventListener('submit',async event=>{
    event.preventDefault();if(!$('note-form').reportValidity())return;
    const content=$('note-content').value.trim();
    if(content.length<3){toast('Escribe al menos tres caracteres.',true);return;}
    await runAction($('note-form').querySelector('button[type="submit"]'),()=>addPrivateNote(content),'Nota privada guardada.',()=>{$('note-form').reset();});
  });
  $('goal-description').addEventListener('input',updateContextualTip);
  $('tip-more').addEventListener('click',showTipDialog);
  $('close-modal').addEventListener('click',closeTipDialog);
  $('modal-okay').addEventListener('click',closeTipDialog);
  $('goal-form').addEventListener('submit',async event=>{
    event.preventDefault();if(!$('goal-form').reportValidity())return;
    const tipo=$('goal-type').value,descripcion=$('goal-description').value.trim();
    if(descripcion.length<5){toast('Describe la idea con al menos cinco caracteres.',true);return;}
    await runAction($('goal-form').querySelector('button[type="submit"]'),()=>addGoal(tipo,descripcion),'Tu acuerdo se compartió con tu pareja.',()=>{$('goal-form').reset();updateContextualTip();});
  });
  $('conflict-date').max=localToday();
  $('conflict-form').addEventListener('submit',async event=>{
    event.preventDefault();if(!$('conflict-form').reportValidity())return;
    const fecha=$('conflict-date').value;
    if(daysSince(fecha)===null){toast('Selecciona una fecha válida y no futura.',true);return;}
    const problema=$('conflict-problem').value.trim(),acuerdo=$('conflict-agreement').value.trim(),enseñanza=$('conflict-lesson').value.trim();
    if([problema,acuerdo,enseñanza].some(s=>s.length<8)){toast('Completa los tres campos con al menos ocho caracteres.',true);return;}
    await runAction($('conflict-form').querySelector('button[type="submit"]'),()=>addLearning({problema,acuerdo,enseñanza,fecha}),'Aprendizaje compartido guardado.',()=>{$('conflict-form').reset();});
  });
  document.querySelectorAll('.library-expand').forEach(button=>button.addEventListener('click',()=>{
    const article=$('article-'+button.dataset.article);article.hidden=!article.hidden;
    button.setAttribute('aria-expanded',String(!article.hidden));
    button.innerHTML=article.hidden?'Explorar esta idea <svg><use href="#i-arrow"/></svg>':'Cerrar lectura <svg><use href="#i-arrow"/></svg>';
  }));
  document.addEventListener('visibilitychange',async()=>{
    if(document.hidden||!workspace||isDemoActive()||!backendStatus().enabled)return;
    try {const refreshed=await fetchWorkspace();if(refreshed)setWorkspace(refreshed);}catch(error){console.warn('No se pudo actualizar el espacio compartido:',error);}
  });
  setInterval(()=>{if(workspace&&!$('dashboard').hidden)updateCounters();},60000);
}

async function main() {
  setupEvents();
  const status=await startBackend();
  if(isDemoActive()) {const demo=getDemoWorkspace();if(demo){setWorkspace(demo);return;}exitDemo();}
  if(status.enabled){
    watchAuth((next,error)=>{
      if(authProcessing||isDemoActive())return;
      if(error){displayAuth();toast(friendlyError(error),true);return;}
      setWorkspace(next);
    });
  }else{displayAuth();}
  if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost')){
    navigator.serviceWorker.register('./sw.js').catch(error=>console.warn('PWA sin caché:',error));
  }
}
main().catch(error=>{displayAuth();toast(friendlyError(error),true);});