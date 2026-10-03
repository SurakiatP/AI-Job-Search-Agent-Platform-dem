FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS node
FROM python:3.14.7-slim-trixie@sha256:51dafde81dbdb6ebde285137a295cf18a47ca95234fe388a343719cb97305b3d
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \
    ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx && \
    apt-get update && apt-get install -y --no-install-recommends \
        ripgrep=14.1.1-1+b4 chromium=154.0.8037.92-1~deb13u1 \
        libpcre2-8-0=10.46-1~deb13u3 libssl3t64=3.5.7-1~deb13u3 \
        openssl=3.5.7-1~deb13u3 openssl-provider-legacy=3.5.7-1~deb13u3 && \
    rm -rf /var/lib/apt/lists/*
COPY career-ops/ /opt/career-ops/
COPY career-ops-docx/ /opt/career-ops-docx/
COPY package.json package-lock.json /opt/runtime/
COPY parser-requirements.txt parse_document.py export_pdf.mjs /opt/runtime/
RUN cd /opt/runtime && npm ci --ignore-scripts && \
    ln -s /opt/runtime/node_modules /opt/career-ops/node_modules && \
    pip install --require-hashes --only-binary=:all: --no-deps -r parser-requirements.txt && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
        /usr/local/lib/python3.14/site-packages/pip* /usr/local/bin/pip* && \
    chmod -R a-w /opt/career-ops /opt/career-ops-docx /opt/runtime
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /workspace
USER 65534:65534
CMD ["sleep", "infinity"]
