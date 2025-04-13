FROM node:18-alpine

WORKDIR /app

# Instalar dependências essenciais
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ttf-freefont \
    udev \
    dbus \
    xvfb-run \
    bash \
    curl \
    && rm -rf /var/cache/apk/*

# Variáveis de ambiente
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV NODE_ENV=production
ENV DISPLAY=:99
ENV XVFB_WHD="1280x720x16"
ENV PORT=3000

# Configurar usuário não-root
RUN addgroup -S appuser && adduser -S appuser -G appuser
USER appuser

COPY package*.json ./
RUN npm install --production

COPY . .

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["xvfb-run", "-a", "node", "--max-old-space-size=384", "index.js"]