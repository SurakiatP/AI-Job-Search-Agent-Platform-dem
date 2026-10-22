# Sourced by the langfuse-web and langfuse-worker entrypoints. Langfuse reads no *_FILE
# variables, so export each value from the compose secret files; nothing lands in compose env.
s() { cat "/run/secrets/$1"; }
export DATABASE_URL="postgresql://langfuse:$(s langfuse-db-password)@langfuse-db:5432/langfuse"
export CLICKHOUSE_PASSWORD="$(s langfuse-clickhouse-password)"
export REDIS_AUTH="$(s langfuse-redis-password)"
export LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID="$(s langfuse-minio-access-key)"
export LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY="$(s langfuse-minio-secret-key)"
export NEXTAUTH_SECRET="$(s langfuse-nextauth-secret)"
export SALT="$(s langfuse-salt)"
export ENCRYPTION_KEY="$(s langfuse-encryption-key)"
if [ -r /run/secrets/langfuse-ui-password ]; then  # web only: headless first-start init
  export LANGFUSE_INIT_USER_PASSWORD="$(s langfuse-ui-password)"
  export LANGFUSE_INIT_PROJECT_PUBLIC_KEY="$(s langfuse-public-key)"
  export LANGFUSE_INIT_PROJECT_SECRET_KEY="$(s langfuse-secret-key)"
fi
