import React, { useState } from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getDisplayName } from '../components/layout/navigation';
import { Alert, Button, Card, CardBody, CardFooter, Field, Input, PageHeader, Select } from '../components/ui';
import { descargarCsv } from '../utils/csv';
import { generateReportPdf } from '../utils/pdfs';
import {
  ASOCIADOS_POR_ESTADO, hoyEnGuatemala, nombreDeArchivo, reportesDelRol, tablaCsv,
} from '../utils/reporteria/definiciones';

// El mismo máximo del servidor (REPORTES.MAX_DIAS_PERIODO)
const MAX_DIAS_PERIODO = 366;

const diasEntre = (desde, hasta) => (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000;

/** Del primer día del mes a hoy, o solo hoy para un reporte de un día. */
const filtrosIniciales = (filtro) => {
  const hoy = hoyEnGuatemala();
  if (filtro === 'dia') return { fecha: hoy };
  if (filtro === 'estado') return { estado: '' };
  return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy };
};

/** Qué impide generar el reporte con estos filtros (el servidor lo vuelve a revisar), o null. */
const problemaDeFiltros = (filtro, f) => {
  if (filtro === 'dia') return f.fecha ? null : 'Elija el día.';
  if (filtro !== 'periodo') return null;
  if (!f.desde || !f.hasta) return 'Elija las dos fechas.';
  if (f.desde > f.hasta) return 'Debe ser igual o posterior a la fecha inicial.';
  if (diasEntre(f.desde, f.hasta) > MAX_DIAS_PERIODO) return 'El período es de un año como máximo.';
  return null;
};

/**
 * Un reporte: qué contiene, sus filtros y la descarga en PDF o CSV. Los datos los trae el servidor, que registra la
 * descarga con un folio; el archivo se arma aquí.
 *
 * @param {Object} props
 * @param {import('../utils/reporteria/definiciones').DefinicionReporte} props.definicion
 * @param {{ nombre: string }} props.usuario - Quien lo genera (para las firmas del PDF).
 */
const ReporteCard = ({ definicion, usuario }) => {
  const { toast } = useToast();
  const [filtros, setFiltros] = useState(() => filtrosIniciales(definicion.filtro));
  const [generando, setGenerando] = useState(null);
  const [error, setError] = useState('');
  const Icono = definicion.icono;
  const hoy = hoyEnGuatemala();
  const problema = problemaDeFiltros(definicion.filtro, filtros);

  const cambiar = (campo) => (e) => {
    const valor = e.target.value;
    setFiltros((f) => ({ ...f, [campo]: valor }));
    setError('');
  };

  const descargar = async (formato) => {
    setGenerando(formato);
    setError('');
    let reporte;
    try {
      const params = Object.fromEntries(Object.entries({ ...filtros, formato }).filter(([, valor]) => valor));
      reporte = (await api.get(`/reportes/${definicion.id}`, { params })).data.reporte;
      if (formato === 'PDF') {
        await generateReportPdf({ definicion, reporte, usuario });
      } else {
        descargarCsv({ nombre: nombreDeArchivo(definicion, reporte, 'csv'), ...tablaCsv(definicion, reporte) });
      }
      const registros = reporte.filas.length;
      if (registros === 0) {
        toast.info(
          `${definicion.titulo} no tiene registros ${definicion.filtro === 'dia' ? 'ese día' : 'con esos filtros'}. Folio ${reporte.folio}.`,
          'Reporte sin registros'
        );
      } else {
        toast.success(
          `${definicion.titulo}: ${registros.toLocaleString('es-GT')} ${registros === 1 ? 'registro' : 'registros'}. Folio ${reporte.folio}.`,
          'Reporte descargado'
        );
      }
    } catch (err) {
      if (reporte) {
        // El servidor ya lo registró: falló el armado del archivo en el navegador
        console.error('Error al armar el archivo del reporte:', err);
        setError(`Se registró el folio ${reporte.folio}, pero no se pudo armar el archivo. Intente de nuevo.`);
      } else {
        setError(err.response?.data?.message || 'No se pudo generar el reporte. Intente de nuevo.');
      }
    } finally {
      setGenerando(null);
    }
  };

  return (
    <Card as="article" className="flex flex-col" aria-labelledby={`reporte-${definicion.id}`}>
      <div className="flex items-start gap-3 px-5 pt-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700">
          <Icono className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id={`reporte-${definicion.id}`} className="text-base font-semibold text-ink">{definicion.titulo}</h2>
          <p className="mt-0.5 text-sm text-ink-muted">{definicion.descripcion}</p>
        </div>
      </div>

      <CardBody className="flex-1 space-y-3">
        {definicion.filtro === 'periodo' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Desde">
              <Input type="date" value={filtros.desde} max={hoy} onChange={cambiar('desde')} required />
            </Field>
            <Field label="Hasta" error={problema || undefined}>
              <Input type="date" value={filtros.hasta} max={hoy} onChange={cambiar('hasta')} required />
            </Field>
          </div>
        )}
        {definicion.filtro === 'dia' && (
          <Field label="Día" error={problema || undefined} className="sm:max-w-[12rem]">
            <Input type="date" value={filtros.fecha} max={hoy} onChange={cambiar('fecha')} required />
          </Field>
        )}
        {definicion.filtro === 'estado' && (
          <Field label="Asociados" className="sm:max-w-[16rem]">
            <Select value={filtros.estado} onChange={cambiar('estado')}>
              <option value="">Todos</option>
              {Object.entries(ASOCIADOS_POR_ESTADO).map(([valor, texto]) => (
                <option key={valor} value={valor}>{texto}</option>
              ))}
            </Select>
          </Field>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
      </CardBody>

      <CardFooter>
        <Button
          variant="secondary"
          icon={FileSpreadsheet}
          onClick={() => descargar('CSV')}
          loading={generando === 'CSV'}
          disabled={Boolean(problema) || (Boolean(generando) && generando !== 'CSV')}
        >
          CSV para Excel<span className="sr-only">: {definicion.titulo}</span>
        </Button>
        <Button
          icon={FileText}
          onClick={() => descargar('PDF')}
          loading={generando === 'PDF'}
          disabled={Boolean(problema) || (Boolean(generando) && generando !== 'PDF')}
        >
          PDF<span className="sr-only">: {definicion.titulo}</span>
        </Button>
      </CardFooter>
    </Card>
  );
};

/**
 * Reportes de gestión del personal (issue #85): cada rol ve los suyos. El servidor decide quién saca cada reporte y
 * registra cada descarga.
 */
export const ReportesPage = () => {
  const { user } = useAuth();
  const reportes = reportesDelRol(user?.rol);
  const usuario = { nombre: getDisplayName(user) };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes"
        description="Elija qué incluir y descargue el reporte en PDF para imprimirlo o en CSV para abrirlo en Excel. Cada descarga queda registrada con un folio."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {reportes.map((definicion) => (
          <ReporteCard key={definicion.id} definicion={definicion} usuario={usuario} />
        ))}
      </div>
    </div>
  );
};

export default ReportesPage;
