"""Resume themes (SPEC-RTH): a theme is data (layout + tokens), never Typst code. Presets, theme file validation, export."""
from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, ConfigDict, ValidationError, field_validator

from job_search_platform.services import resume as rs

FORMAT = "jsp-resume-theme"
FILE_MAX_BYTES = 4096
NAME_MAX = 60
MAX_CUSTOM_THEMES = 20
BAND_TINT = 0.10  # share of the accent in the heading band; the Typst side mixes with the same number


class ThemeError(ValueError):
    """A theme file or token set broke a rule; `rule` names the field (for example `tokens.accent`)."""

    def __init__(self, rule: str):
        super().__init__(rule)
        self.rule = rule


def _luminance(hexcode: str) -> float:
    def channel(value: int) -> float:
        c = value / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (int(hexcode[i:i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def accent_ok(hexcode: str) -> bool:
    """Accent text must stay readable on white and on the heading band (10% accent over white), WCAG AA."""
    if not re.fullmatch(r"#[0-9A-Fa-f]{6}", hexcode):
        return False
    rgb = [int(hexcode[i:i + 2], 16) for i in (1, 3, 5)]
    tint = "#" + "".join(f"{round(255 * (1 - BAND_TINT) + v * BAND_TINT):02x}" for v in rgb)
    return all((_luminance(bg) + 0.05) / (_luminance(hexcode) + 0.05) >= 4.5 for bg in ("#FFFFFF", tint))


class TokensModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    accent: str
    font_pair: Literal["sans", "serif"] = "sans"
    size: Literal["small", "normal", "large"] = "normal"
    density: Literal["compact", "normal", "relaxed"] = "normal"
    heading_style: Literal["plain", "rule", "band"] = "plain"

    @field_validator("accent")
    @classmethod
    def check_accent(cls, value: str) -> str:
        if not accent_ok(value):
            raise ValueError("accent_contrast")
        return value.upper()


class ThemeFile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    format: Literal["jsp-resume-theme"]
    version: Literal[1]
    name: str
    layout: str
    tokens: TokensModel

    @field_validator("name")
    @classmethod
    def check_name(cls, value: str) -> str:
        value = value.strip()
        if not 1 <= len(value) <= NAME_MAX or any(unicodedata.category(c) == "Cc" for c in value):
            raise ValueError("name")
        return value

    @field_validator("layout")
    @classmethod
    def check_layout(cls, value: str) -> str:
        if value not in rs.TEMPLATES:
            raise ValueError("layout")
        return value


def _rule(error: ValidationError) -> str:
    return ".".join(str(part) for part in error.errors()[0]["loc"]) or "theme"


def validate_file(raw: bytes) -> ThemeFile:
    """Whole-file validation; nothing is kept when any rule fails."""
    if len(raw) > FILE_MAX_BYTES:
        raise ThemeError("file_size")
    try:
        body = json.loads(raw.decode("utf-8-sig"))
    except ValueError:
        raise ThemeError("not_json") from None
    if not isinstance(body, dict):
        raise ThemeError("not_object")
    return check(body)


def check(body: dict) -> ThemeFile:
    try:
        return ThemeFile.model_validate(body)
    except ValidationError as error:
        raise ThemeError(_rule(error)) from None


def validate_tokens(tokens: dict) -> TokensModel:
    try:
        return TokensModel.model_validate(tokens)
    except ValidationError as error:
        raise ThemeError("tokens." + _rule(error)) from None


def export_file(name: str, layout: str, tokens: TokensModel | dict) -> bytes:
    """The shareable file: theme data only, no owner or CV data."""
    tokens = tokens if isinstance(tokens, TokensModel) else TokensModel.model_validate(tokens)
    body = {"format": FORMAT, "version": 1, "name": name, "layout": layout, "tokens": tokens.model_dump()}
    return json.dumps(body, ensure_ascii=False, indent=2).encode()


def unique_name(name: str, existing: set[str]) -> str:
    if name not in existing:
        return name
    number = 2
    while f"{name[:NAME_MAX - 4]} {number}" in existing:
        number += 1
    return f"{name[:NAME_MAX - 4]} {number}"


def flags(layout: str) -> tuple[bool, bool]:
    """(reads in order for ATS, prints the photo): both come from the layout."""
    return rs.TEMPLATES[layout], layout in rs.PHOTO_TEMPLATES


@dataclass(frozen=True)
class Preset:
    layout: str
    tokens: dict
    th: str
    en: str
    legacy: bool = False  # the six original ids render exactly as before: no tokens reach the template


def _t(**changes) -> dict:
    return {"accent": rs.ACCENTS["indigo"], **changes}


PRESETS: dict[str, Preset] = {
    **{key: Preset(key, _t(), key.capitalize(), key.capitalize(), legacy=True)
       for key in ("onyx", "kakuna", "ditgar", "lotus", "teak", "saffron")},
    "paper": Preset("onyx", _t(font_pair="serif", density="relaxed", heading_style="rule"), "กระดาษ", "Paper"),
    "compact": Preset("onyx", _t(size="small", density="compact"), "กะทัดรัด", "Compact"),
    "banner": Preset("kakuna", _t(heading_style="band"), "แบนเนอร์", "Banner"),
    "classic": Preset("kakuna", _t(font_pair="serif", density="relaxed", heading_style="rule"), "คลาสสิก", "Classic"),
    "portrait": Preset("lotus", _t(font_pair="serif"), "พอร์ตเทรต", "Portrait"),
    "studio": Preset("saffron", _t(size="large", heading_style="band"), "สตูดิโอ", "Studio"),
}


def resolve(preset_id: str, accent_name: str) -> tuple[str, dict | None]:
    """(layout, tokens) for a preset. The accent still comes from the owner's accent choice, as before."""
    preset = PRESETS[preset_id]
    if preset.legacy:
        return preset.layout, None
    return preset.layout, {**preset.tokens, "accent": rs.ACCENTS[accent_name]}
