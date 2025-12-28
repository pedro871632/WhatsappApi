# Use Node.js 18 slim como base
FROM node:18-slim

# Instala o Chromium e fontes mínimas necessárias
# No Debian (base da imagem slim), o pacote 'chromium' já instala as dependências essenciais
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Pula o download do Chromium interno do Puppeteer (economiza ~300MB de imagem)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
# Define o caminho exato onde o 'apt-get install chromium' coloca o binário
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copia apenas o necessário para instalar dependências primeiro (aproveita cache de camadas)
COPY package*.json ./
RUN npm install --only=production

# Copia o restante do código
COPY . .

EXPOSE 3000

# Executa o node diretamente (consome menos RAM que o 'npm start')
CMD ["node", "index.js"]