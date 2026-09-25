# Backend

## IMPORTANT: No need to do this, if you just go docker road. Navigate to README.MD in the root folder

Minimal Go HTTP server with no external dependencies. Requires Go 1.22 or newer.

Alternatively, run `docker compose up --build backend` from the project root.
Docker builds Go inside the container, so no local Go installation is needed.

Run from this directory:

```sh
go run .
```

The server listens on all interfaces on port `8080`. Set `PORT` to override it:

```sh
PORT=3001 go run .
```

Health check:

```sh
curl http://localhost:8080/health
# {"status":"ok"}
```

Build and run a binary:

```sh
go build -o /tmp/online-shop-backend .
/tmp/online-shop-backend
```
