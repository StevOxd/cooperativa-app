# ==============================================================================
# Multi-stage Dockerfile - Cooperativa Frontend (React + Vite + Tailwind)
# Etapa 1: Compilación de la aplicación estática (Node.js 20 Alpine)
# Etapa 2: Servidor web de producción ultraligero y seguro (Nginx Alpine)
# ==============================================================================

# ------------------------------------------------------------------------------
# Etapa 1: Builder (Construcción con Vite)
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar manifiestos de paquetes
COPY package*.json ./

# Instalar dependencias completas (incluye devDependencies para vite y tailwind)
RUN npm ci

# Copiar únicamente los archivos fuente y de configuración para la compilación
COPY index.html ./
COPY vite.config.js ./
COPY tailwind.config.js ./
COPY postcss.config.js ./
COPY src/ ./src/

# Argumentos de compilación para URLs de API y WebSockets
ARG VITE_API_URL=/api
ARG VITE_SOCKET_URL=/

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL

# Compilar los assets para producción (genera directorio /app/dist)
RUN npm run build

# ------------------------------------------------------------------------------
# Etapa 2: Production (Servidor Nginx Alpine)
# ------------------------------------------------------------------------------
FROM nginx:1.27-alpine AS production

# Metadatos del contenedor
LABEL maintainer="Equipo DevOps Cooperativa <devops@cooperativa.com>" \
      description="Servidor Nginx optimizado para SPA React Vite con proxy inverso"

# Limpiar configuración y archivos estáticos predeterminados de Nginx
RUN rm -rf /etc/nginx/conf.d/* /usr/share/nginx/html/*

# Copiar configuración personalizada de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar los artefactos generados en la etapa de compilación
COPY --from=builder /app/dist /usr/share/nginx/html

# Ajustar permisos de lectura para el usuario de ejecución nginx
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

# Exponer el puerto estándar HTTP
EXPOSE 80

# Verificación de salud interna del contenedor Nginx
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

# Detención limpia mediante la señal SIGQUIT
STOPSIGNAL SIGQUIT

# Iniciar servidor Nginx en primer plano
CMD ["nginx", "-g", "daemon off;"]
