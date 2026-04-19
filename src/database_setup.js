require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const crearTablas = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS colegios (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        logo_url TEXT,
        plan VARCHAR(20) DEFAULT 'trial',
        activo BOOLEAN DEFAULT true,
        dias_prueba_restantes INTEGER DEFAULT 30,
        creado_en TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        rol VARCHAR(20) NOT NULL CHECK (rol IN ('padre', 'conductor', 'admin')),
        telefono VARCHAR(20),
        dui VARCHAR(20),
        licencia VARCHAR(50),
        placa VARCHAR(20),
        activo BOOLEAN DEFAULT true,
        creado_en TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS rutas (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        conductor_id INTEGER REFERENCES usuarios(id),
        colegio_id INTEGER REFERENCES colegios(id),
        activa BOOLEAN DEFAULT true,
        creado_en TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS alumnos (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        grado VARCHAR(50),
        ruta_id INTEGER REFERENCES rutas(id),
        padre_id INTEGER REFERENCES usuarios(id),
        parada VARCHAR(150),
        latitude DECIMAL(10,8),
        longitude DECIMAL(11,8),
        orden INTEGER,
        activo BOOLEAN DEFAULT true,
        creado_en TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ausencias (
        id SERIAL PRIMARY KEY,
        alumno_id INTEGER REFERENCES alumnos(id),
        padre_id INTEGER REFERENCES usuarios(id),
        motivo TEXT,
        fecha DATE DEFAULT CURRENT_DATE,
        hora TIME DEFAULT CURRENT_TIME,
        creado_en TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS eventos_ruta (
        id SERIAL PRIMARY KEY,
        ruta_id INTEGER REFERENCES rutas(id),
        conductor_id INTEGER REFERENCES usuarios(id),
        tipo VARCHAR(50),
        descripcion TEXT,
        latitud DECIMAL(10,8),
        longitud DECIMAL(11,8),
        creado_en TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS pagos (
        id SERIAL PRIMARY KEY,
        padre_id INTEGER REFERENCES usuarios(id),
        monto DECIMAL(10,2),
        mes VARCHAR(20),
        estado VARCHAR(20) DEFAULT 'pendiente',
        creado_en TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tokens_push (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER REFERENCES usuarios(id),
        token VARCHAR(255) NOT NULL,
        plataforma VARCHAR(10),
        activo BOOLEAN DEFAULT true,
        creado_en TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS configuracion (
        id SERIAL PRIMARY KEY,
        clave VARCHAR(100) UNIQUE NOT NULL,
        valor VARCHAR(255) NOT NULL,
        descripcion TEXT,
        actualizado_en TIMESTAMP DEFAULT NOW()
      );

CREATE TABLE IF NOT EXISTS anuncios_voz (
  id SERIAL PRIMARY KEY,
  colegio_id INTEGER REFERENCES colegios(id),
  titulo VARCHAR(100) NOT NULL,
  mensaje TEXT NOT NULL,
  activo BOOLEAN DEFAULT true,
  orden INTEGER DEFAULT 1,
  creado_por VARCHAR(50) DEFAULT 'superadmin',
  creado_en TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS super_admins (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  creado_en TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alertas_configuracion (
  id SERIAL PRIMARY KEY,
  tipo VARCHAR(50) UNIQUE NOT NULL,
  activo BOOLEAN DEFAULT true,
  modo VARCHAR(20) NOT NULL DEFAULT 'mensual',
  titulo VARCHAR(150) NOT NULL,
  mensaje TEXT NOT NULL,
  hora_recogida VARCHAR(5) NOT NULL,
  hora_alerta VARCHAR(5) NOT NULL,
  dias_semana JSONB DEFAULT '[]'::jsonb,
  canal VARCHAR(20) DEFAULT 'push',
  actualizado_por VARCHAR(100),
  creado_en TIMESTAMP DEFAULT NOW(),
  actualizado_en TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alertas_programadas (
  id SERIAL PRIMARY KEY,
  configuracion_id INTEGER REFERENCES alertas_configuracion(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL,
  titulo VARCHAR(150) NOT NULL,
  mensaje TEXT NOT NULL,
  fecha_programada TIMESTAMP NOT NULL,
  canal VARCHAR(20) DEFAULT 'push',
  activo BOOLEAN DEFAULT true,
  enviada BOOLEAN DEFAULT false,
  creado_en TIMESTAMP DEFAULT NOW(),
  actualizado_en TIMESTAMP DEFAULT NOW()
);
    CREATE TABLE IF NOT EXISTS puntos_ruta (
  id SERIAL PRIMARY KEY,
  ruta_id INTEGER REFERENCES rutas(id),
  latitud DECIMAL(10,8) NOT NULL,
  longitud DECIMAL(11,8) NOT NULL,
  orden INTEGER NOT NULL,
  nombre_parada VARCHAR(100),
  creado_en TIMESTAMP DEFAULT NOW()
);

INSERT INTO puntos_ruta (ruta_id, latitud, longitud, orden, nombre_parada)
VALUES
  (1, 13.6929, -89.2182, 1, 'Punto de inicio'),
  (1, 13.6950, -89.2200, 2, 'Col. San Benito'),
  (1, 13.6975, -89.2215, 3, 'Col. Escalón'),
  (1, 13.7000, -89.2230, 4, 'Col. Miramonte'),
  (1, 13.7020, -89.2250, 5, 'Colegio destino')
ON CONFLICT DO NOTHING;
`);
    console.log('✅ Tablas creadas correctamente');

    await pool.query(`
      INSERT INTO usuarios (nombre, email, password, rol, telefono, dui)
      VALUES 
        ('Ana Admin',      'admin@test.com',     '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin',     '7000-0001', '00000001-0'),
        ('Luis Conductor', 'conductor@test.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'conductor', '7000-0002', '00000002-0'),
        ('Carlos Padre',   'padre@test.com',     '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'padre',     '7000-0003', '00000003-0')
      ON CONFLICT (email) DO NOTHING;

      INSERT INTO rutas (nombre, conductor_id, colegio_id)
      VALUES ('Ruta Norte', 2, 1), ('Ruta Sur', 2, 1)
      ON CONFLICT DO NOTHING;

      INSERT INTO alumnos (nombre, grado, ruta_id, padre_id, parada, orden)
      VALUES 
        ('Pedro García',    '3ro primaria', 1, 3, 'Col. San Benito',   1),
        ('María López',     '5to primaria', 1, 3, 'Col. Escalón',      2),
        ('Juan Martínez',   '2do primaria', 1, 3, 'Col. Miramonte',    3),
        ('Sofía Hernández', '4to primaria', 1, 3, 'Col. Santa Marta',  4),
        ('Luis Ramírez',    '1ro primaria', 1, 3, 'Col. Las Mercedes', 5)
      ON CONFLICT DO NOTHING;

      INSERT INTO configuracion (clave, valor, descripcion)
      VALUES 
        ('llamadas_conductor',        'true',  'Permitir que padres llamen al conductor'),
        ('mostrar_numero_conductor',  'true',  'Mostrar número del conductor a los padres'),
        ('periodo_prueba_dias',       '30',    'Días de período de prueba gratuito')
      ON CONFLICT (clave) DO NOTHING;

       INSERT INTO colegios (nombre, plan)
VALUES 
  ('Colegio San José', 'activo'),
  ('Colegio Santa María', 'trial'),
  ('Colegio El Sagrado Corazón', 'trial')
ON CONFLICT DO NOTHING;

INSERT INTO anuncios_voz (colegio_id, titulo, mensaje, orden)
VALUES
  (1, 'Recordatorio de tarea', 'No olvides tu tarea de matemáticas. En 5 minutos llega el transporte escolar.', 1),
  (1, 'Oración del día', 'Haz tu oración del día. En 5 minutos llega el transporte escolar.', 2),
  (1, 'Mensaje motivador', 'Hoy será un gran día. En 5 minutos llega el transporte escolar.', 3)
ON CONFLICT DO NOTHING;

INSERT INTO super_admins (nombre, email, password)
VALUES ('Daniel', 'superadmin@tuapp.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi')
ON CONFLICT (email) DO NOTHING;

INSERT INTO alertas_configuracion (tipo, activo, modo, titulo, mensaje, hora_recogida, hora_alerta, dias_semana, canal, actualizado_por)
VALUES (
  'recogida_5min',
  true,
  'mensual',
  'Recogida en 5 minutos',
  'El transporte escolar llegara en 5 minutos al punto de recogida.',
  '06:45',
  '06:40',
  '[1,2,3,4,5]'::jsonb,
  'push',
  'setup'
)
ON CONFLICT (tipo) DO NOTHING;
    `);

    console.log('✅ Datos iniciales insertados');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};
crearTablas();
