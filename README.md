# Online shop

## Run with Docker

Install Docker with the Compose plugin and start the Docker daemon. Go, Node,
and npm run inside the containers; you don't need to install them locally.

Run these commands from this project root:

```sh
# Both apps
docker compose up --build

# Frontend only
docker compose up --build frontend

# Backend only
docker compose up --build backend
```

- Frontend (Expo web development server): http://localhost:8081
- Backend health check: http://localhost:8080/health

Press Ctrl+C to stop the foreground services. To run in the background, add `-d`:

```sh
docker compose up --build -d
docker compose logs -f
docker compose down
```

Frontend source changes update live through the mounted `app` directory.
After changing frontend dependencies, rebuild and refresh its container dependency volume:

```sh
docker compose up --build --renew-anon-volumes frontend
```

After changing Go code, rebuild the backend:

```sh
docker compose up --build backend
```

This setup runs the frontend for local web development. Native iOS/Android builds
and phone connectivity require their own Expo setup. The frontend and backend
are not connected yet; the backend currently only exposes a health endpoint.
