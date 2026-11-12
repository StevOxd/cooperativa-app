import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { jsPDF } from 'jspdf';

// Vitest carga la versión de jsPDF para Node, donde save() escribe el archivo en la carpeta de trabajo (#122). Cada
// documento copia los métodos de jsPDF.API al crearse, así que este reemplazo vale para todos: no se escribe nada.
jsPDF.API.save = vi.fn(function guardarSinArchivo() {
  return this;
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

// jsdom no trae estas APIs del navegador; varias pantallas y gráficas las usan al abrir.
window.matchMedia =
  window.matchMedia ||
  ((query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
window.scrollTo = vi.fn();
Element.prototype.scrollIntoView = vi.fn();
window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
window.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
URL.createObjectURL = vi.fn(() => 'blob:prueba');
URL.revokeObjectURL = vi.fn();
HTMLCanvasElement.prototype.getContext = vi.fn(() => null);
