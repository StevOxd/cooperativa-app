import { vi } from 'vitest';

/** Respuesta genérica de la API falsa: un objeto que también sirve de lista vacía. */
export const respuestaVacia = () => ({
  data: {
    success: true,
    data: [],
    total: 0,
    items: [],
    usuarios: [],
    asociados: [],
    pagination: { total: 0, page: 1, pages: 1, limit: 20 },
  },
});

export const apiFalsa = () => ({
  get: vi.fn(async () => respuestaVacia()),
  post: vi.fn(async () => respuestaVacia()),
  put: vi.fn(async () => respuestaVacia()),
  patch: vi.fn(async () => respuestaVacia()),
  delete: vi.fn(async () => respuestaVacia()),
  defaults: { baseURL: '/api', headers: {} },
  interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
});
