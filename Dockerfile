# Use the official Node 20 slim image
FROM node:20-slim

# 1) Install Chromium & its dependencies
RUN apt-get update && \
    apt-get install -y \
      chromium \
      libglib2.0-0 \
      libnss3 \
      libatk1.0-0 \
      libatk-bridge2.0-0 \
      libgtk-3-0 \
      libxss1 \
      libxshmfence1 \
      libxcursor1 \
      libxrandr2 \
      libpangocairo-1.0-0 \
      libasound2 \
      libcups2 \
      libxkbcommon0 \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# 2) Tell Puppeteer where to find the executable
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
# If you’re using puppeteer-core, skip its own download
ENV PUPPETEER_SKIP_DOWNLOAD=true

# 3) Copy your app
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .

# 4) Expose and run
EXPOSE 8080
CMD ["npm","start"]
