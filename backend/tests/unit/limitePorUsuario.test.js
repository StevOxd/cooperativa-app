const express = require('express');
const request = require('supertest');
const { limitePorUsuario } = require('../../src/middlewares/limitePorUsuario');

const TOPE = 2;
const TOPE_PRUEBAS = 50;
const MENSAJE = 'Consultó demasiadas veces seguidas.';

/** Aplicación mínima: el usuario de la sesión llega en una cabecera, como lo dejaría verifyToken en req.user. */
const appCon = (limitador) => {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id_usuario: Number(req.get('x-usuario')) };
    next();
  });
  app.get('/', limitador, (_req, res) => res.json({ success: true }));
  return app;
};

describe('limitePorUsuario (#121)', () => {
  const entornoOriginal = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = entornoOriginal;
  });

  test('fuera de pruebas rige el tope normal, con el mensaje y el código de siempre', async () => {
    process.env.NODE_ENV = 'production';
    const app = appCon(limitePorUsuario({ max: TOPE, maxPruebas: TOPE_PRUEBAS, mensaje: MENSAJE }));
    for (let i = 0; i < TOPE; i++) await request(app).get('/').set('x-usuario', '1').expect(200);
    const bloqueada = await request(app).get('/').set('x-usuario', '1');
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.headers['ratelimit-limit']).toBe(String(TOPE));
    expect(bloqueada.body).toEqual({ success: false, message: MENSAJE, error: 'RATE_LIMIT_EXCEEDED' });
  });

  test('cuenta por usuario, no por conexión', async () => {
    process.env.NODE_ENV = 'production';
    const app = appCon(limitePorUsuario({ max: TOPE, maxPruebas: TOPE_PRUEBAS, mensaje: MENSAJE }));
    for (let i = 0; i < TOPE; i++) await request(app).get('/').set('x-usuario', '1').expect(200);
    await request(app).get('/').set('x-usuario', '2').expect(200);
  });

  test.each(['test', 'development'])('con NODE_ENV=%s rige el tope de pruebas', async (entorno) => {
    process.env.NODE_ENV = entorno;
    const app = appCon(limitePorUsuario({ max: TOPE, maxPruebas: TOPE_PRUEBAS, mensaje: MENSAJE }));
    const respuesta = await request(app).get('/').set('x-usuario', '1');
    expect(respuesta.headers['ratelimit-limit']).toBe(String(TOPE_PRUEBAS));
  });
});
