// src/services/vinculacionesService.js
import fetchWithAuth from './api';

// ============================================
// SUPERADMIN
// ============================================

export const getColegiosSuperAdmin = () =>
    fetchWithAuth('/vinculaciones/superadmin/colegios');

export const crearColegio = (datos) =>
    fetchWithAuth('/vinculaciones/superadmin/colegios', {
        method: 'POST',
        body: JSON.stringify(datos),
    });

export const eliminarColegioSuperAdmin = (colegioId) =>
    fetchWithAuth(`/vinculaciones/superadmin/colegios/${colegioId}`, {
        method: 'DELETE',
    });

export const generarCodigoAdmin = (colegioId, { maxUsos = 1, diasValidez = 7 }) =>
    fetchWithAuth(`/vinculaciones/superadmin/colegios/${colegioId}/codigo`, {
        method: 'POST',
        body: JSON.stringify({
            colegioId,
            colegio_id: colegioId,
            maxUsos,
            max_usos: maxUsos,
            diasValidez,
            dias_validez: diasValidez,
        }),
    });

export const getCodigosSuperAdmin = () =>
    fetchWithAuth('/vinculaciones/superadmin/codigos');

export const getUsuariosColegioSuperAdmin = (colegioId) =>
    fetchWithAuth(`/api/super-admin/colegios/${colegioId}/usuarios`);

export const resetAdminPasswordSuperAdmin = (colegioId) =>
    fetchWithAuth(`/api/super-admin/colegios/${colegioId}/reset-admin-password`, {
        method: 'POST',
        body: JSON.stringify({
            colegioId,
            colegio_id: colegioId,
        }),
    });

// ============================================
// REGISTRO CON CÓDIGO (Admin, Conductor, Padre)
// ============================================

export const verificarCodigo = (codigo) =>
    fetchWithAuth(`/vinculaciones/verificar-codigo/${codigo}`);

export const registroConCodigo = (datos) =>
    fetchWithAuth('/vinculaciones/registro-con-codigo', {
        method: 'POST',
        body: JSON.stringify(datos),
    });

// ============================================
// ADMIN: Gestión de Conductores
// ============================================

export const getConductoresAdmin = () =>
    fetchWithAuth('/vinculaciones/admin/conductores');

export const generarCodigoConductor = ({ maxUsos = 1, diasValidez = 7 }) =>
    fetchWithAuth('/vinculaciones/admin/conductores/codigo', {
        method: 'POST',
        body: JSON.stringify({
            maxUsos,
            max_usos: maxUsos,
            diasValidez,
            dias_validez: diasValidez,
        }),
    });

export const vincularConductorDirecto = (datos) =>
    fetchWithAuth('/vinculaciones/admin/conductores/directo', {
        method: 'POST',
        body: JSON.stringify(datos),
    });

export const desvincularConductor = (conductorId) =>
    fetchWithAuth(`/vinculaciones/admin/conductores/${conductorId}`, {
        method: 'DELETE',
    });

// ============================================
// CONDUCTOR: Gestión de Padres
// ============================================

export const getPadresConductor = () =>
    fetchWithAuth('/vinculaciones/conductor/padres');

export const generarCodigoPadre = ({ maxUsos = 1, diasValidez = 7 }) =>
    fetchWithAuth('/vinculaciones/conductor/padres/codigo', {
        method: 'POST',
        body: JSON.stringify({
            maxUsos,
            max_usos: maxUsos,
            diasValidez,
            dias_validez: diasValidez,
        }),
    });

export const vincularPadreDirecto = (datos) =>
    fetchWithAuth('/vinculaciones/conductor/padres/directo', {
        method: 'POST',
        body: JSON.stringify(datos),
    });

export const desvincularPadre = (padreId) =>
    fetchWithAuth(`/vinculaciones/conductor/padres/${padreId}`, {
        method: 'DELETE',
    });

// ============================================
// PADRE
// ============================================

export const getMisConductores = () =>
    fetchWithAuth('/vinculaciones/padre/mis-conductores');
