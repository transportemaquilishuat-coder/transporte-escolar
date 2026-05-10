// src/hooks/useAdminVinculacion.js
import { useState, useCallback } from 'react';
import {
    getConductoresAdmin,
    generarCodigoConductor,
    vincularConductorDirecto,
    desvincularConductor,
    getPadresAdmin,
    vincularPadreAdminDirecto,
    desvincularPadreAdmin,
} from '../services/vinculacionesService';

export const useAdminVinculacion = () => {
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

    const listarConductores = useCallback(() => ejecutar(getConductoresAdmin), []);
    const generarCodigo = useCallback((config) => ejecutar(generarCodigoConductor, config), []);
    const vincularDirecto = useCallback((datos) => ejecutar(vincularConductorDirecto, datos), []);
    const eliminarConductor = useCallback((id) => ejecutar(desvincularConductor, id), []);
    const listarPadres = useCallback(() => ejecutar(getPadresAdmin), []);
    const vincularPadreDirecto = useCallback((datos) => ejecutar(vincularPadreAdminDirecto, datos), []);
    const eliminarPadre = useCallback((id) => ejecutar(desvincularPadreAdmin, id), []);

    return {
        loading,
        error,
        listarConductores,
        generarCodigo,
        vincularDirecto,
        eliminarConductor,
        listarPadres,
        vincularPadreDirecto,
        eliminarPadre,
    };
};
