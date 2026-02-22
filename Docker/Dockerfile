
FROM fluent/fluentd:v1.16.11-1.0
USER root
# Update index, install app, and clean up cache
RUN echo "Installing base packages" \
    && apk --update --no-cache add \
    tzdata \
    haproxy \
    nodejs \
    npm

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
COPY ./nodejs/package.json ./nodejs/server.js .
RUN npm install


####################
# DOZZLE-APPS-LOGS
####################
WORKDIR /dozzle_apps_logs
COPY docker-entrypoint.sh healthcheck .




##################################
## PRODUCTION MODE
##################################
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD sh healthcheck
ENTRYPOINT ["sh","docker-entrypoint.sh"]
