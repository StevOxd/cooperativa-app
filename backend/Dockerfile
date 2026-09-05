# ==============================================================================
# Dockerfile - Cooperativa Backend (Node.js Express API)
# Arquitectura de Producción - Imagen Segura, Ligera y No-Root
# ==============================================================================

FROM node:20-alpine AS production

# Instalar dumb-init para gestión limpia de señales POSIX (SIGTERM, SIGINT)
RUN apk add --no-cache dumb-init

# Definir variables de entorno de ejecución en producción
ENV NODE_ENV=production
ENV PORT=5000

# Directorio de trabajo de la aplicación
WORKDIR /app

# Copiar manifiestos de dependencias primero para aprovechar la caché de capas de Docker
COPY package*.json ./

# Instalar únicamente dependencias de producción, omitiendo devDependencies
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copiar el código fuente y scripts necesarios
COPY src/ ./src/
COPY database.sql ./

# Otorgar propiedad de los archivos al usuario no privilegiado 'node' incorporado en Alpine
RUN chown -R node:node /app

# Ejecutar el contenedor bajo el usuario sin privilegios por seguridad bancaria
USER node

# Exponer el puerto del servidor API
EXPOSE 5000

# Healthcheck interno del contenedor verificando el endpoint de salud con Node.js nativo
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:5000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# dumb-init asume PID 1 y gestiona el reenvío de señales para un apagado ordenado
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
