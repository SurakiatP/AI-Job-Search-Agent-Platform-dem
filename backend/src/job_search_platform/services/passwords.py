"""Password policy and stdlib scrypt hashing (self-describing hash strings)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from functools import lru_cache

from job_search_platform.services.errors import ServiceError

MIN_LENGTH, MAX_LENGTH = 10, 128
SCRYPT_N, SCRYPT_R, SCRYPT_P = 2**17, 8, 1
SALT_BYTES, KEY_BYTES = 16, 64


def check_policy(password: str) -> None:
    if not isinstance(password, str) or not MIN_LENGTH <= len(password) <= MAX_LENGTH:
        raise ServiceError("weak_password")


def _derive(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p,
                          maxmem=256 * 1024 * 1024, dklen=KEY_BYTES)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(SALT_BYTES)
    key = _derive(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P)
    b64 = lambda raw: base64.b64encode(raw).decode("ascii")
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${b64(salt)}${b64(key)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algo, n, r, p, salt, key = encoded.split("$")
        if algo != "scrypt":
            return False
        expected = base64.b64decode(key, validate=True)
        actual = _derive(password, base64.b64decode(salt, validate=True), int(n), int(r), int(p))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


@lru_cache(maxsize=1)
def _dummy_hash() -> str:
    return hash_password(secrets.token_urlsafe(16))


def verify_dummy(password: str) -> None:
    """Spend the same work as a real check, so unknown emails are not distinguishable by timing."""
    verify_password(password, _dummy_hash())


def normalize_email(raw: str) -> str:
    email = raw.strip().lower()
    local, sep, domain = email.partition("@")
    if not sep or not local or not domain or "@" in domain or len(email) > 254:
        raise ServiceError("invalid_email")
    return email
