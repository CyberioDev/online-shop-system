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

## Frontend data source

Docker Compose starts the frontend, Go backend and PostgreSQL together. The
frontend's default API URL is `http://localhost:8080`, so browser requests reach
the published backend port. The backend migrates the database and idempotently
seeds the local demo shop with sample products, order history and payment-review
cases; sign in with `99996666` / `admintest`. Without an API URL, the app uses
in-memory demo data from `app/src/api/mock.ts` instead.

## Connecting the backend

Start everything with Docker:

```sh
docker compose up --build
```

The frontend HTTP client adapts the screens' inclusive Ulaanbaatar date ranges to
the API's RFC 3339 half-open time ranges and follows cursor pagination. To change
the API host (for example, when opening the app on a phone), set
`EXPO_PUBLIC_API_URL` to a URL the browser or device can reach, such as your
computer's LAN IP on port 8080. See **[backend/README.md](backend/README.md)** for
tenant isolation, API details, and Make/Zapier and bank listener integration.
The API contract is **[docs/api/openapi.yaml](docs/api/openapi.yaml)**.
