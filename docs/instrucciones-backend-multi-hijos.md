# Instrucciones para el Equipo de Backend: Soporte Multi-Hijos y Gestión de Cambios

Para que la aplicación soporte correctamente múltiples hijos por padre y las funcionalidades de control de ruta (ausencias, cambios temporales y permanentes), es necesario asegurar que la base de datos y los endpoints cumplan con los siguientes requisitos.

## 1. Estructura de Base de Datos Sugerida

### Tabla: `alumnos` (o `hijos`)
Asegurar que cada alumno esté vinculado a un padre y pueda tener su propia configuración de ruta.
- `id`: PK
- `padre_id`: FK a usuarios (rol padre)
- `nombre`: Texto
- `grado`: Texto
- `colegio_id`: FK a colegios
- `ruta_id`: FK a rutas (opcional, asignado por conductor/colegio)
- `latitude`, `longitude`: Coordenadas del punto de recogida (específico por niño).
- `parada`: Texto descriptivo.
- `activo`: Booleano (para bajas temporales).
- `punto_recogida_confirmado`: Booleano (primera vez directo, siguientes requieren aprobación).

### Tabla: `ausencias`
Registra las inasistencias por niño y por día.
- `id`: PK
- `alumno_id`: FK a alumnos
- `fecha`: Date
- `motivo`: Texto
- `estado`: Enum ('pendiente', 'autorizado', 'rechazado')
- `respuesta_conductor`: Texto (opcional)

### Tabla: `programaciones_ruta` (Cambios Temporales)
Para cambios de parada por un rango de fechas.
- `id`: PK
- `alumno_id`: FK a alumnos
- `fecha_inicio`: Date
- `fecha_fin`: Date
- `nueva_latitude`, `nueva_longitude`: Coordenadas temporales.
- `nueva_parada`: Texto.
- `nota`: Texto (ej: "Se queda con la abuela").
- `estado`: Enum ('pendiente', 'aprobado', 'rechazado')

### Tabla: `solicitudes_cambio` (Cambios Permanentes)
Para cambios definitivos de dirección que requieren visto bueno del conductor.
- `id`: PK
- `alumno_id`: FK a alumnos
- `parada_solicitada`: Texto
- `lat_solicitada`, `lng_solicitada`: Coordenadas
- `estado`: Enum ('pendiente', 'aprobado', 'rechazado')

## 2. Endpoints Requeridos

### PADRE
- `GET /api/padres/mis-hijos`: Debe retornar un array con TODOS los hijos vinculados, incluyendo sus coordenadas y estado actual.
- `POST /api/padres/hijos/:id/reportar-ausencia`: Crea un registro en la tabla `ausencias`.
- `POST /api/padres/hijos/:id/programar-cambio`: Crea un registro en `programaciones_ruta`.
- `PUT /api/padres/hijos/:id/punto-recogida`: Lógica:
    - Si `punto_recogida_confirmado` es falso -> Actualizar directo y poner en true.
    - Si es verdadero -> Crear registro en `solicitudes_cambio` y retornar Status 202.

### CONDUCTOR
- `GET /api/asignaciones/conductor/:id/alumnos`: Debe retornar la lista de alumnos, pero para cada alumno incluir:
    - `infoAusencia`: `{ esAusente: boolean, pendienteAutorizacion: boolean }` (basado en la tabla `ausencias` para la fecha actual).
    - `cambioTemporal`: `{ esActivo: boolean, nota: string, lat: number, lng: number }` (basado en `programaciones_ruta`).
    - `padreTelefono`: Para llamadas rápidas.
- `GET /api/conductor/alertas-pendientes`: Resumen de todas las ausencias, programaciones y solicitudes de cambio que esperan respuesta.
- `POST /api/conductor/solicitudes/:tipo/:id/responder`: Endpoint unificado para aprobar/rechazar.

## 3. Consideraciones Técnicas
- **Notificaciones Push**: El backend debe emitir una notificación al padre cuando el conductor apruebe o rechace cualquier solicitud.
- **Sincronización en Tiempo Real**: Usar Sockets (`socket.io`) para avisar al conductor en tiempo real cuando un padre envíe una nueva solicitud.
