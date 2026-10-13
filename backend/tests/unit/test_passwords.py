import pytest
from job_search_platform.services import passwords
from job_search_platform.services.errors import ServiceError


@pytest.fixture(autouse=True)
def fast_scrypt(monkeypatch):
    monkeypatch.setattr(passwords, "SCRYPT_N", 2**10)


def test_round_trip_and_format():
    encoded = passwords.hash_password("correct horse battery")
    algo, n, r, p, salt, key = encoded.split("$")
    assert (algo, n, r, p) == ("scrypt", str(2**10), "8", "1")
    assert passwords.verify_password("correct horse battery", encoded)
    assert not passwords.verify_password("correct horse batterY", encoded)


def test_verify_uses_parameters_stored_in_hash(monkeypatch):
    encoded = passwords.hash_password("correct horse battery")
    monkeypatch.setattr(passwords, "SCRYPT_N", 2**11)
    assert passwords.verify_password("correct horse battery", encoded)


@pytest.mark.parametrize("bad", ["", "short", "x" * 9, "x" * 129])
def test_policy_rejects_length(bad):
    with pytest.raises(ServiceError) as err:
        passwords.check_policy(bad)
    assert err.value.code == "weak_password"


@pytest.mark.parametrize("ok", ["x" * 10, "x" * 128, "รหัสผ่านภาษาไทยยาว"])
def test_policy_accepts_length(ok):
    passwords.check_policy(ok)


@pytest.mark.parametrize("garbage", ["", "plain", "scrypt$1$2", "bcrypt$a$b$c$d$e", "scrypt$x$8$1$AA$AA"])
def test_verify_rejects_malformed_hash(garbage):
    assert passwords.verify_password("whatever-password", garbage) is False


def test_verify_dummy_returns_none():
    assert passwords.verify_dummy("anything-at-all") is None
