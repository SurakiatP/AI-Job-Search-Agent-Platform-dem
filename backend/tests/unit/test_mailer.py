from job_search_platform.integrations.mailer import Mail, MemoryMailer, SmtpMailer


def test_memory_mailer_records():
    m = MemoryMailer()
    m.send(Mail("a@x.com", "s", "t"))
    assert m.sent == [Mail("a@x.com", "s", "t")]


def test_from_env_none_without_host(monkeypatch):
    monkeypatch.delenv("SMTP_HOST", raising=False)
    assert SmtpMailer.from_env() is None


def test_from_env_reads_settings(monkeypatch):
    for key, value in {"SMTP_HOST": "127.0.0.1", "SMTP_PORT": "51025", "SMTP_FROM": "no-reply@example.test",
                       "SMTP_STARTTLS": "false"}.items():
        monkeypatch.setenv(key, value)
    m = SmtpMailer.from_env()
    assert (m.host, m.port, m.sender, m.starttls) == ("127.0.0.1", 51025, "no-reply@example.test", False)


def test_smtp_send_uses_smtplib(monkeypatch):
    calls = []

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            calls.append(("connect", host, port))
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def starttls(self): calls.append(("starttls",))
        def login(self, u, p): calls.append(("login", u))
        def send_message(self, msg): calls.append(("send", msg["To"], msg["Subject"]))

    monkeypatch.setattr("smtplib.SMTP", FakeSMTP)
    SmtpMailer("h", 25, "u", "p", "from@x.test", True).send(Mail("to@x.test", "Subj", "Body"))
    assert calls == [("connect", "h", 25), ("starttls",), ("login", "u"), ("send", "to@x.test", "Subj")]


def test_provider_presets_and_password_file(monkeypatch, tmp_path):
    for key in ("SMTP_HOST", "SMTP_PORT", "SMTP_PASSWORD", "SMTP_STARTTLS"):
        monkeypatch.delenv(key, raising=False)
    secret = tmp_path / "smtp-password"
    secret.write_text("abcd efgh ijkl mnop\n")
    monkeypatch.setenv("SMTP_PASSWORD_FILE", str(secret))
    monkeypatch.setenv("SMTP_USERNAME", "sender@example.test")
    for provider, host in {"gmail": "smtp.gmail.com", "outlook": "smtp-mail.outlook.com"}.items():
        monkeypatch.setenv("SMTP_PROVIDER", provider)
        m = SmtpMailer.from_env()
        assert (m.host, m.port, m.starttls, m.password) == (host, 587, True, "abcdefghijklmnop")
        assert m.sender == "sender@example.test"  # defaults to the login address, which these providers require
    monkeypatch.setenv("SMTP_PROVIDER", "unknown")
    try:
        SmtpMailer.from_env()
        raise AssertionError("unknown provider must fail at startup")
    except ValueError:
        pass
