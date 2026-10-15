# Prometheus v3.15.0 built from pinned source with Go 1.27.2 and golang.org/x/net v0.60.0 (spec A1.2):
# upstream prom/prometheus:v3.15.0 carried CVE-2026-78667/78669/97031 in its Go toolchain and x/net.
FROM --platform=$BUILDPLATFORM golang:1.27.2-bookworm@sha256:5cf287a799e6b94384bad13d16b14904c531f51ba65792237e122ce42b392f61 AS build
ARG TARGETARCH
ARG PROMETHEUS_SOURCE_COMMIT
WORKDIR /src
COPY --from=prometheus_source / /src/
COPY go.mod go.sum provenance.json /src/
ADD --checksum=sha256:fa8c918ed05e3f89e232e9b69eccd6ed074602cd9e8a2cab7a92bec9651974ae \
    https://github.com/prometheus/prometheus/releases/download/v3.15.0/prometheus-web-ui-3.15.0.tar.gz /ui.tgz
# The fixed BuildDate ldflag keeps the build reproducible.
RUN test "$PROMETHEUS_SOURCE_COMMIT" = "5241a27fe3c6983549fccc32f6e65917408c63cd" \
 && test "$(go version | awk '{ print $3 }')" = "go1.27.2" \
 && grep -F '"source_commit": "5241a27fe3c6983549fccc32f6e65917408c63cd"' provenance.json \
 && test "$(sha256sum go.mod | awk '{ print $1 }')" = "$(sed -n 's/.*"go_mod_sha256": "\([0-9a-f]*\)".*/\1/p' provenance.json)" \
 && test "$(sha256sum go.sum | awk '{ print $1 }')" = "$(sed -n 's/.*"go_sum_sha256": "\([0-9a-f]*\)".*/\1/p' provenance.json)" \
 && tar -xzf /ui.tgz -C web/ui \
 && bash scripts/compress_assets.sh \
 && GOTOOLCHAIN=local go mod download && GOTOOLCHAIN=local go mod verify \
 && LD="-s -w \
 -X github.com/prometheus/common/version.Version=3.15.0 \
 -X github.com/prometheus/common/version.Revision=5241a27fe3c6983549fccc32f6e65917408c63cd \
 -X github.com/prometheus/common/version.Branch=HEAD \
 -X github.com/prometheus/common/version.BuildUser=job-search-platform \
 -X github.com/prometheus/common/version.BuildDate=20261015-00:00:00" \
 && for cmd in prometheus promtool; do \
      GOOS=linux GOARCH=$TARGETARCH CGO_ENABLED=0 GOTOOLCHAIN=local go build -mod=readonly -buildvcs=false -trimpath \
        -tags netgo,builtinassets -ldflags "$LD" -o /out/$cmd ./cmd/$cmd || exit 1; \
    done \
 && install -D -m 0644 LICENSE /out/licenses/prometheus/LICENSE \
 && install -D -m 0644 NOTICE /out/licenses/prometheus/NOTICE

FROM quay.io/prometheus/busybox:latest@sha256:5a1d320f7575acb92934a25ea4830bcbf27cc53e68fbf42c56f89c509e7602d2
LABEL org.opencontainers.image.title="Prometheus" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.version="3.15.0" \
      org.opencontainers.image.source="https://github.com/prometheus/prometheus" \
      org.opencontainers.image.revision="5241a27fe3c6983549fccc32f6e65917408c63cd"
COPY --from=build --chmod=0755 /out/prometheus /bin/prometheus
COPY --from=build --chmod=0755 /out/promtool /bin/promtool
COPY --from=build /out/licenses/prometheus/ /licenses/prometheus/
RUN mkdir -p /prometheus /etc/prometheus && chown -R nobody:nobody /prometheus /etc/prometheus
USER nobody
WORKDIR /prometheus
EXPOSE 9090
VOLUME ["/prometheus"]
ENTRYPOINT ["/bin/prometheus"]
CMD ["--config.file=/etc/prometheus/prometheus.yml", "--storage.tsdb.path=/prometheus"]
