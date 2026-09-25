FROM golang:1.26-alpine AS build

WORKDIR /src
COPY go.mod ./
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /server .

FROM alpine:3.23
COPY --from=build /server /server
USER 10001:10001
EXPOSE 8080
CMD ["/server"]
