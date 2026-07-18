# ---------- build ----------
FROM golang:1.23-alpine AS build
RUN apk add --no-cache git
WORKDIR /app
COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download
COPY apps/api/ ./
RUN CGO_ENABLED=0 go build -ldflags "-s -w" -o /out/api .

# ---------- runtime ----------
FROM alpine:latest
RUN apk add --no-cache tzdata ca-certificates
ENV TZ=Asia/Bangkok
WORKDIR /app
COPY --from=build /out/api ./api
EXPOSE 5000
# seed (idempotent) then serve; the binary auto-migrates on start
CMD ["sh", "-c", "./api seed || true; ./api"]
