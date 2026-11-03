import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

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
