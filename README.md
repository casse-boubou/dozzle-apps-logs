# Dozzle-apps-logs

Dozzle_apps_logs is a service that exposes plain `.log` files as Docker-compatible containers through a Unix socket.  
It allows [Dozzle](https://github.com/amir20/dozzle) to display and stream application logs.

The service emulates the Docker Engine API endpoints required by Dozzle:

- `/_ping`
- `/version`
- `/info`
- `/events`
- `/containers/json`
- `/containers/:id/json`
- `/containers/:id/stats`
- `/containers/:id/logs`

Each `.log` file placed in `/logs` is exposed as a virtual running container inside Dozzle.

### Use Cases:

Viewing non-containerized logs from applications

Aggregating hybrid environments (real containers + external logs)

# How It Works

- Each `.log` file inside `/logs` is parsed by fluentd according to the rules defined in fluent.conf and sent to `/logs-parsed`.
- Each `.log` file inside `/logs-parsed` becomes a virtual container in a fake docker.sock.
- The fake Docker.sock is streamed via a docker-socket-proxy on port `2376`.
- Dozzle is configured with the ENV `DOZZLE_REMOTE_HOST` variable to listen on TCP:2376 of the service.

# Installation

### Add the service to your `docker-compose.yml`

```yaml
services:
  dozzle_apps_logs:
    image: your-image-name
    container_name: dozzle_apps_logs
    volumes:
      - ./logs:/logs
    networks:
      - dozzle
  dozzle_apps_logs:
    container_name: dozzle_apps_logs
    image: ghcr.io/casse-boubou/dozzle-apps-logs:latest
    environment:
      - TZ=Etc/UTC
    volumes:
      - /path/to/fluent.conf:/fluentd/etc/fluent.conf:ro
      # - /path/to/firstfile.log:/logs/firstfile.log:ro 
      # - /path/to/secondfile.log:/logs/secondfile.log:ro
      # - ....
      # - /var/run/docker.sock:/var/run/docker.sock (optional)
```

### Configure Dozzle to use the remote host

In your Dozzle service configuration, add the environment variable:

```yaml
services:
  dozzle:
    depends_on:
      dozzle_apps_logs:
        condition: service_healthy
    image: amir20/dozzle:latest
    ....
    environment:
      - DOZZLE_REMOTE_HOST=tcp://dozzle_apps_logs:2376|Apps-Logs
    ....
```

# Configuration Options

## Required

### Configure fluentd

You will need to provide a fluent.conf configuration file in order to parse your logs for dozzle.

```yaml
    volumes:
      - /path/to/fluent.conf:/fluentd/etc/fluent.conf:ro
```

You can refer to the fluentd documentation here [Fluentd](https://docs.fluentd.org/configuration/parse-section) and the example provided in this repo.

You can also use the website [ruby REGEX expressions](https://rubular.com/) to create your own expression rules compatible with Fluentd Ruby regular expressions.

### Mount log files

Mount your log files inside /logs:

```yaml
    volumes:
      - /path/to/your/logs:/logs/application_name.log:ro 
```

## Optional

### Mount the host Docker socket

Only aesthetic, but if you want Dozzle to display the actual values of your host (system CPU, MEM, etc.), mount the Docker Unix socket with --volume to /var/run/docker.sock:

```yaml
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

### Healthcheck

The container includes a built-in healthcheck.
By default, it is configured to be checked every 30 seconds.

You can fully customize or override the healthcheck in your docker-compose.yml.

```yaml
    healthcheck:
      test: ["CMD", "/dozzle", "healthcheck"]
      interval: 10m
      timeout: 30s
      retries: 10
      start_period: 60s
      start_interval: 5s
```
