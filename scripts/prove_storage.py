"""Exercise PostgreSQL and private S3 persistence using synthetic data only."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

import boto3
import psycopg
from botocore.config import Config
from botocore.exceptions import ClientError

from local_infra import (
    DEFAULT_MINIO_SOURCE,
    MINIO_COMMIT,
    POSTGRES_IMAGE,
    ConfigurationError,
    restart_minio,
    validate_minio_source,
    validate_private_directory,
)


def _secret(private_dir: Path, name: str) -> str:
    path = private_dir / name
    if path.is_symlink() or not path.is_file() or path.stat().st_mode & 0o077:
        raise ConfigurationError("credential_file_invalid_or_permissions")
    return path.read_text(encoding="utf-8").strip()


def _http_ready(url: str, timeout: float = 120.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return
        except (OSError, urllib.error.URLError):
            time.sleep(1)
    raise RuntimeError("minio_health_timeout")


def _s3_client(endpoint: str, access_key: str, secret_key: str):
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="us-east-1",
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def prove(private_dir: Path) -> dict[str, str]:
    private_dir = validate_private_directory(private_dir)
    source_dir = validate_minio_source(Path(os.environ.get("MINIO_SOURCE_DIR", str(DEFAULT_MINIO_SOURCE))))
    postgres_user = _secret(private_dir, "postgres-user")
    postgres_password = _secret(private_dir, "postgres-password")
    minio_user = _secret(private_dir, "minio-access-key")
    minio_password = _secret(private_dir, "minio-secret-key")
    postgres_port = int(os.environ.get("CORE02_POSTGRES_PORT", "55432"))
    minio_port = int(os.environ.get("CORE02_MINIO_PORT", "59000"))
    endpoint = f"http://127.0.0.1:{minio_port}"
    _http_ready(f"{endpoint}/minio/health/ready")

    row_id = str(uuid.uuid4())
    with psycopg.connect(
        host="127.0.0.1",
        port=postgres_port,
        dbname="jobsearch_platform_core02",
        user=postgres_user,
        password=postgres_password,
        connect_timeout=8,
    ) as connection:
        with connection.cursor() as cursor:
            cursor.execute("CREATE TEMPORARY TABLE core02_storage_probe (id uuid PRIMARY KEY, payload text NOT NULL)")
            cursor.execute("INSERT INTO core02_storage_probe (id, payload) VALUES (%s, %s)", (row_id, "synthetic storage row"))
            cursor.execute("SELECT payload FROM core02_storage_probe WHERE id = %s", (row_id,))
            if cursor.fetchone() != ("synthetic storage row",):
                raise RuntimeError("postgres_round_trip_mismatch")
            connection.rollback()

    client = _s3_client(endpoint, minio_user, minio_password)
    anonymous = _s3_client(endpoint, "", "")
    bucket = f"core02-proof-{uuid.uuid4().hex}"
    key = f"synthetic/{uuid.uuid4().hex}.txt"
    body = b"CORE-02 synthetic storage integrity proof\n"
    digest = hashlib.sha256(body).digest()
    expected_sha256 = hashlib.sha256(body).hexdigest()
    client.create_bucket(Bucket=bucket)
    try:
        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=body,
            ChecksumSHA256=base64.b64encode(digest).decode("ascii"),
        )
        anonymous_denied = False
        try:
            anonymous.get_object(Bucket=bucket, Key=key)
        except ClientError as exc:
            anonymous_denied = exc.response.get("Error", {}).get("Code") in {
                "AccessDenied",
                "InvalidAccessKeyId",
                "SignatureDoesNotMatch",
            }
        if not anonymous_denied:
            raise RuntimeError("anonymous_object_read_succeeded")

        first_read = client.get_object(Bucket=bucket, Key=key)["Body"].read()
        if hashlib.sha256(first_read).hexdigest() != expected_sha256:
            raise RuntimeError("s3_checksum_mismatch_before_restart")

        os.environ["MINIO_SOURCE_DIR"] = str(source_dir)
        restart_minio(private_dir)
        _http_ready(f"{endpoint}/minio/health/ready")
        after_restart = client.get_object(Bucket=bucket, Key=key)["Body"].read()
        if hashlib.sha256(after_restart).hexdigest() != expected_sha256:
            raise RuntimeError("s3_checksum_mismatch_after_restart")
    finally:
        try:
            client.delete_object(Bucket=bucket, Key=key)
            client.delete_bucket(Bucket=bucket)
        except ClientError:
            pass

    image_ids = {}
    import subprocess

    for service, image in (
        ("postgres", POSTGRES_IMAGE),
        ("minio", "job-search-platform/minio-oss:" + MINIO_COMMIT),
    ):
        inspected = subprocess.run(
            ["docker", "image", "inspect", "--format", "{{.Id}}", image],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
        if inspected.returncode or not inspected.stdout.strip().startswith("sha256:"):
            raise RuntimeError(f"{service}_image_identity_unavailable")
        image_ids[service] = inspected.stdout.strip()
    return {
        "status": "verified",
        "source_commit": MINIO_COMMIT,
        "postgres_image_id": image_ids["postgres"],
        "minio_image_id": image_ids["minio"],
        "database": "verified",
        "object_checksum": "verified",
        "checksum_sha256": expected_sha256,
        "anonymous_access": "denied",
        "restart_persistence": "verified",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--private-dir", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        result = prove(args.private_dir)
    except (ClientError, ConfigurationError, OSError, RuntimeError, ValueError) as exc:
        print(json.dumps({"status": "failed", "reason": str(exc)}), file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
