# Build at repository root:
# docker build -f workers/rhubarb/Dockerfile -t toonroom-rhubarb .
FROM debian:bookworm-slim AS rhubarb
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates unzip && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /opt/rhubarb && curl --fail --location --retry 3 \
  https://github.com/DanielSWolf/rhubarb-lip-sync/releases/download/v1.14.0/Rhubarb-Lip-Sync-1.14.0-Linux.zip \
  -o /tmp/rhubarb.zip && unzip -q /tmp/rhubarb.zip -d /opt/rhubarb && rm /tmp/rhubarb.zip
RUN test -x /opt/rhubarb/Rhubarb-Lip-Sync-1.14.0-Linux/rhubarb || \
  chmod +x /opt/rhubarb/Rhubarb-Lip-Sync-1.14.0-Linux/rhubarb

FROM node:22-bookworm-slim
COPY --from=rhubarb /opt/rhubarb /opt/rhubarb
COPY workers/rhubarb/server.mjs /app/server.mjs
ENV NODE_ENV=production PORT=8788 RHUBARB_BINARY=/opt/rhubarb/Rhubarb-Lip-Sync-1.14.0-Linux/rhubarb
RUN /opt/rhubarb/Rhubarb-Lip-Sync-1.14.0-Linux/rhubarb --version
WORKDIR /app
USER node
EXPOSE 8788
CMD ["node","server.mjs"]
