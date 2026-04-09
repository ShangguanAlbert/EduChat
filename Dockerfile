
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci


FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm prune --omit=dev


FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# 换源 + 安装，必须在同一个 RUN 层
RUN sed -i \
    -e 's/deb.debian.org/mirrors.aliyun.com/g' \
    -e 's/security.debian.org/mirrors.aliyun.com/g' \
    /etc/apt/sources.list.d/debian.sources \
    && apt-get update && apt-get install -y --no-install-recommends \
        libreoffice \
        libreoffice-writer \
        fonts-noto-cjk \
        fonts-dejavu-core \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/dist ./dist

ENV EDUCHAT_DOCUMENT_PREVIEW_SOFFICE_PATH=/usr/bin/soffice

EXPOSE 8787
CMD ["node", "server/index.js"]