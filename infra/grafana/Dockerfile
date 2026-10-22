# Grafana 13.2.4 with only the Prometheus datasource, its backend rebuilt from pinned source with Go 1.27.2
# and golang.org/x/net v0.60.0 (spec A1.3, A1.4): upstream bundled plugin binaries carried 56 High findings.
FROM --platform=$BUILDPLATFORM golang:1.27.2-bookworm@sha256:5cf287a799e6b94384bad13d16b14904c531f51ba65792237e122ce42b392f61 AS build
ARG TARGETARCH
ARG GRAFANA_PROM_DS_SOURCE_COMMIT
WORKDIR /src
COPY --from=grafana_prom_ds_source / /src/
COPY go.mod go.sum provenance.json /src/
RUN test "$GRAFANA_PROM_DS_SOURCE_COMMIT" = "6d21418acde6ce31c9f7a6418a88758842a881bb" \
    && test "$(go version | awk '{ print $3 }')" = "go1.27.2" \
    && grep -F '"source_commit": "6d21418acde6ce31c9f7a6418a88758842a881bb"' provenance.json \
    && test "$(sha256sum go.mod | awk '{ print $1 }')" = "$(sed -n 's/.*"go_mod_sha256": "\([0-9a-f]*\)".*/\1/p' provenance.json)" \
    && test "$(sha256sum go.sum | awk '{ print $1 }')" = "$(sed -n 's/.*"go_sum_sha256": "\([0-9a-f]*\)".*/\1/p' provenance.json)" \
    && GOTOOLCHAIN=local go mod download && GOTOOLCHAIN=local go mod verify \
    && GOOS=linux GOARCH=$TARGETARCH CGO_ENABLED=0 GOTOOLCHAIN=local go build -mod=readonly -buildvcs=false -trimpath \
       -tags arrow_json_stdlib \
       -ldflags "-w -s -X 'github.com/grafana/grafana-plugin-sdk-go/build/buildinfo.buildInfoJSON={\"time\":1790683232186,\"pluginID\":\"prometheus\",\"version\":\"13.2.3\"}' -X 'main.pluginID=prometheus' -X 'main.version=13.2.3'" \
       -o /out/gpx_grafana-prometheus-datasource_linux_$TARGETARCH ./pkg

FROM grafana/grafana:13.2.4@sha256:dbbc38ea21103cefb50396340cd88afec779c7e070b0a7bf5a75b4ce46651d3f
ARG TARGETARCH
LABEL org.opencontainers.image.title="Grafana 13.2.4 with source-built Prometheus datasource" \
      org.opencontainers.image.source="https://github.com/grafana/grafana-prometheus-datasource" \
      org.opencontainers.image.revision="6d21418acde6ce31c9f7a6418a88758842a881bb"
USER root
RUN cd /usr/share/grafana/data/plugins-bundled && find . -mindepth 1 -maxdepth 1 ! -name prometheus -exec rm -rf {} + \
    && rm -f /usr/share/grafana/data/plugins-bundled/prometheus/MANIFEST.txt \
              /usr/share/grafana/data/plugins-bundled/prometheus/gpx_grafana-prometheus-datasource_linux_*
COPY --from=build --chown=472:0 --chmod=0755 /out/gpx_grafana-prometheus-datasource_linux_${TARGETARCH} \
     /usr/share/grafana/data/plugins-bundled/prometheus/gpx_grafana-prometheus-datasource_linux_${TARGETARCH}
# The rebuilt binary no longer matches the signed manifest: allow exactly this one plugin id unsigned (spec A1.4),
# and never download plugins at startup.
ENV GF_PLUGINS_PREINSTALL_DISABLED=true \
    GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=prometheus
USER 472
