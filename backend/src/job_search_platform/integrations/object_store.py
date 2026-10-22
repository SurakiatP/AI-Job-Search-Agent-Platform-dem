"""Private S3-compatible object storage adapter."""

from __future__ import annotations

import asyncio
import base64
import hashlib
from botocore.exceptions import ClientError

MAX_OBJECT_BYTES = 20 * 1024 * 1024


class ObjectMissing(Exception):
    """The requested private object does not exist."""


class ObjectTooLarge(Exception):
    """The object exceeds the platform's bounded file size."""


class S3ObjectStore:
    """Small async adapter over an injected, already-authenticated boto3 client."""

    def __init__(self, client, bucket: str) -> None:
        if not bucket or bucket.startswith("http"):
            raise ValueError("object_bucket_invalid")
        self._client = client
        self.bucket = bucket

    async def ping(self) -> None:
        await asyncio.to_thread(self._client.head_bucket, Bucket=self.bucket)

    async def put(self, key: str, body: bytes, checksum: str) -> None:
        if len(body) > MAX_OBJECT_BYTES or hashlib.sha256(body).hexdigest() != checksum:
            raise ValueError("object_checksum_mismatch")
        encoded_checksum = base64.b64encode(bytes.fromhex(checksum)).decode("ascii")
        await asyncio.to_thread(
            self._client.put_object,
            Bucket=self.bucket,
            Key=key,
            Body=body,
            ChecksumSHA256=encoded_checksum,
            Metadata={"sha256": checksum},
        )

    async def get(self, key: str) -> bytes:
        try:
            response = await asyncio.to_thread(
                self._client.get_object, Bucket=self.bucket, Key=key
            )
        except ClientError as exc:
            if _is_missing(exc):
                raise ObjectMissing from None
            raise
        body = response["Body"]
        try:
            chunks: list[bytes] = []
            size = 0
            while chunk := await asyncio.to_thread(
                body.read, min(64 * 1024, MAX_OBJECT_BYTES + 1 - size)
            ):
                size += len(chunk)
                if size > MAX_OBJECT_BYTES:
                    raise ObjectTooLarge
                chunks.append(chunk)
            return b"".join(chunks)
        finally:
            await asyncio.to_thread(body.close)

    async def exists(self, key: str) -> bool:
        try:
            await asyncio.to_thread(
                self._client.head_object, Bucket=self.bucket, Key=key
            )
        except ClientError as exc:
            if _is_missing(exc):
                return False
            raise
        return True

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self._client.delete_object, Bucket=self.bucket, Key=key)

def _is_missing(error: ClientError) -> bool:
    response = error.response
    code = str(response.get("Error", {}).get("Code", ""))
    status = response.get("ResponseMetadata", {}).get("HTTPStatusCode")
    return code in {"NoSuchKey", "NoSuchObject", "404", "NotFound"} or status == 404
