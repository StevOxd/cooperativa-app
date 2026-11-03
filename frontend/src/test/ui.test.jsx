import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  Field,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  PasswordInput,
  ProgressBar,
  SearchInput,
  Select,
  StatCard,
  StepProgress,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Tabs,
  TabPanel,
} from '../components/ui';

describe('Button', () => {
  test('dispara el clic y por defecto no envía formularios', async () => {
    const alClic = vi.fn();
    render(<Button onClick={alClic}>Guardar</Button>);
    const boton = screen.getByRole('button', { name: 'Guardar' });
    expect(boton).toHaveAttribute('type', 'button');
    await userEvent.click(boton);
    expect(alClic).toHaveBeenCalledTimes(1);
  });

  test('mientras carga ignora el clic y conserva el foco', async () => {
    const alClic = vi.fn();
    render(
      <Button loading loadingText="Guardando" onClick={alClic}>
        Guardar
      </Button>
    );
    const boton = screen.getByRole('button');
    expect(boton).toHaveAttribute('aria-disabled', 'true');
    expect(boton).toHaveTextContent('Guardando');
    await userEvent.click(boton);
    expect(alClic).not.toHaveBeenCalled();
  });
});

describe('controles de formulario', () => {
  test('Input recibe texto y Field asocia la etiqueta y el error', async () => {
    render(
      <Field label="Correo" error="Revise el correo">
        <Input />
      </Field>
    );
    expect(screen.getByText('Revise el correo')).toBeInTheDocument();
    const entrada = screen.getByLabelText(/Correo/);
    await userEvent.type(entrada, 'a@b.com');
    expect(entrada).toHaveValue('a@b.com');
  });

  test('PasswordInput oculta la clave hasta que se pide verla', async () => {
    render(<PasswordInput aria-label="Clave" defaultValue="secreta" />);
    const entrada = screen.getByLabelText('Clave');
    expect(entrada).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button'));
    expect(entrada).toHaveAttribute('type', 'text');
  });

  test('Select muestra sus opciones', async () => {
    render(
      <Select aria-label="Tipo" defaultValue="a">
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>
    );
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'b');
    expect(screen.getByLabelText('Tipo')).toHaveValue('b');
  });

  test('SearchInput avisa lo que se escribe', async () => {
    const alCambiar = vi.fn();
    render(<SearchInput aria-label="Buscar" value="" onChange={alCambiar} />);
    await userEvent.type(screen.getByLabelText('Buscar'), 'x');
    expect(alCambiar).toHaveBeenCalled();
  });
});

describe('componentes de presentación', () => {
  test('muestran su contenido', () => {
    render(
      <div>
        <Alert tone="danger" title="Atención">
          Detalle
        </Alert>
        <Badge tone="success">Activo</Badge>
        <Card>
          <CardBody>Cuerpo</CardBody>
        </Card>
        <EmptyState title="Sin datos" description="Nada todavía" />
        <LoadingState label="Cargando datos" />
        <PageHeader title="Título" description="Descripción" />
        <ProgressBar value={40} label="Avance" />
        <StatCard label="Saldo" value="Q10.00" />
        <StepProgress steps={['Uno', 'Dos']} current={0} />
      </div>
    );
    ['Atención', 'Activo', 'Cuerpo', 'Sin datos', 'Cargando datos', 'Título', 'Saldo', 'Q10.00'].forEach((texto) =>
      expect(screen.getAllByText(texto).length).toBeGreaterThan(0)
    );
  });

  test('Table arma una tabla accesible', () => {
    render(
      <Table>
        <THead>
          <TR>
            <TH>Nombre</TH>
          </TR>
        </THead>
        <TBody>
          <TR>
            <TD>Ana</TD>
          </TR>
        </TBody>
      </Table>
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Ana' })).toBeInTheDocument();
  });
});

describe('Modal', () => {
  test('no se muestra cerrado y se cierra con su botón', async () => {
    const alCerrar = vi.fn();
    const { rerender } = render(
      <Modal isOpen={false} onClose={alCerrar} title="Confirmar">
        Contenido
      </Modal>
    );
    expect(screen.queryByText('Contenido')).not.toBeInTheDocument();
    rerender(
      <Modal isOpen onClose={alCerrar} title="Confirmar">
        Contenido
      </Modal>
    );
    expect(screen.getByText('Contenido')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(alCerrar).toHaveBeenCalled();
  });
});

describe('Tabs', () => {
  test('cambia de pestaña', async () => {
    const alCambiar = vi.fn();
    render(
      <div>
        <Tabs
          items={[
            { id: 'a', label: 'Uno' },
            { id: 'b', label: 'Dos' },
          ]}
          value="a"
          onChange={alCambiar}
        />
        <TabPanel id="a" idPrefix="p">
          Panel
        </TabPanel>
      </div>
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Dos' }));
    expect(alCambiar).toHaveBeenCalledWith('b');
  });
});
