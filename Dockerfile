FROM node:18-slim

# Instala o Chromium e as dependências necessárias
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libnss3 \
    libatk1.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Informa ao Puppeteer para usar o Chromium instalado pelo sistema
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]