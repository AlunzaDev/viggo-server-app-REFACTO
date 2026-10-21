# Arquitectura del código

Cómo se organiza `src/` y qué va en cada capa. Aplica igual en ADMINISTRATIVO y OPERATIVO. Si algo no encaja en estas reglas, se discute y se documenta aquí antes de hacer una excepción.

## Capas

```text
routes → controller → service → repository → datasource → PostgreSQL
                         ↑            ↑            ↑
                      domain (entidades, DTOs, contratos abstractos, errores)
```

| Carpeta | Qué va | Qué **no** va |
|---|---|---|
| `domain/entities`, `domain/dtos` | Entidades y validación de entrada (`XDto.create(body) → [error, dto]`). | Express, Prisma, `fs`, variables de entorno. |
| `domain/datasources`, `domain/repositories` | Contratos abstractos: qué datos se leen y escriben, con tipos del dominio. | Implementaciones. |
| `domain/errors`, `domain/helpers` | `CustomError` y utilidades puras (por ejemplo `isUuid`). | — |
| `infrastructure/datasources` | Implementación con Prisma/SQL de cada datasource. Convierte filas en entidades. | Reglas de negocio; imports de `presentation/`. |
| `infrastructure/repositories` | Implementación del repositorio: delega en el datasource. | Lógica (ver "Repositorios"). |
| `presentation/services` | **Toda** la lógica de negocio: reglas, validaciones de estado, orquestación de repositorios. Lanza `CustomError`. | `req`/`res`, Prisma, `PostgresDatabase`. |
| `presentation/routes/<módulo>/*.controller.ts` | HTTP: lee el request, arma el DTO, llama al servicio y responde. | Reglas de negocio, consultas a la base. |
| `presentation/routes/<módulo>/*.routes.ts` | Solo rutas y middlewares (`router.get("/", auth, controller.list)`). | Handlers, `new` de clases, consultas. |
| `presentation/dependencies` | Único lugar donde se crean (`new`) datasources, repositorios, servicios y controllers: `buildXController()`. `repositories.dependencies.ts` solo importa de `infrastructure/`. | Lógica. |
| `presentation/middlewares` | Autenticación, permisos, carga de archivos. | — |
| `config/plugins` | Adaptadores de librerías y utilidades técnicas usadas por varias capas: JWT, bcrypt, Stripe, cifrado de tokens de instalación, imágenes en disco. | Reglas de negocio. |

Dirección de dependencias: `presentation → domain ← infrastructure`. El dominio no importa nada de las otras capas; `infrastructure` no importa de `presentation`.

## Un controller "bien"

```ts
createTicket = async (req: Request, res: Response) => {
  try {
    const [error, dto] = CreateTicketDto.create(req.body, req.header("Idempotency-Key"));
    if (error) return res.status(400).json({ error });
    const { status, operation } = await this.mobile.createTicket(userIdFrom(req), dto!);
    return res.status(status).json({ operation });
  } catch (error) {
    return ErrorService.handleApiError(error, res);
  }
};
```

- Las reglas ("el QR no pertenece al estacionamiento", "la instalación está desconectada") viven en el servicio y se expresan con `CustomError.conflict(...)`, `CustomError.badRequest(...)`, etc.
- `ErrorService.handleApiError` traduce el error al código HTTP y al formato común `{ error, code, details }`. Un error inesperado responde 500 sin detalles internos.
- Si el servicio necesita distinguir respuestas exitosas (200 frente a 202), devuelve ese dato; el controller no lo decide.

Referencias pequeñas para copiar: `routes/statistics`, `routes/dashboard`, `routes/dev` (ticket-lab).

## Repositorios

Hoy la mayoría solo reenvía al datasource. Se conservan para que un servicio dependa de un contrato del dominio y no de una implementación, y para poder combinar fuentes en el futuro (caché, otra base). Regla: **un repositorio no tiene lógica**; si algo decide, va en el servicio.

## Excepción: módulos de lectura agregada

Estadísticas (`docs/estadisticas.md`) usa un solo puerto, `MetricsReader` (`domain/statistics`), implementado en `infrastructure/statistics` con una consulta SQL por métrica. No pasa por datasource + repositorio porque no maneja entidades: cada consulta devuelve números ya agregados por PostgreSQL. Un módulo nuevo de reportes de solo lectura puede seguir el mismo modelo.

## Módulo nuevo: lista de verificación

1. Entidad y DTOs en `domain/`, con su validación.
2. Contrato del datasource (y del repositorio) en `domain/`.
3. Implementación en `infrastructure/`.
4. Servicio en `presentation/services/<módulo>` con las reglas.
5. Controller y routes en `presentation/routes/<módulo>`.
6. `buildXController()` en `presentation/dependencies`.
7. Pruebas de integración con PostgreSQL real (`tests/integration`) para las reglas del servicio y los permisos de las rutas.

Excepciones conocidas: `server.ts` conecta la base al arrancar y `routes/health` consulta el estado de la conexión; ambos usan `PostgresDatabase` directamente porque ese es su propósito.
