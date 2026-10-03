# Keep PostgreSQL 17's upstream Alpine runtime and replace only its outdated gosu binary.
FROM golang:1.27.1-bookworm@sha256:69a7b9788769bec032d238959b61854e9ae87f57be9029ec04e9885fabf99195 AS gosu-build
WORKDIR /src
COPY --from=gosu_source / /src/
COPY go.mod go.sum provenance.json /src/
ARG GOSU_SOURCE_COMMIT
RUN mkdir -p /out \
    && test "$GOSU_SOURCE_COMMIT" = "6456aaa0f3c854d199d0f037f068eb97515b7513" \
    && test "$(go version | awk '{ print $3 }')" = "go1.27.1" \
    && grep -F '"source_commit": "6456aaa0f3c854d199d0f037f068eb97515b7513"' provenance.json \
    && grep -F '"base_image": "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24"' provenance.json \
    && test "$(sha256sum go.mod | awk '{ print $1 }')" = "$(sed -n 's/.*"go_mod_sha256": "\([0-9a-f]*\)".*/\1/p' provenance.json)" \
    && test "$(sha256sum go.sum | awk '{ print $1 }')" = "$(sed -n 's/.*"go_sum_sha256": "\([0-9a-f]*\)".*/\1/p' provenance.json)" \
    && grep -F 'const Version = "1.19"' version.go \
    && test -s LICENSE \
    && go mod verify \
    && CGO_ENABLED=0 GOTOOLCHAIN=local go build -mod=readonly -buildvcs=false -trimpath \
       -ldflags='-s -w' -o /out/gosu . \
    && install -D -m 0644 LICENSE /out/licenses/gosu/LICENSE

FROM postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
LABEL org.opencontainers.image.title="PostgreSQL 17.11 Alpine with source-built gosu" \
      org.opencontainers.image.licenses="PostgreSQL AND Apache-2.0" \
      org.opencontainers.image.version="17.11-gosu-1.19" \
      org.opencontainers.image.source="https://github.com/docker-library/postgres" \
      org.opencontainers.image.gosu.source="https://github.com/tianon/gosu" \
      org.opencontainers.image.gosu.revision="6456aaa0f3c854d199d0f037f068eb97515b7513"
COPY --from=gosu-build --chmod=0755 /out/gosu /usr/local/bin/gosu
COPY --from=gosu-build /out/licenses/gosu/LICENSE /licenses/gosu/LICENSE
