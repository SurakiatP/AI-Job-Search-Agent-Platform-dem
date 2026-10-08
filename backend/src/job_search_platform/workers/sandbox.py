"""Private per-run workspace creation and immutable input staging."""
from __future__ import annotations

import os
import re
from pathlib import Path, PurePosixPath


_SAFE_ID = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")


class RunSandbox:
    """A project/run-owned workspace with separate read-only inputs."""

    def __init__(self, root: Path, project_id: str, run_id: str) -> None:
        if not _SAFE_ID.fullmatch(project_id) or not _SAFE_ID.fullmatch(run_id):
            raise ValueError("sandbox_identity_invalid")
        self.root = root.expanduser().resolve()
        self.project_id = project_id
        self.run_id = run_id
        self.project_root = self.root / project_id
        self.workspace = self.project_root / run_id
        self.inputs = self.workspace / "inputs"
        self.staging = self.workspace / "staging"

    def prepare(self) -> None:
        self._private_dir(self.root, self.root)
        self._private_dir(self.project_root, self.root)
        self._private_dir(self.workspace, self.project_root)
        self._private_dir(self.inputs, self.workspace)
        self._private_dir(self.staging, self.workspace)

    def write_input(self, name: str, content: str | bytes) -> Path:
        path = self._path(self.inputs, name)
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        self._private_dir(path.parent, self.inputs)
        body = content.encode("utf-8") if isinstance(content, str) else content
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o400)
        try:
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(body)
                stream.flush()
                os.fsync(stream.fileno())
        except BaseException:
            path.unlink(missing_ok=True)
            raise
        path.chmod(0o400)
        return path

    def staging_path(self, name: str) -> Path:
        return self._path(self.staging, name)

    def native_environment(self) -> dict[str, str]:
        """Return only non-secret values needed to identify the project."""
        return {
            "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
            "HOME": str(self.project_root),
            "PLATFORM_PROJECT_ID": self.project_id,
            "PLATFORM_RUN_ID": self.run_id,
        }

    @staticmethod
    def _path(root: Path, relative: str) -> Path:
        candidate = PurePosixPath(relative)
        if (
            not relative
            or candidate.is_absolute()
            or any(part in {"", ".", ".."} for part in candidate.parts)
            or "\\" in relative
        ):
            raise ValueError("sandbox_path_invalid")
        path = root.joinpath(*candidate.parts)
        if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
            raise ValueError("sandbox_path_invalid")
        return path

    @staticmethod
    def _private_dir(path: Path, allowed_parent: Path) -> None:
        if path.is_symlink() or not path.resolve().is_relative_to(allowed_parent.resolve()):
            raise ValueError("sandbox_path_invalid")
        path.mkdir(mode=0o700, exist_ok=True)
        if not path.is_dir():
            raise ValueError("sandbox_path_invalid")
        path.chmod(0o700)
