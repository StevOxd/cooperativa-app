#!/usr/bin/env bash
# =============================================================================
# Corrige la conectividad entre contenedores en GitHub Codespaces.
#
# PROBLEMA
# El host mantiene activos a la vez los dos backends de iptables: nft y legacy.
# Docker escribe sus reglas en nft, donde la politica de FORWARD es ACCEPT y el
# filtrado real lo realizan las cadenas DOCKER y DOCKER-ISOLATION. Sin embargo
# la tabla legacy conserva "-P FORWARD DROP" y unicamente conoce el bridge
# docker0 predeterminado. El kernel evalua ambas rutas, de modo que el trafico
# entre contenedores de cualquier red bridge definida por el usuario (br-*) se
# descarta en silencio: las peticiones no se rechazan, expiran por timeout.
#
# SOLUCION
# Alinear la politica de FORWARD de la tabla legacy con la de nft (ACCEPT). El
# aislamiento de contenedores no se debilita: las reglas de nft siguen vigentes
# y continuan bloqueando el acceso externo a puertos no publicados.
#
# Se aplica la politica en lugar de reglas por bridge porque este script se
# ejecuta al arrancar el Codespace, cuando los bridges de Compose todavia no
# existen (se crean con "docker compose up").
#
# Uso: ./scripts/fix-docker-network.sh    (idempotente, requiere sudo)
# =============================================================================
set -euo pipefail

if ! command -v iptables-legacy >/dev/null 2>&1; then
  echo "iptables-legacy no esta presente: no hay conflicto de tablas que corregir."
  exit 0
fi

leer_politica() {
  sudo iptables-legacy -S FORWARD 2>/dev/null | awk '/^-P FORWARD/ {print $3}'
}

politica=$(leer_politica)

case "${politica}" in
  ACCEPT)
    echo "La politica FORWARD de iptables-legacy ya es ACCEPT: nada que hacer."
    ;;
  DROP)
    echo "Detectada politica FORWARD=DROP en iptables-legacy (bloquea el trafico"
    echo "entre contenedores de las redes bridge de Docker). Corrigiendo..."
    sudo iptables-legacy -P FORWARD ACCEPT
    if [[ "$(leer_politica)" == "ACCEPT" ]]; then
      echo "Politica actualizada a ACCEPT. Comunicacion entre contenedores habilitada."
    else
      echo "ERROR: no se pudo modificar la politica FORWARD." >&2
      exit 1
    fi
    ;;
  "")
    echo "No se pudo leer la politica FORWARD de iptables-legacy (¿falta sudo?)." >&2
    exit 1
    ;;
  *)
    echo "Politica FORWARD inesperada '${politica}': se deja sin modificar."
    ;;
esac
