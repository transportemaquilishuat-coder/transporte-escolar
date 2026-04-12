require('dotenv').config();
const pool = require('./database');

const pool = require('./database');

const crearTablas = async () => {
    try {
        await pool.query(`
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
    `);

        console.log('✅ Tablas creadas correctamente');

        // Insertar datos iniciales
        await pool.query(`
      INSERT INTO usuarios (nombre, email, password, rol, telefono, dui)
      VALUES 
        ('Ana Admin',       'admin@test.com',     '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin',     '7000-0001', '00000001-0'),
        ('Luis Conductor',  'conductor@test.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'conductor', '7000-0002', '00000002-0'),
        ('Carlos Padre',    'padre@test.com',     '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'padre',     '7000-0003', '00000003-0')
      ON CONFLICT (email) DO NOTHING;

      INSERT INTO rutas (nombre, conductor_id)
      VALUES ('Ruta Norte', 2), ('Ruta Sur', 2)
      ON CONFLICT DO NOTHING;

      INSERT INTO alumnos (nombre, grado, ruta_id, padre_id, parada, orden)
      VALUES 
        ('Pedro García',    '3ro primaria', 1, 3, 'Col. San Benito',   1),
        ('María López',     '5to primaria', 1, 3, 'Col. Escalón',      2),
        ('Juan Martínez',   '2do primaria', 1, 3, 'Col. Miramonte',    3),
        ('Sofía Hernández', '4to primaria', 1, 3, 'Col. Santa Marta',  4),
        ('Luis Ramírez',    '1ro primaria', 1, 3, 'Col. Las Mercedes', 5)
      ON CONFLICT DO NOTHING;
    `);

        console.log('✅ Datos iniciales insertados');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
};

crearTablas();