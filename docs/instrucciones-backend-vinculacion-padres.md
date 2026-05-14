# Vinculacion padre-conductor: tercera via

## Contexto

La app ahora cubre el caso en que el padre ya completo su perfil, entra al panel sin alumnos registrados y usa el boton `Vincular primer hijo` con un codigo enviado por el conductor.

En ese flujo el frontend abre obligatoriamente el formulario del estudiante, muestra como referencia la informacion existente del padre y envia el codigo junto con los datos minimos del alumno. El paso de ubicar el punto exacto en el mapa se mantiene igual y ocurre despues de la vinculacion.

## Contrato esperado

Endpoint:

```http
POST /api/vinculaciones/vincular-con-codigo
Authorization: Bearer <token-padre>
Content-Type: application/json
```

Payload que puede enviar el frontend cuando el padre no tiene alumnos cargados:

```json
{
  "codigo": "BUS-1234",
  "hijo": {
    "nombre": "Nombre del estudiante",
    "grado": "3er Grado A",
    "colegioNombre": "Nombre del colegio",
    "direccion": "Direccion de referencia",
    "codigoConductor": "BUS-1234",
    "turno_estudio": "matutino"
  },
  "alumno": {
    "nombre": "Nombre del estudiante",
    "grado": "3er Grado A",
    "colegioNombre": "Nombre del colegio",
    "direccion": "Direccion de referencia",
    "parada": "Direccion de referencia",
    "turno_estudio": "matutino",
    "turnoEstudio": "matutino"
  }
}
```

## Reglas para backend

- Si el codigo pertenece a una invitacion de conductor para padres, crear el alumno cuando no exista `alumnoId` previo y asociarlo al padre autenticado.
- Asociar el alumno creado a la ruta/conductor resuelta por el codigo.
- Guardar `direccion` y `parada` como referencia textual inicial. No bloquear ni reemplazar el flujo posterior de geolocalizacion manual en el mapa.
- Aceptar `colegioNombre` y persistirlo en el campo equivalente que ya usa `/padres/mis-hijos`.
- Aceptar `turno_estudio` o `turnoEstudio`; si falta, usar `matutino`.
- Si falta informacion obligatoria del alumno, responder `400` con `infoMissing: true` o un mensaje que incluya `informacion`, para que la app abra el formulario.

## Respuesta sugerida

```json
{
  "ok": true,
  "desc": "Estudiante vinculado a la ruta del conductor.",
  "alumnoId": 123,
  "rutaId": 45
}
```

