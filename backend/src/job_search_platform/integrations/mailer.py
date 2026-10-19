"""Outbound email: stdlib SMTP in production, an in-memory recorder in tests."""
from __future__ import annotations

import os
import smtplib
from dataclasses import dataclass, field
from email.message import EmailMessage


@dataclass(frozen=True)
class Mail:
    to: str
    subject: str
    text: str


# SMTP_PROVIDER presets (port 587 with STARTTLS); the account needs an app password.
PROVIDERS = {"gmail": "smtp.gmail.com", "outlook": "smtp-mail.outlook.com"}


@dataclass
class SmtpMailer:
    host: str
    port: int
    username: str | None
    password: str | None = field(repr=False)
    sender: str
    starttls: bool

    @classmethod
    def from_env(cls) -> "SmtpMailer | None":
        provider = os.environ.get("SMTP_PROVIDER", "").strip().lower()
        if provider and provider not in PROVIDERS:
            raise ValueError("smtp_provider_unknown")
        host = os.environ.get("SMTP_HOST") or (PROVIDERS[provider] if provider else None)
        if not host:
            return None
        username = os.environ.get("SMTP_USERNAME") or None
        password = os.environ.get("SMTP_PASSWORD") or None
        if not password and os.environ.get("SMTP_PASSWORD_FILE"):
            with open(os.path.expanduser(os.environ["SMTP_PASSWORD_FILE"]), encoding="utf-8") as handle:
                password = "".join(handle.read().split())  # Google shows app passwords in groups of four
        # Gmail and Outlook only send as the signed-in address.
        sender = os.environ.get("SMTP_FROM") or (username if provider else None) or "no-reply@localhost"
        return cls(host, int(os.environ.get("SMTP_PORT", "587")), username, password or None, sender,
                   os.environ.get("SMTP_STARTTLS", "true").lower() == "true")

    def send(self, mail: Mail) -> None:
        message = EmailMessage()
        message["From"], message["To"], message["Subject"] = self.sender, mail.to, mail.subject
        message.set_content(mail.text)
        with smtplib.SMTP(self.host, self.port, timeout=15) as smtp:
            if self.starttls:
                smtp.starttls()
            if self.username:
                smtp.login(self.username, self.password or "")
            smtp.send_message(message)


@dataclass
class MemoryMailer:
    sent: list[Mail] = field(default_factory=list)

    def send(self, mail: Mail) -> None:
        self.sent.append(mail)
