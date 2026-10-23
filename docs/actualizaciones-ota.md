# Actualizaciones OTA

Cómo decide ADMINISTRATIVO qué versión corre cada estacionamiento (REFACTO#66, #67). La regla vive en `@alunzadev/viggo-contracts/releases`.

## Conceptos

- **Componente**: `operativo` (backend y web en la PC del estacionamiento) o `expendedora` (cada Raspberry).
- **Paquete**: una versión `MAJOR.MINOR.PATCH` de un componente para una plataforma (`linux/arm64` o `linux/amd64`), con su imagen y su **digest** `sha256:…`. Se descarga por digest: una etiqueta como `latest` puede moverse, un digest no.
- **Canal**, por componente: la versión **general** y, opcional, una versión **piloto** para una lista de proyectos.
- **Rollback**: apuntar el canal a una versión anterior. El catálogo no se borra.
- Un equipo **nunca** recibe una imagen de otra plataforma: si la versión que le toca no tiene build para su plataforma, no se le ofrece nada.

## API para super administradores (`/api/releases`)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/` | Catálogo por componente: canal, paquetes y versión anterior (destino de un rollback) |
| POST | `/paquetes` | Registra un paquete `{ component, version, platform, image, digest, notas? }` |
| PUT | `/canales/:component` | Cambia `generalVersion`, `pilotVersion` y/o `pilotProjects`; solo versiones registradas |
| GET | `/estado` | Qué corre cada instalación y cada expendedora contra lo que debería |

## Contrato con OPERATIVO

**Reportar versiones** (expendedora-viggo#1): en el snapshot de heartbeat (`POST /api/sync/heartbeat-snapshot`):

```json
{
  "metadata": { "release": { "version": "1.9.0", "platform": "linux/amd64" } },
  "modules": [{ "id": "…", "release": { "version": "1.2.0", "platform": "linux/arm64" } }]
}
```

Un módulo que no manda `release` conserva lo último que reportó.

**Consultar la versión deseada** (LOCAL-OPERATIVA#25): `GET /api/sync/releases[?plataforma=linux/amd64]` con las credenciales de sincronización de la instalación. Sin `plataforma` se usa la última que reportó.

```json
{
  "operativo": { "version": "2.0.0", "image": "…", "digest": "sha256:…", "platform": "linux/amd64", "channel": "general" },
  "expendedora": {
    "linux/arm64": { "version": "1.2.0", "image": "…", "digest": "sha256:…", "platform": "linux/arm64", "channel": "pilot" },
    "linux/amd64": null
  }
}
```

`null` significa que no hay nada que instalar. Para decidir si actualizar se usa `needsUpdate(versiónActual, deseada)` del paquete compartido: cualquier diferencia cuenta, también una versión anterior (rollback).
