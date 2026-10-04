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
and phone connectivity require their own Expo setup.

## Frontend demo mode

The frontend and backend are not connected yet; the backend currently only exposes
a health endpoint. Until then the app runs on in-memory demo data
(`app/src/api/mock.ts`): sign in with the temporary test account `99996666` /
`admintest` (shown on the login page; defined as `TEST_ACCOUNT` in
`app/src/constants/config.ts`). Changes are lost on reload.

## Connecting the backend

Building the backend? Start with **[docs/backend-integration.md](docs/backend-integration.md)**
(conventions, business rules, integration flows) and the API contract
**[docs/api/openapi.yaml](docs/api/openapi.yaml)**.

To point the app at a running backend, set `EXPO_PUBLIC_API_URL`:

```sh
EXPO_PUBLIC_API_URL=http://localhost:8080 docker compose up --build frontend backend
```

Without Docker, copy `app/.env.example` to `app/.env.local`, set the URL, and run
`npx expo start --clear` (the `--clear` is needed whenever the URL changes).
