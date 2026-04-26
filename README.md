# transporte-backend

Backend en Node.js + Express + PostgreSQL para transporte escolar.

## Stack

- Node.js
- Express 5
- PostgreSQL (`pg`)
- JWT
- Socket.IO

## Scripts

```bash
npm install
npm run dev
```

Servidor principal:

- `src/index.js`

Script de setup de base de datos:

- `src/database_setup.js`

Ejecutar setup inicial:

```bash
node src/database_setup.js
```

## Variables de entorno

Crear un archivo `.env` basado en `.env.example`:

```env
PORT=3000
JWT_SECRET=change_this_jwt_secret
JWT_EXPIRES_IN=365d
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DB_NAME
```

## Estructura

```text
src/
  controllers/
  middleware/
  routes/
  database.js
  database_setup.js
  index.js
```

## Rutas disponibles

### Auth

- `POST /api/auth/login`
- `POST /api/auth/registro`

### Rutas

- `GET /api/rutas`
- `GET /api/rutas/:id`

### Alumnos

- `GET /api/alumnos`
- `GET /api/alumnos/:id`

### Pagos

- `GET /api/pagos`
- `GET /api/pagos/pendientes`

### Asignaciones

- `GET /api/asignaciones/conductor/:conductorId`
- `POST /api/asignaciones/ausencia`
- `GET /api/asignaciones/ausencias/:rutaId`
- `POST /api/asignaciones/abordar`

Notas:
- `GET /api/asignaciones/conductor/:conductorId` ahora responde desde PostgreSQL real.
- Incluye `latitude` y `longitude` del alumno cuando existan.
- El estado `abordado` se calcula usando `eventos_ruta` del día actual.
- El estado `ausente` se calcula usando `ausencias` del día actual.

### Admin

- `GET /api/admin/dashboard`
- `GET /api/admin/conductores`
- `GET /api/admin/alumnos`
- `POST /api/admin/alumnos`
- `PUT /api/admin/alumnos/:id`
- `GET /api/admin/rutas`
- `POST /api/admin/rutas`
- `GET /api/admin/eventos-hoy`
- `GET /api/admin/configuracion`
- `PUT /api/admin/configuracion/:clave`
- `GET /api/admin/conductores-activos`

### Super Admin

- `GET /api/super-admin/dashboard`
- `GET /api/super-admin/colegios`
- `GET /api/super-admin/anuncios`
- `POST /api/super-admin/anuncios`
- `PUT /api/super-admin/anuncios/:id`
- `DELETE /api/super-admin/anuncios/:id`
- `POST /api/super-admin/usuarios`
- `GET /api/super-admin/alertas/recogida-5min`
- `PUT /api/super-admin/alertas/recogida-5min`
- `GET /api/super-admin/mensajes-diarios`
- `PUT /api/super-admin/mensajes-diarios`
- `POST /api/super-admin/alertas/recogida-5min/generar-mes`
- `GET /api/super-admin/alertas/recogida-5min/agenda`
- `DELETE /api/super-admin/alertas/recogida-5min/agenda`

### Notificaciones

- `POST /api/notificaciones/token`
- `DELETE /api/notificaciones/token`
- `POST /api/notificaciones/enviar`
- `POST /api/notificaciones/alerta-bus`

### Tiempo real

- `GET /`
- `GET /api/ubicacion`
- WebSocket con Socket.IO para ubicaciones y estado de rutas

## Notas

- `src/database.js` conecta a PostgreSQL usando `DATABASE_URL`.
- `alumnos` ahora admite `latitude` y `longitude` para el punto exacto de recogida.
- Se agregaron las tablas `alertas_configuracion` y `alertas_programadas` para la agenda del super administrador.
- La ruta `super-admin` requiere token JWT con rol `super_admin`.
- No compartir `.env` real ni `node_modules` al pasar el repo.
