# Build stage
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source files
COPY . .

# Build the frontend assets
RUN npm run build

# Expose port 3000
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the Express server using tsx
CMD ["npx", "tsx", "server.ts"]
