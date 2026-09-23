FROM debian:bookworm-slim AS build
ARG ASTERISK_VERSION=22.11.0
RUN apt-get update && apt-get install -y --no-install-recommends build-essential pkg-config \
    curl ca-certificates libedit-dev libjansson-dev libxml2-dev uuid-dev libsqlite3-dev \
    libssl-dev libsrtp2-dev python3 bzip2 patch && rm -rf /var/lib/apt/lists/*
WORKDIR /build
RUN curl -fsSLO https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-${ASTERISK_VERSION}.tar.gz \
    && curl -fsSLO https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-${ASTERISK_VERSION}.sha256 \
    && sha256sum -c asterisk-${ASTERISK_VERSION}.sha256 \
    && tar xzf asterisk-${ASTERISK_VERSION}.tar.gz --strip-components=1 \
    && ./configure --prefix=/usr --with-pjproject-bundled --without-popt \
    && make menuselect.makeopts \
    && menuselect/menuselect --disable BUILD_NATIVE --disable-category MENUSELECT_CORE_SOUNDS \
        --disable-category MENUSELECT_MOH --disable-category MENUSELECT_EXTRA_SOUNDS menuselect.makeopts \
    && make -j2 && make install DESTDIR=/out
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libedit2 libjansson4 libxml2 \
    libuuid1 libsqlite3-0 libssl3 libsrtp2-1 python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --create-home asterisk \
    && mkdir -p /var/lib/asterisk /var/spool/asterisk /var/log/asterisk /var/run/asterisk /etc/asterisk \
    && chown -R asterisk:asterisk /var/lib/asterisk /var/spool/asterisk /var/log/asterisk /var/run/asterisk /etc/asterisk
COPY --from=build /out/usr/ /usr/
COPY --from=build /out/var/lib/asterisk/ /var/lib/asterisk/
RUN chown -R asterisk:asterisk /var/lib/asterisk
COPY start.py /usr/local/bin/start-asterisk
USER asterisk
ENTRYPOINT ["python3", "/usr/local/bin/start-asterisk"]
