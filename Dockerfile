# Build stage
FROM node:20-slim AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source files
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install --production

# Copy built assets and server code
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/package.json ./package.json

# Install tsx to run server.ts
RUN npm install -g tsx

# Expose port 3000
EXPOSE 3000

ENV NODE_ENV=production

# Start the server
CMD ["tsx", "server.ts"]
