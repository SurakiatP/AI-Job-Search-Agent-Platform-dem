# Caddy v2.11.7 built from pinned source with Go 1.27.2 and golang.org/x/net v0.60.0 (spec A1):
# upstream caddy:2.11.7 carried CVE-2026-78667/78669/97031 in its Go toolchain and x/net.
FROM --platform=$BUILDPLATFORM golang:1.27.2-bookworm@sha256:5cf287a799e6b94384bad13d16b14904c531f51ba65792237e122ce42b392f61 AS build
ARG TARGETARCH
ARG CADDY_SOURCE_COMMIT
WORKDIR /src
COPY --from=caddy_source / /src/
COPY go.mod go.sum provenance.json /src/
RUN test "$CADDY_SOURCE_COMMIT" = "72dd0fb067f6d7826c7f79907670ba4a713bfe37" \
    && test "$(go version | awk '{ print $3 }')" = "go1.27.2" \
    && grep -F '"source_commit":"72dd0fb067f6d7826c7f79907670ba4a713bfe37"' provenance.json \
    && test "$(sha256sum go.mod | awk '{ print $1 }')" = "$(sed -n 's/.*"go_mod_sha256":"\([0-9a-f]*\)".*/\1/p' provenance.json)" \
    && test "$(sha256sum go.sum | awk '{ print $1 }')" = "$(sed -n 's/.*"go_sum_sha256":"\([0-9a-f]*\)".*/\1/p' provenance.json)"
RUN GOTOOLCHAIN=local go mod download && GOTOOLCHAIN=local go mod verify
RUN mkdir -p /out/licenses/caddy && install -m 0644 LICENSE /out/licenses/caddy/LICENSE \
    && GOTOOLCHAIN=local CGO_ENABLED=0 GOOS=linux GOARCH=$TARGETARCH \
       go build -mod=readonly -buildvcs=false -trimpath -ldflags "-s -w" -o /out/caddy ./cmd/caddy

FROM quay.io/prometheus/busybox:latest@sha256:5a1d320f7575acb92934a25ea4830bcbf27cc53e68fbf42c56f89c509e7602d2
LABEL org.opencontainers.image.title="Caddy" org.opencontainers.image.licenses="Apache-2.0" org.opencontainers.image.version="2.11.7" org.opencontainers.image.source="https://github.com/caddyserver/caddy" org.opencontainers.image.revision="72dd0fb067f6d7826c7f79907670ba4a713bfe37"
# CA bundle for ACME and OCSP clients (busybox base has none).
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build --chmod=0755 /out/caddy /usr/bin/caddy
COPY --from=build /out/licenses/caddy/ /licenses/caddy/
ENV XDG_CONFIG_HOME=/config XDG_DATA_HOME=/data
EXPOSE 80 443 443/udp
ENTRYPOINT ["/usr/bin/caddy"]
CMD ["run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
