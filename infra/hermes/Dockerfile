FROM node:24.18.0-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS node
FROM python:3.14.7-alpine@sha256:9e9fde4d32eedce0b661d9ab91e826b62dddf28e928c230ec55f1866cac66b01
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \
    ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx && \
    apk upgrade --no-cache && apk add --no-cache \
        bash=5.3.9-r1 chromium=152.0.7977.82-r0 ripgrep=15.1.0-r0 libstdc++=15.2.0-r5
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
