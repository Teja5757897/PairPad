# -------- 1) Build the frontend --------
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/vite-project/package*.json ./
RUN npm install
COPY frontend/vite-project ./
# Leave empty when the backend serves the frontend (same URL).
# Set it only if the frontend is hosted elsewhere (e.g. Netlify).
ARG VITE_SERVER_URL=""
ENV VITE_SERVER_URL=$VITE_SERVER_URL
RUN npm run build

# -------- 2) Backend + built frontend --------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY Backend/package*.json ./
RUN npm install --omit=dev
COPY Backend ./
COPY --from=frontend-builder /app/dist ./public

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "server.js"]
