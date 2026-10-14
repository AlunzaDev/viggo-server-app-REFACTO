# Validacion de clientes PostgreSQL (#11)

## Ejecucion reproducible

En ADMINISTRATIVO backend:

```powershell
$env:FLUTTER_BIN = 'C:\Users\dceja\Downloads\flutter\bin\flutter.bat'
npm run smoke:postgres-clients
```

Requiere Node, los node_modules de ambos backends, Python y Flutter. Cada backend
necesita `.env.test` con DATABASE_URL en localhost/127.0.0.1 y una base terminada en
`_test`. El usuario PostgreSQL necesita permiso para crear bases. El runner crea dos
bases nuevas `viggo_smoke_*_test`, aplica todas las migraciones y arranca servidores
en puertos locales libres. Al finalizar detiene los servidores y elimina solo las
bases que creo, incluso si falla. No usa seeds ni modifica bases de desarrollo.

La expendedora requiere sus dependencias Python y PyQt5 (en Raspberry normalmente
lo proporciona el sistema). En Windows se puede usar una `.venv` del proyecto:

```powershell
python -m venv --system-site-packages .venv
.\.venv\Scripts\python.exe -m pip install PyQt5 python-socketio==5.16.3 python-jose==3.5.0 websocket-client==1.9.0 qrcode==8.2
```

El runner busca esa `.venv/Scripts/python.exe`; `PYTHON_BIN` permite otra ubicacion.
`node scripts/smoke-postgres-clients.mjs` ejecuta el flujo HTTP sin las pruebas de
Flutter y Python. Este modo parcial no valida por si solo los cuatro clientes.
El reporte local `smoke-postgres-results.json` contiene pasos, duraciones y alcance;
no guarda tokens ni passwords. Se excluye de Git.

## Cobertura

- IDs UUID enviados, recibidos y consultados sin exigir ObjectId de 24 hex.
- Login con perfiles de permisos para ADMIN_WEB y OPERATIVE_WEB.
- Alta de proyecto, ENTRADA, SALIDA y POS por la API administrativa.
- Solicitud y aprobacion de instalacion; configuracion y accesos sincronizados.
- Login de CLIENT_ROLE con solo OPERATIVE_MOBILE, catalogos del proyecto asignado
  y rechazo de escrituras administrativas y consultas a proyectos ajenos.
- Ticket movil, cotizacion, payment intent, confirmacion, aplicacion local y salida.
- Precontrato de pension, payment intent y contrato, seguido de sync.
- Aislamiento de OPERATIVO de la nube mediante proxy HTTP que devuelve 503, mientras
  el servidor local y PostgreSQL siguen disponibles: login local, ticket, turno,
  resolucion/cotizacion del QR, pago en efectivo y salida.
- Inbox sin nuevas recepciones durante el aislamiento; outbox local pendiente.
  Tras reconectar: entrega de todos los eventos, todos procesados, ticket espejo
  pagado y con salida, y historial de caja en el dashboard de la nube.
- Smoke autenticado de las dos webs contra las APIs nuevas. Los scripts fallan si
  faltan credenciales, token o listas esperadas. OPERATIVO no crea catalogos locales.
- Cliente Python real de catalogos y factory de payloads socket con UUID.
- Datasources HTTP reales de Flutter: login sin privilegios administrativos,
  proyectos, pensiones, ticket actual, pago y salida con conversiones de sus mappers.

## Alcance de la evidencia

Stripe usa el mock existente de desarrollo: se prueba el flujo interno completo,
pero no un cobro real ni las credenciales/webhooks externos. El aislamiento simula
perdida de conexion con la nube, no apaga la interfaz de red del equipo. No se prueba
hardware fisico: GPIO, impresora, lector y movimiento de barrera requieren la
expendedora/Raspberry instalada. Los builds de las webs y flutter analyze verifican
compilacion; el smoke HTTP no sustituye una revision visual en navegador o telefono.

## Correcciones

Flutter usaba `/api/proyectos` y `/api/pensiones/proyecto/:id`, reservados a
ADMIN_WEB. Se agregaron catalogos de lectura bajo `/api/mobile` y se actualizaron
sus datasources, conservando el filtro de proyectos asignados y las rutas de
escritura administrativas. La prueba movil usa CLIENT_ROLE para detectar este fallo
sin esconderlo con permisos de SUPER_ROLE.

Los smoke anteriores intentaban leer sin token, consultar tickets y movimientos
directamente en ADMINISTRATIVO, y crear catalogos en OPERATIVO. Ahora siguen la
separacion actual de ambos backends. Las pruebas no permiten declarar exito con
respuestas sin la lista o el token esperado.

## Resultado registrado: 14 de octubre de 2026

Pasaron todos los pasos de `--clients`, incluyendo los dos smoke web, el cliente
Python de expendedora y los datasources Flutter contra ambas bases nuevas. La
operacion offline produjo eventos pendientes y, tras reconectar, no quedaron
pendientes ni errores de procesamiento. Ambos builds web pasaron. Las 82 pruebas
de ADMINISTRATIVO pasaron; flutter analyze no encontro incidencias.

Esta evidencia corresponde al software en desarrollo con Stripe mock. Sigue
pendiente la validacion manual de PaymentSheet con Stripe en modo test y de GPIO,
impresora, lector y barrera en la Raspberry; no marcar esas pruebas como realizadas.
