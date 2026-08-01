# Despliegue Doc Hub

Este directorio separa la infraestructura por instancia:

- `private/`: MySQL, API duplicada (`api1`, `api2`), Redis y monitoreo.
- `public/`: HAProxy y Grafana.

## Servidor privado

Puertos esperados:

- `22`: SSH
- `8001`: API instancia 1
- `8002`: API instancia 2
- `5001`: app web temporal 1
- `5002`: app web temporal 2
- `9090`: Prometheus

Comandos:

```bash
cd deploy/private
docker compose up -d --build
```

## Servidor publico

Puertos esperados:

- `22`: SSH
- `80`: HTTP
- `443`: HTTPS
- `8080`: Grafana
- `8404`, `8405`: estadisticas HAProxy

Antes de iniciar, cambia `PRIVATE_SERVER_IP` en `public/haproxy.cfg`.

```bash
cd deploy/public
docker compose up -d
```

## Variables importantes

Usa valores reales en produccion:

```env
JWT_SECRET=...
API_KEY=...
MYSQL_ROOT_PASSWORD=...
MYSQL_DATABASE=gestion_documental
MYSQL_USER=dochub
MYSQL_PASSWORD=...
SEED_USER_USERNAME=juez
SEED_USER_PASSWORD=...
```
