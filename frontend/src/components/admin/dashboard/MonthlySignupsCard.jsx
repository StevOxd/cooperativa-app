import React, { useMemo } from 'react';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { Card, CardBody, CardHeader } from '../../ui';
import { chartColors, chartFont, chartTooltip } from '../../charts/chartTheme';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip);

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1).replace('.', '');

/**
 * Altas de usuarios en los últimos 6 meses (una sola serie: sin leyenda).
 * Incluye una tabla oculta con los mismos datos para lectores de pantalla.
 *
 * @param {Object} props
 * @param {Array} props.users
 */
export const MonthlySignupsCard = ({ users }) => {
  const { labels, values } = useMemo(() => {
    // Agrupar usuarios por mes según fecha_creacion
    const monthCounts = {};
    const monthsOrder = [];

    // Tomar los últimos 6 meses
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleDateString('es-GT', { month: 'short' });
      monthCounts[key] = 0;
      monthsOrder.push(key);
    }

    users.forEach((u) => {
      if (u.fecha_creacion) {
        const d = new Date(u.fecha_creacion);
        const key = d.toLocaleDateString('es-GT', { month: 'short' });
        if (monthCounts[key] !== undefined) {
          monthCounts[key] += 1;
        }
      }
    });

    return {
      labels: monthsOrder.map(capitalize),
      values: monthsOrder.map((m) => monthCounts[m]),
    };
  }, [users]);

  const data = {
    labels,
    datasets: [
      {
        label: 'Altas',
        data: values,
        backgroundColor: chartColors.brand,
        hoverBackgroundColor: chartColors.brandHover,
        borderRadius: { topLeft: 4, topRight: 4 },
        borderSkipped: 'start',
        maxBarThickness: 36,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...chartTooltip,
        callbacks: {
          label: (context) => `${context.parsed.y} ${context.parsed.y === 1 ? 'alta' : 'altas'}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: chartColors.grid },
        ticks: { font: chartFont, color: chartColors.axis },
      },
      y: {
        beginAtZero: true,
        grid: { color: chartColors.grid },
        border: { display: false },
        ticks: { stepSize: 1, precision: 0, font: chartFont, color: chartColors.axis },
      },
    },
  };

  return (
    <Card className="h-full">
      <CardHeader title="Altas por mes" description="Últimos 6 meses" />
      <CardBody>
        <div className="h-64" role="img" aria-label={`Altas por mes: ${labels.map((l, i) => `${l} ${values[i]}`).join(', ')}`}>
          <Bar data={data} options={options} />
        </div>
        <table className="sr-only">
          <caption>Altas de usuarios por mes, últimos 6 meses</caption>
          <thead>
            <tr><th scope="col">Mes</th><th scope="col">Altas</th></tr>
          </thead>
          <tbody>
            {labels.map((label, i) => (
              <tr key={label}><td>{label}</td><td>{values[i]}</td></tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
};

export default MonthlySignupsCard;
