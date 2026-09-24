# Preserve the application's PostgreSQL 17 base (OS, libc and minor version).
FROM postgres:17 AS vector-build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential postgresql-server-dev-17 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ADD https://github.com/pgvector/pgvector/archive/refs/tags/v0.8.2.tar.gz /build/pgvector.tar.gz
WORKDIR /build
RUN tar xzf pgvector.tar.gz && cd pgvector-0.8.2 && make OPTFLAGS="" && make install

FROM postgres:17
COPY --from=vector-build /usr/lib/postgresql/17/lib/vector.so /usr/lib/postgresql/17/lib/vector.so
COPY --from=vector-build /usr/share/postgresql/17/extension/vector* /usr/share/postgresql/17/extension/
