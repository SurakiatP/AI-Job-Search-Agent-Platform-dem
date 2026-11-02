# LiteLLM with its config and the seed script baked in. The deploy job talks to the host Docker, so a
# bind mount of a path inside the checkout would not exist on the host.
FROM ghcr.io/berriai/litellm-database:1.104.2@sha256:5a9ff0fd7177372f2ccd8949cb121f67e281f4d13d026af51f9c096c0626f50a
COPY config.yaml /app/config.yaml
COPY seed.py /seed/seed.py
