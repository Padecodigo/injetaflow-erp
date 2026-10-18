FROM node:22-bookworm-slim
WORKDIR /app
# pnpm instalado num cache legível pelo usuário node (as CLIs rodam via docker exec sem root)
ENV COREPACK_HOME=/usr/local/share/corepack
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN CI=1 pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
# B-16: os dados (store, journal, backups, anexos, senha-inicial.txt) ficam num volume, fora da imagem,
# e o processo roda sem root (usuário "node" da imagem oficial). O código continua de root, só leitura para o app.
RUN mkdir -p /app/.data && chown node:node /app/.data && chmod 700 /app/.data && chmod -R a+rX "$COREPACK_HOME"
ENV NODE_ENV=production
ENV PORT=3000
ENV INJETAFLOW_DATA_DIR=/app/.data
VOLUME ["/app/.data"]
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
