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
        host = os.environ.get("SMTP_HOST")
        if not host:
            return None
        return cls(host, int(os.environ.get("SMTP_PORT", "587")), os.environ.get("SMTP_USERNAME") or None,
                   os.environ.get("SMTP_PASSWORD") or None,
                   os.environ.get("SMTP_FROM", "no-reply@localhost"),
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
