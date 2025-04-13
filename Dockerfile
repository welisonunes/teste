FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ttf-freefont \
    udev \
    dbus \
    xvfb-run \
    && rm -rf /var/cache/apk/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV NODE_ENV=production
ENV DISPLAY=:99

COPY package*.json ./
RUN npm install --production

COPY . .

CMD ["xvfb-run", "-a", "node", "--max-old-space-size=384", "index.js"]