// src/hooks/useSuperAdminVinculacion.js
import { useState, useCallback } from 'react';
import {
    getColegiosSuperAdmin,
    crearColegio,
    eliminarColegioSuperAdmin,
    generarCodigoAdmin,
    getCodigosSuperAdmin,
    getUsuariosColegioSuperAdmin,
    resetAdminPasswordSuperAdmin,
} from '../services/vinculacionesService';

export const useSuperAdminVinculacion = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const ejecutar = async (fn, ...args) => {
        setLoading(true);
        setError(null);
        try {
            const resultado = await fn(...args);
            return resultado;
        } catch (err) {
            setError(err.message);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const listarColegios = useCallback(() => ejecutar(getColegiosSuperAdmin), []);
    const crearNuevoColegio = useCallback((datos) => ejecutar(crearColegio, datos), []);
    const eliminarColegio = useCallback((colegioId) => ejecutar(eliminarColegioSuperAdmin, colegioId), []);
    const generarCodigo = useCallback((colegioId, config) => ejecutar(generarCodigoAdmin, colegioId, config), []);
    const listarCodigos = useCallback(() => ejecutar(getCodigosSuperAdmin), []);
    const listarUsuariosColegio = useCallback((colegioId) => ejecutar(getUsuariosColegioSuperAdmin, colegioId), []);
    const restablecerPasswordAdmin = useCallback((colegioId) => ejecutar(resetAdminPasswordSuperAdmin, colegioId), []);

    return {
        loading,
        error,
        listarColegios,
        crearNuevoColegio,
        eliminarColegio,
        generarCodigo,
        listarCodigos,
        listarUsuariosColegio,
        restablecerPasswordAdmin,
    };
};
