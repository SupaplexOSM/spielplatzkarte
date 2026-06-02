FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    osm2pgsql \
    osmium-tool \
    jq \
    curl \
    wget \
    postgresql-client \
    ca-certificates \
    gettext-base \
    && rm -rf /var/lib/apt/lists/*

ARG VERSION=dev
ENV SPIELI_VERSION=${VERSION}

COPY import.sh /import.sh
COPY api.sql   /api.sql
RUN chmod +x /import.sh

VOLUME ["/data"]

CMD ["/import.sh"]
