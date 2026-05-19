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

## 2. Lógica de Negocio Requerida (Flujos Críticos)

### A. Vinculación y Primera Geoposición
1. **Flujo de Vinculación:** El padre ingresa el código del conductor y los datos del hijo. El backend debe crear al alumno y asociarlo a la ruta del conductor inmediatamente.
2. **Primera Geoposición (Directa):** Si el alumno **no tiene** coordenadas previas (`latitude` y `longitude` son NULL), el endpoint `PUT /api/padres/hijos/:id/punto-recogida` debe actualizar los campos directamente en la tabla `alumnos`.
3. **Cambios Posteriores (Aprobación):** Si el alumno **ya tiene** coordenadas, cualquier llamada a este endpoint debe crear una entrada en `solicitudes_cambio` con estado 'pendiente' y retornar un Status **202 Accepted**.

### B. Visibilidad para el Conductor
1. **Actualización Inmediata:** En cuanto un alumno es vinculado, debe aparecer en la lista de alumnos del conductor (`GET /api/asignaciones/conductor/:id/alumnos`).
2. **Alertas en Tiempo Real:** El conductor debe ser notificado (vía Sockets) de cualquier nueva solicitud (ausencia, cambio temporal o permanente) para que pueda aprobarla desde su panel de Alertas.

## 3. Endpoints Requeridos

### PADRE
- `GET /api/padres/mis-hijos`: Debe retornar un array con TODOS los hijos vinculados.
- `POST /api/padres/hijos/:id/reportar-ausencia`: Registro en `ausencias`.
- `POST /api/padres/hijos/:id/programar-cambio`: Registro en `programaciones_ruta`.
- `PUT /api/padres/hijos/:id/punto-recogida`: Lógica de aprobación descrita en punto 2.A.

### CONDUCTOR
- `GET /api/asignaciones/conductor/:id/alumnos`: Debe incluir `infoAusencia` y `cambioTemporal` para la fecha actual.
- `GET /api/conductor/alertas-pendientes`: Consolidado de solicitudes pendientes.
- `POST /api/conductor/solicitudes/:tipo/:id/responder`: Responder a solicitudes.

## 4. Consideraciones Técnicas
- **Notificaciones Push**: Avisar al padre sobre aprobaciones/rechazos.
- **Sincronización de Sockets**: Eventos `parent:solicitud_cambio`, `parent:nueva_ausencia`, etc.
