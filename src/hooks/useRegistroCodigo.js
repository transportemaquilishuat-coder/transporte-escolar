import { useState, useCallback } from 'react';
import {
  verificarCodigo,
  registrarUsuario,
  registrarUsuarioConCodigo,
} from '../services/vinculacionesService';

export const useRegistroCodigo = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoCodigo, setInfoCodigo] = useState(null);

  const ejecutar = useCallback(async (fn, ...args) => {
    setLoading(true);
    setError('');
    try {
      return await fn(...args);
    } catch (err) {
      const mensaje = err?.message || 'No se pudo completar la operacion';
      setError(mensaje);
      throw new Error(mensaje);
    } finally {
      setLoading(false);
    }
  }, []);

  const verificar = useCallback(async (codigo) => {
    const resultado = await ejecutar(verificarCodigo, codigo);
    setInfoCodigo(resultado);
    return resultado;
  }, [ejecutar]);

  const registrar = useCallback(async (datos) => {
    const resultado = await ejecutar(registrarUsuario, datos);
    return resultado;
  }, [ejecutar]);

  const registrarConCodigo = useCallback(async (datos) => {
    const resultado = await ejecutar(registrarUsuarioConCodigo, datos);
    return resultado;
  }, [ejecutar]);

  return {
    loading,
    error,
    infoCodigo,
    verificar,
    registrar,
    registrarConCodigo,
  };
};
