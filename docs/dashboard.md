# Dashboard administrativo

`GET /api/dashboard?from=<epoch-ms>&to=<epoch-ms>&projectId=all` requiere
sesion ADMIN_WEB y permiso payments. Los usuarios ADMIN solo ven sus proyectos;
SUPER puede consolidarlos. El intervalo es [from,to), de hasta 366 dias. El
comparativo usa el intervalo inmediatamente anterior con la misma duracion.

Los ingresos incluyen pagos succeeded en MXN: registros Stripe centrales y pagos
operativos recibidos por el inbox. Una referencia Stripe presente en ambos se
cuenta una vez; la version central prevalece tambien para excluir reembolsos.
Los pagos de pension centrales sin proyecto se asignan a traves del pase.
El tipo ticket/pension no se interpreta como metodo de pago: sin evidencia se
muestra Sin identificar. Las sumas se realizan en centavos.

Estancias y ticket promedio usan tickets con salida dentro del periodo. Afluencia
agrupa entradas y salidas de forma independiente, en America/Mexico_City. Los
pases vigentes se cuentan por asignacion, estado, vigent y fechas actuales, no por
existir como inventario. Conectividad usa polling y heartbeats reales, aprobacion
de la instalacion y vigencia del pulso del dispositivo. La capacidad no existe en
el catalogo actual, por lo que no se calcula un porcentaje de ocupacion.

La vista de incidencias usa operational_incidents persistidas dentro del periodo.
No genera eventos ficticios de seguridad ni cambios de permisos. Sin operaciones
sincronizadas las series quedan vacias y las medias Sin datos; un cero nunca se
reemplaza por cifras de demostracion. Los errores HTTP se muestran y permiten
reintentar; no se exportan metricas mientras falten datos o haya fallado la carga.

Los registros se consultan en una transaccion RepeatableRead, con consultas de
relaciones secuenciales para no ejecutar consultas paralelas en una conexion pg.
No se necesitan migraciones nuevas. Las pruebas de integracion cubren deduplicado,
pagos pendientes/reembolsados, moneda, rango, permisos, salud y estados vacios.
