ARG FLUENTD_BASE_IMAGE_VERSION="v1.19.0-1.0@sha256:e60d55e4010ae25f45760f5ef5fc6d58f576c630418b84af61a19aac78d18e53"
FROM fluent/fluentd:${FLUENTD_BASE_IMAGE_VERSION} AS runner
ARG CONTAINER_BUILD_VERSION
ENV CONTAINER_BUILD_VERSION=${CONTAINER_BUILD_VERSION}
USER 0
# Update index, install app, and clean up cache
RUN echo "Installing base packages" \
    && apk --update --no-cache add \
    tzdata=2025b-r0 \
    haproxy=2.8.16-r0 \
    nodejs=20.15.1-r0 \
    npm=10.2.5-r0

# For HAPROXY and NODE
ENV SOCKET_PATH=/var/run/fakeDocker.sock


####################
# FLUENTD
####################
RUN mkdir -p /fluentd/etc && rm /fluentd/etc/fluent.conf


####################
# HAPROXY
####################
COPY ./haproxy/haproxy.cfg /usr/local/etc/haproxy/haproxy.cfg
EXPOSE 2376
ENV PROXY_PORT=":2376" \
    LOG_LEVEL=info \
    CONTAINERS=1 \
    PING=1 \
    VERSION=1 \
    EVENTS=1 \
    INFO=1


####################
# NODE.JS
####################
WORKDIR /app
COPY ./nodejs/package.json ./nodejs/package-lock.json ./nodejs/server.js /app/
RUN npm ci


####################
# DOZZLE-APPS-LOGS
####################
WORKDIR /dozzle_apps_logs
COPY docker-entrypoint.sh healthcheck /dozzle_apps_logs/




##################################
## PRODUCTION MODE
##################################
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD ["sh","healthcheck"]

ENTRYPOINT ["sh","docker-entrypoint.sh"]

