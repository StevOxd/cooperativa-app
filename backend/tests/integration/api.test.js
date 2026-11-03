// Las pruebas nunca envían correo real: debe ir antes de cargar el servidor.
process.env.MAIL_ENABLED = 'false';

const request = require('supertest');
const { app } = require('../../src/server');
const db = require('../../src/config/db');

const iniciarSesion = (identifier, password) => request(app).post('/api/auth/login').send({ identifier, password });

describe('API con PostgreSQL', () => {
  const tokens = [];

  const cerrarSesiones = async () => {
    await Promise.all(
      tokens.splice(0).map((token) => request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`))
    );
  };

  afterEach(cerrarSesiones);

  afterAll(async () => {
    await db.query(
      "UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE codigo_corporativo = 'AD-1'"
    );
    await db.pool.end();
  });

  test('GET /api/health responde que el servicio está arriba', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });

  test('una ruta que no existe responde 404', async () => {
    const res = await request(app).get('/api/no-existe');
    expect(res.status).toBe(404);
  });

  test('el login correcto devuelve un token y no devuelve la contraseña', async () => {
    const res = await iniciarSesion('AD-1', 'admin123');
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toContain('password_hash');
    tokens.push(res.body.token);
  });

  test('una contraseña incorrecta y un usuario inexistente reciben la misma respuesta', async () => {
    const incorrecta = await iniciarSesion('AD-1', 'claveIncorrecta1!');
    const inexistente = await iniciarSesion(`NO-EXISTE-${Date.now()}`, 'claveIncorrecta1!');
    expect(incorrecta.status).toBe(401);
    expect(inexistente.status).toBe(401);
    expect(inexistente.body.message).toBe(incorrecta.body.message);
    await db.query(
      "UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE codigo_corporativo = 'AD-1'"
    );
  });

  test.each(['/api/usuarios', '/api/operador/solicitudes', '/api/reportes/cierre-caja', '/api/admin/asociados'])(
    '%s no responde datos sin sesión',
    async (ruta) => {
      const res = await request(app).get(ruta);
      expect(res.status).toBe(401);
    }
  );

  test('un token inválido recibe 403 en una ruta protegida', async () => {
    const res = await request(app).get('/api/usuarios').set('Authorization', 'Bearer token-falso');
    expect(res.status).toBe(403);
  });

  test('el administrador lista usuarios y un token cerrado ya no sirve', async () => {
    const { body } = await iniciarSesion('AD-1', 'admin123');
    const lista = await request(app).get('/api/usuarios').set('Authorization', `Bearer ${body.token}`);
    expect(lista.status).toBe(200);

    await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${body.token}`);
    const despues = await request(app).get('/api/usuarios').set('Authorization', `Bearer ${body.token}`);
    expect(despues.status).toBe(401);
  });

  test('la base rechaza un usuario duplicado y conserva los roles sembrados', async () => {
    const { rows } = await db.query('SELECT codigo FROM roles ORDER BY codigo');
    expect(rows.map((r) => r.codigo)).toEqual(
      expect.arrayContaining(['ADMINISTRADOR', 'ASOCIADO', 'EJECUTIVO', 'OPERADOR'])
    );
    await expect(
      db.query("UPDATE usuarios SET codigo_corporativo = 'AD-1' WHERE codigo_corporativo = 'OP-1'")
    ).rejects.toThrow();
  });
});
