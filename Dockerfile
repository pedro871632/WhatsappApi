# Use Node.js 18 as base image
FROM node:18-slim

# Install system dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    libgconf-2-4 \
    libxss1 \
    libxtst6 \
    libxrandr2 \
    libasound2 \
    libpangocairo-1.0-0 \
    libatk1.0-0 \
    libcairo-gobject2 \
    libgtk-3-0 \
    libgdk-pixbuf2.0-0 \
    libgbm1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxi6 \
    libxtst6 \
    libnss3 \
    libcups2 \
    libxrandr2 \
    libgconf-2-4 \
    libxss1 \
    libappindicator1 \
    fonts-liberation \
    lsb-release \
    xdg-utils \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]