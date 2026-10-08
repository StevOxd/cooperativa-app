#!/usr/bin/env node
/**
 * Genera los subagentes de Claude Code (.claude/agents/) a partir de los de Antigravity
 * (.agent/agents/), que son la única fuente: el contenido se edita allí y este script lo traduce.
 *
 *   node scripts/sync-agents.mjs           # regenera .claude/agents/
 *   node scripts/sync-agents.mjs --check   # solo comprueba que estén sincronizados (CI); sale con 1 si no
 *
 * Traducciones:
 * - Encabezado: name y description se copian; model (pro) pasa a `inherit` (el modelo de la sesión);
 *   subagent se descarta; tools se traduce a los nombres de Claude Code.
 * - Cuerpo: los nombres de herramientas de Antigravity entre comillas invertidas se cambian por los
 *   de Claude Code, y se agrega un aviso de que el archivo es generado.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEN = join(RAIZ, '.agent', 'agents');
const DESTINO = join(RAIZ, '.claude', 'agents');

// Herramienta de Antigravity -> herramienta de Claude Code
const HERRAMIENTAS = {
  view_file: 'Read',
  grep_search: 'Grep',
  find_by_name: 'Glob',
  list_dir: 'Glob',
  run_command: 'Bash',
};

const soloComprobar = process.argv.includes('--check');

/** Separa el encabezado YAML (entre ---) del cuerpo. Admite el subconjunto que usan estos archivos. */
const leerFrontmatter = (texto, archivo) => {
  const coincidencia = texto.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!coincidencia) throw new Error(`${archivo}: falta el encabezado YAML entre ---`);
  const [, yaml, cuerpo] = coincidencia;

  const datos = {};
  const lineas = yaml.split('\n');
  for (let i = 0; i < lineas.length; i++) {
    const clave = lineas[i].match(/^([a-z_]+):\s*(.*)$/);
    if (!clave) continue;
    const [, nombre, valor] = clave;
    if (valor === '>-' || valor === '>' || valor === '|') {
      // Bloque de texto: líneas siguientes con sangría, unidas con espacio
      const partes = [];
      while (i + 1 < lineas.length && /^\s+\S/.test(lineas[i + 1])) partes.push(lineas[++i].trim());
      datos[nombre] = partes.join(' ');
    } else if (valor === '') {
      // Lista: líneas siguientes "  - elemento"
      const elementos = [];
      while (i + 1 < lineas.length && /^\s+-\s+/.test(lineas[i + 1])) elementos.push(lineas[++i].replace(/^\s+-\s+/, '').trim());
      datos[nombre] = elementos;
    } else {
      datos[nombre] = valor.trim();
    }
  }
  return { datos, cuerpo };
};

const traducirHerramientas = (lista = [], archivo) => {
  const resultado = [];
  for (const herramienta of lista) {
    const equivalente = HERRAMIENTAS[herramienta];
    if (!equivalente) throw new Error(`${archivo}: herramienta sin equivalente en Claude Code: ${herramienta}`);
    if (!resultado.includes(equivalente)) resultado.push(equivalente);
  }
  return resultado;
};

const traducirCuerpo = (cuerpo) =>
  cuerpo.replace(/`(view_file|grep_search|find_by_name|list_dir|run_command)`/g, (_, h) => `\`${HERRAMIENTAS[h]}\``);

const generar = (archivo) => {
  const { datos, cuerpo } = leerFrontmatter(readFileSync(join(ORIGEN, archivo), 'utf8'), archivo);
  if (!datos.name || !datos.description) throw new Error(`${archivo}: faltan name o description`);

  const herramientas = traducirHerramientas(datos.tools, archivo);
  const encabezado = [
    '---',
    `name: ${datos.name}`,
    `description: ${JSON.stringify(datos.description)}`,
    ...(herramientas.length ? [`tools: ${herramientas.join(', ')}`] : []),
    'model: inherit',
    '---',
  ].join('\n');

  const aviso = `<!-- Archivo generado por scripts/sync-agents.mjs a partir de .agent/agents/${archivo}. No lo edite: edite el original y vuelva a ejecutar el script. -->`;
  return `${encabezado}\n\n${aviso}\n${traducirCuerpo(cuerpo)}`;
};

const origenes = readdirSync(ORIGEN).filter((f) => f.endsWith('.md') && f !== 'README.md').sort();
const esperados = new Map(origenes.map((archivo) => [archivo, generar(archivo)]));

if (soloComprobar) {
  const diferencias = [];
  for (const [archivo, contenido] of esperados) {
    const ruta = join(DESTINO, archivo);
    if (!existsSync(ruta) || readFileSync(ruta, 'utf8') !== contenido) diferencias.push(archivo);
  }
  const sobrantes = existsSync(DESTINO)
    ? readdirSync(DESTINO).filter((f) => f.endsWith('.md') && !esperados.has(f))
    : [];
  if (diferencias.length || sobrantes.length) {
    console.error('[FAIL] .claude/agents/ no coincide con .agent/agents/.');
    if (diferencias.length) console.error(`  Desactualizados o faltantes: ${diferencias.join(', ')}`);
    if (sobrantes.length) console.error(`  Sobrantes: ${sobrantes.join(', ')}`);
    console.error('  Ejecute: node scripts/sync-agents.mjs');
    process.exit(1);
  }
  console.log(`[PASS] ${esperados.size} subagentes de Claude Code sincronizados con .agent/agents/.`);
} else {
  mkdirSync(DESTINO, { recursive: true });
  // Quitar los generados que ya no tienen original
  for (const f of readdirSync(DESTINO)) {
    if (f.endsWith('.md') && !esperados.has(f)) rmSync(join(DESTINO, f));
  }
  for (const [archivo, contenido] of esperados) writeFileSync(join(DESTINO, archivo), contenido);
  console.log(`[INFO] ${esperados.size} subagentes generados en .claude/agents/: ${[...esperados.keys()].join(', ')}`);
}
