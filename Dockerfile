FROM node:20-slim

# Install system dependencies for ffmpeg, imagemagick
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    make \
    g++ \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (cache layer)
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps && npm cache clean --force

# Copy app source
COPY . .

# Create required directories
RUN mkdir -p /app/data/sessions /app/data/auth /app/data/temp

# Expose port — Railway injects $PORT automatically
EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "index.js"]
