// src/hooks/useConductorVinculacion.js
import { useState, useCallback } from 'react';
import {
    getPadresConductor,
    generarCodigoPadre,
    vincularPadreDirecto,
    desvincularPadre,
} from '../services/vinculacionesService';

export const useConductorVinculacion = () => {
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

    const listarPadres = useCallback(() => ejecutar(getPadresConductor), []);
    const generarCodigo = useCallback((config) => ejecutar(generarCodigoPadre, config), []);
    const vincularDirecto = useCallback((datos) => ejecutar(vincularPadreDirecto, datos), []);
    const eliminarPadre = useCallback((id) => ejecutar(desvincularPadre, id), []);

    return {
        loading,
        error,
        listarPadres,
        generarCodigo,
        vincularDirecto,
        eliminarPadre,
    };
};