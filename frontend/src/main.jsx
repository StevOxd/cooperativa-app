import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ES_DESARROLLO } from './utils/entorno';
import './index.css';

// La pestaña del navegador también dice que no es producción
if (ES_DESARROLLO) document.title = `[Desarrollo] ${document.title}`;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
