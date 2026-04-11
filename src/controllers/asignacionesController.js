// Datos simulados — luego los conectamos a PostgreSQL
const rutas = [
    { id: 1, nombre: 'Ruta Norte', conductorId: 2 },
    { id: 2, nombre: 'Ruta Sur', conductorId: 2 },
];

const alumnos = [
    { id: 1, nombre: 'Pedro García', grado: '3ro primaria', rutaId: 1, parada: 'Col. San Benito', orden: 1, estado: 'pendiente' },
    { id: 2, nombre: 'María López', grado: '5to primaria', rutaId: 1, parada: 'Col. Escalón', orden: 2, estado: 'pendiente' },
    { id: 3, nombre: 'Juan Martínez', grado: '2do primaria', rutaId: 1, parada: 'Col. Miramonte', orden: 3, estado: 'pendiente' },
    { id: 4, nombre: 'Sofía Hernández', grado: '4to primaria', rutaId: 1, parada: 'Col. Santa Marta', orden: 4, estado: 'pendiente' },
    { id: 5, nombre: 'Luis Ramírez', grado: '1ro primaria', rutaId: 1, parada: 'Col. Las Mercedes', orden: 5, estado: 'pendiente' },
];

const ausencias = [];

// GET /api/asignaciones/conductor/:conductorId
exports.alumnosPorConductor = (req, res) => {
    const conductorId = parseInt(req.params.conductorId);
    const rutasDelConductor = rutas.filter(r => r.conductorId === conductorId);

    if (rutasDelConductor.length === 0) {
        return res.status(404).json({ error: 'No se encontraron rutas para este conductor' });
    }

    const rutaIds = rutasDelConductor.map(r => r.id);
    const alumnosDeRuta = alumnos
        .filter(a => rutaIds.includes(a.rutaId))
        .map(a => ({
            ...a,
            ausente: ausencias.some(au => au.alumnoId === a.id && au.fecha === hoy()),
        }))
        .sort((a, b) => a.orden - b.orden);

    res.json({
        rutas: rutasDelConductor,
        alumnos: alumnosDeRuta,
        totalAlumnos: alumnosDeRuta.length,
        ausentes: alumnosDeRuta.filter(a => a.ausente).length,
    });
};

// POST /api/asignaciones/ausencia
exports.reportarAusencia = (req, res) => {
    const { alumnoId, padreNombre, motivo } = req.body;
    if (!alumnoId) {
        return res.status(400).json({ error: 'alumnoId es requerido' });
    }
    const ausencia = {
        id: ausencias.length + 1,
        alumnoId,
        padreNombre: padreNombre || 'Padre',
        motivo: motivo || 'Sin especificar',
        fecha: hoy(),
        hora: new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' }),
    };
    ausencias.push(ausencia);
    res.json({ mensaje: 'Ausencia reportada correctamente', ausencia });
};

// GET /api/asignaciones/ausencias/:rutaId
exports.ausenciasDeLaRuta = (req, res) => {
    const rutaId = parseInt(req.params.rutaId);
    const alumnosRuta = alumnos.filter(a => a.rutaId === rutaId).map(a => a.id);
    const ausenciasHoy = ausencias.filter(
        au => alumnosRuta.includes(au.alumnoId) && au.fecha === hoy()
    );
    res.json({ ausencias: ausenciasHoy, total: ausenciasHoy.length });
};

// POST /api/asignaciones/abordar
exports.marcarAbordado = (req, res) => {
    const { alumnoId } = req.body;
    const alumno = alumnos.find(a => a.id === alumnoId);
    if (!alumno) {
        return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    alumno.estado = 'abordado';
    res.json({ mensaje: `${alumno.nombre} marcado como abordado`, alumno });
};

const hoy = () => new Date().toISOString().split('T')[0];