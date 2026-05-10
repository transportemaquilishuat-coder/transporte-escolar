// src/services/vinculacionesService.js
import fetchWithAuth from './api';

const esError404 = (error) => String(error?.message || '').startsWith('404');

const fetchConFallback404 = async (principal, respaldo, options = {}) => {
    try {
        return await fetchWithAuth(principal, options);
    } catch (error) {
        if (!esError404(error)) throw error;
        return fetchWithAuth(respaldo, options);
    }
};

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
    fetchConFallback404(
        `/super-admin/colegios/${colegioId}/usuarios`,
        `/vinculaciones/superadmin/colegios/${colegioId}/usuarios`
    );

export const resetAdminPasswordSuperAdmin = (colegioId) =>
    fetchConFallback404(
        `/super-admin/colegios/${colegioId}/reset-admin-password`,
        `/vinculaciones/superadmin/colegios/${colegioId}/reset-admin-password`,
        {
            method: 'POST',
            body: JSON.stringify({
                colegioId,
                colegio_id: colegioId,
            }),
        }
    );

export const impersonateColegio = (colegioId) =>
    fetchConFallback404(
        `/super-admin/colegios/${colegioId}/impersonate`,
        `/vinculaciones/superadmin/colegios/${colegioId}/impersonate`,
        { method: 'POST' }
    );

export const asignarAdminDirecto = (colegioId, email) =>
    fetchWithAuth(
        `/vinculaciones/superadmin/colegios/${colegioId}/asignar-admin`,
        {
            method: 'POST',
            body: JSON.stringify({ email }),
        }
    );

export const desvincularAdmin = (colegioId) =>
    fetchConFallback404(
        `/super-admin/colegios/${colegioId}/desvincular-admin`,
        `/vinculaciones/superadmin/colegios/${colegioId}/desvincular-admin`,
        { method: 'DELETE' }
    );

export const actualizarColegio = (colegioId, datos) =>
    fetchWithAuth(`/vinculaciones/superadmin/colegios/${colegioId}`, {
        method: 'PUT',
        body: JSON.stringify(datos),
    });

export const cambiarEstadoColegio = (colegioId, activo) =>
    fetchWithAuth(`/vinculaciones/superadmin/colegios/${colegioId}/estado`, {
        method: 'PATCH',
        body: JSON.stringify({ activo }),
    });

// ============================================
// REGISTRO CON CÓDIGO (Admin, Conductor, Padre)
// ============================================

export const verificarCodigo = (codigo) =>
    fetchWithAuth(`/vinculaciones/verificar-codigo/${codigo}`);

export const registrarUsuario = (datos) =>
    fetchWithAuth('/auth/registro', {
        method: 'POST',
        body: JSON.stringify(datos),
    });

export const registrarUsuarioConCodigo = (datos) =>
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

export const getPadresAdmin = () =>
    fetchWithAuth('/vinculaciones/admin/padres');

export const vincularPadreAdminDirecto = (datos) =>
    fetchWithAuth('/vinculaciones/admin/padres/directo', {
        method: 'POST',
        body: JSON.stringify(datos),
    });

export const desvincularPadreAdmin = (padreId) =>
    fetchWithAuth(`/vinculaciones/admin/padres/${padreId}`, {
        method: 'DELETE',
    });

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
