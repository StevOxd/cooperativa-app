import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Alert, Button } from '../ui';

/**
 * Atrapa el fallo al descargar una pantalla que se carga al abrirla (issue #21): conexión
 * intermitente, o una versión nueva del frontend que ya no tiene los archivos de la anterior.
 * En lugar de dejar la página en blanco, avisa y ofrece recargar.
 *
 * Para que al navegar a otra pantalla se vuelva a intentar, quien lo usa le pasa `key` con la ruta.
 *
 * @param {Object} props
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children
 */
export class ScreenErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { fallo: false };
  }

  static getDerivedStateFromError() {
    return { fallo: true };
  }

  componentDidCatch(error) {
    console.error('[UI] No se pudo mostrar la pantalla:', error);
  }

  render() {
    if (!this.state.fallo) return this.props.children;
    return (
      <div className={this.props.className}>
        <Alert tone="danger" title="No se pudo cargar esta pantalla">
          <p>Revise su conexión y recargue la página.</p>
          <Button className="mt-3" size="sm" variant="secondary" icon={RotateCcw} onClick={() => window.location.reload()}>
            Recargar
          </Button>
        </Alert>
      </div>
    );
  }
}

export default ScreenErrorBoundary;
