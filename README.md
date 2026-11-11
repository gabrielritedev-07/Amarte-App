# A...MARTE — Amar sin dañar

Web app sin frameworks, en HTML semántico, CSS con variables y JavaScript modular.

## Abrir en el navegador

1. Descomprime la carpeta y abre una terminal en `A_MARTE`.
2. Ejecuta `python -m http.server 8000` (o utiliza cualquier servidor estático con HTTPS).
3. Abre `http://localhost:8000`.
4. Selecciona **Explorar demostración**. Para simular vinculación introduce `DEMO-PAREJA`. Esta es **solo una simulación local**, no registra a otra persona.

**No abras el archivo con `file://`**: los módulos JavaScript, las importaciones y la PWA necesitan un servidor HTTP/HTTPS.

## Conectar Firebase (cuentas reales)

1. Crea un proyecto en la [consola de Firebase](https://console.firebase.google.com/). Registra una app web.
2. Activa **Authentication → Sign-in method → Email/Password** y crea una base **Cloud Firestore**.
3. Copia `apiKey`, `authDomain`, `projectId` y `appId` de la configuración web de Firebase al objeto `firebaseConfig` en `firebase-config.js`.
4. En **Firestore Database → Rules**, pega **todo** el contenido de `firestore.rules` y publica las reglas **antes de invitar a otras personas**.
5. Configura un dominio HTTPS autorizado en **Authentication → Settings → Authorized domains**. Para desarrollo agrega `localhost` si aún no figura.
6. Prueba con **dos cuentas reales**. Cada una recibe un código aleatorio. Una persona introduce el código de la otra desde Inicio. Los perfiles quedan vinculados; los acuerdos y aprendizajes se comparten y las notas privadas no.

**Importante:** el objeto de configuración web no es un secreto: la protección efectiva depende de Authentication y las reglas de Firestore. No uses reglas abiertas (`allow read, write: if true`). Para un lanzamiento público añade App Check, límites contra abuso, verificación de correo, mecanismos de recuperación/borrado de cuentas y pruebas de reglas con el emulador Firebase. El proyecto no debe considerarse validado para producción sin estas comprobaciones.

### Colecciones de Firestore

- `Users/{uid}`: `uid`, `nombre`, `email`, `codigo_pareja_id` y `id_relacion` (auxiliar).
- `Couples/{id_relacion}`: `id_relacion`, `uid_1`, `uid_2`, `fecha_conocidos`, `fecha_aniversario`, `codigo_invitacion` (auxiliar).
- `Private_Notes/{id_nota}`: `id_nota`, `uid_creador`, `contenido`, `fecha`.
- `Shared_Goals/{id_meta}`: `id_meta`, `id_relacion`, `uid_creador`, `tipo`, `descripcion`.
- `Timeline_Conflicts/{id_conflicto}`: `id_conflicto`, `id_relacion`, `problema`, `acuerdo`, `enseñanza`, `fecha`, `uid_creador` (auxiliar).
- `Pair_Codes/{codigo}`: `uid_owner`, `nombre_publico`. Esta colección complementaria permite localizar una invitación por un identificador aleatorio no enumerable **sin exponer un listado de usuarios ni sus correos**. Sus documentos solo pueden leerse con el código exacto; no se permiten listados.

### Seguridad y límites actuales

- Firestore permite consultar notas privadas **únicamente** si `uid_creador` coincide con el UID autenticado; los documentos del diario no se almacenan en el perfil compartido.
- Las vinculaciones utilizan un batch atómico y reglas `getAfter()` para comprobar el consentimiento expresado mediante un código compartido y evitar vínculos parciales. El código es un secreto de invitación: no lo publiques.
- Los límites y metas de una persona solo pueden ser eliminados por su autor. Los aprendizajes compartidos también solo pueden ser eliminados por quien los creó.
- **No hay función de desvinculación ni eliminación permanente de cuentas** en este entregable. Para un lanzamiento real deben diseñarse flujos de revocación y retención de datos que respeten a ambas partes.
- La demostración usa `LocalStorage` y **no** es apropiada para información íntima o sensible. Los valores no salen de ese navegador; no significa que estén protegidos frente a quien use ese equipo o extensiones del navegador. Puedes borrarlos desde **Borrar datos de demostración** en el menú.
- Las modificaciones hechas por la otra persona se actualizan al recuperar el foco de la pestaña; no hay suscripciones en tiempo real de Firestore.
- La PWA almacena en caché solo archivos estáticos propios. Los servicios de Firebase requieren conexión para usar funciones reales.

## Funciones que operan sin configurar Firebase

Navegación entre cinco secciones, accesibilidad básica y teclado, tema responsive, biblioteca ampliable, cálculo de días reales sin recarga (respetando fechas y cambios de día), validación de formularios, consejos contextuales (celos/dinero/tiempo), modal, feedback y demostración persistente en el navegador.

## Funciones que requieren configurar Firebase

Registro/inicio de sesión de usuarios, códigos individuales seguros, vinculación de dos cuentas, sincronización de fechas, notas privadas protegidas por reglas, metas/límites compartidos y aprendizajes compartidos entre dispositivos.

## Personalización visual

Cambia los valores hexadecimales en el bloque `:root` de `styles.css`. Se usó una propuesta editorial cálida porque no se adjuntó la presentación base con los hex exactos. Todos los colores de la interfaz se centralizan en variables CSS.

## Archivos

- Principales: `index.html`, `styles.css`, `app.js`, `auth.js`, `firebase-config.js`.
- Complementarios imprescindibles: `firestore.rules` (seguridad), `manifest.webmanifest`, `sw.js`, `icon.svg`, `icon-192.png`, `icon-512.png` (PWA), `README.md`.

Documentación oficial: [Firebase para Web](https://firebase.google.com/docs/web/setup), [reglas Firestore](https://firebase.google.com/docs/firestore/security/get-started), [validación de escrituras atómicas](https://firebase.google.com/docs/firestore/manage-data/transactions).
