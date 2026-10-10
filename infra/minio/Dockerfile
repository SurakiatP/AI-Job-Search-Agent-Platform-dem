# MinIO OSS source pinned by FILE-001. Go 1.26.3 is newer than the
# source's go1.24.8 minimum and includes maintained toolchain fixes (go1.27.2: CVE-2026-78667/78669/97031).
FROM golang:1.27.2-bookworm@sha256:5cf287a799e6b94384bad13d16b14904c531f51ba65792237e122ce42b392f61 AS build
WORKDIR /src
COPY --from=minio_source / /src/
COPY go.mod go.sum provenance.json /src/
ARG MINIO_SOURCE_COMMIT
RUN test "$MINIO_SOURCE_COMMIT" = "7aac2a2c5b7c882e68c1ce017d8256be2feea27f" \
    && test "$(go version | awk '{ print $3 }')" = "go1.27.2" \
    && grep -F '"source_commit": "7aac2a2c5b7c882e68c1ce017d8256be2feea27f"' provenance.json \
    && test "$(sha256sum go.mod | awk '{ print $1 }')" = "$(sed -n 's/.*"go_mod_sha256": "\([0-9a-f]*\)".*/\1/p' provenance.json)" \
    && test "$(sha256sum go.sum | awk '{ print $1 }')" = "$(sed -n 's/.*"go_sum_sha256": "\([0-9a-f]*\)".*/\1/p' provenance.json)" \
    && test "$(awk '$1 == "go" { print $2 }' go.mod)" = "1.26.0" \
    && test -s LICENSE \
    && go mod verify \
    && CGO_ENABLED=0 GOTOOLCHAIN=local go build -mod=readonly -buildvcs=false -trimpath \
      -ldflags='-s -w' -o /out/minio . \
    && install -D -m 0644 LICENSE /out/licenses/minio/LICENSE \
    && install -D -m 0644 /etc/ssl/certs/ca-certificates.crt /out/ca-certificates.crt

FROM busybox:1.37.0-musl@sha256:5cec3fc171c87218698e85a52af7087de727372aae264a787b8112901a5b0092 AS runtime-files
RUN mkdir -p /data && chown 10001:10001 /data

FROM scratch
LABEL org.opencontainers.image.title="MinIO OSS source build" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.version="7aac2a2c5b7c882e68c1ce017d8256be2feea27f" \
      org.opencontainers.image.source="https://github.com/minio/minio"
COPY --from=build --chown=10001:10001 /out/minio /usr/bin/minio
COPY --from=build /out/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /out/licenses/minio/LICENSE /licenses/minio/LICENSE
COPY --from=runtime-files --chown=10001:10001 /bin/busybox /bin/busybox
COPY --from=runtime-files --chown=10001:10001 /data /data
USER 10001:10001
VOLUME ["/data"]
EXPOSE 9000
ENTRYPOINT ["/usr/bin/minio"]
CMD ["server", "/data", "--address", ":9000"]
HEALTHCHECK --interval=5s --timeout=3s --start-period=20s --retries=12 \
  CMD ["/bin/busybox", "wget", "-q", "-T", "2", "-O", "/dev/null", "http://127.0.0.1:9000/minio/health/live"]
