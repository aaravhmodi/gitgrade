from __future__ import annotations

import json
import os
import socket
import ssl
from dataclasses import dataclass
from hashlib import sha256
from urllib.parse import urlparse


@dataclass(slots=True)
class RedisConfig:
    host: str
    port: int
    password: str | None
    db: int
    use_tls: bool


def _encode_bulk(value: str) -> bytes:
    encoded = value.encode("utf-8")
    return b"$" + str(len(encoded)).encode("ascii") + b"\r\n" + encoded + b"\r\n"


def _encode_command(*parts: str) -> bytes:
    payload = b"*" + str(len(parts)).encode("ascii") + b"\r\n"
    for part in parts:
        payload += _encode_bulk(part)
    return payload


def _read_line(sock: socket.socket) -> bytes:
    buffer = bytearray()
    while True:
        chunk = sock.recv(1)
        if not chunk:
            raise ConnectionError("Redis connection closed.")
        buffer.extend(chunk)
        if buffer.endswith(b"\r\n"):
            return bytes(buffer[:-2])


def _read_bytes(sock: socket.socket, size: int) -> bytes:
    buffer = bytearray()
    while len(buffer) < size:
        chunk = sock.recv(size - len(buffer))
        if not chunk:
            raise ConnectionError("Redis connection closed.")
        buffer.extend(chunk)
    return bytes(buffer)


def _read_exact(sock: socket.socket, size: int) -> bytes:
    buffer = bytearray()
    while len(buffer) < size:
        chunk = sock.recv(size - len(buffer))
        if not chunk:
            raise ConnectionError("Redis connection closed.")
        buffer.extend(chunk)
    return bytes(buffer)


def _read_response(sock: socket.socket):
    prefix = sock.recv(1)
    if not prefix:
        raise ConnectionError("Redis connection closed.")

    if prefix == b"+":
        return _read_line(sock).decode("utf-8")
    if prefix == b"-":
        raise RuntimeError(_read_line(sock).decode("utf-8"))
    if prefix == b":":
        return int(_read_line(sock))
    if prefix == b"$":
        length = int(_read_line(sock))
        if length == -1:
            return None
        data = _read_bytes(sock, length)
        if _read_exact(sock, 2) != b"\r\n":
            raise ConnectionError("Invalid Redis bulk string terminator.")
        return data.decode("utf-8")
    if prefix == b"*":
        length = int(_read_line(sock))
        if length == -1:
            return None
        return [_read_response(sock) for _ in range(length)]
    raise RuntimeError("Unsupported Redis response type.")


class RedisCache:
    def __init__(self, config: RedisConfig) -> None:
        self.config = config

    @classmethod
    def from_env(cls) -> "RedisCache | None":
        raw_url = os.environ.get("REDIS_URL")
        if not raw_url:
            return None

        parsed = urlparse(raw_url)
        if parsed.scheme not in {"redis", "rediss"}:
            return None

        host = parsed.hostname
        if not host:
            return None

        return cls(
            RedisConfig(
                host=host,
                port=parsed.port or (6380 if parsed.scheme == "rediss" else 6379),
                password=parsed.password,
                db=int(parsed.path.lstrip("/") or "0"),
                use_tls=parsed.scheme == "rediss",
            )
        )

    def _request(self, *parts: str):
        with socket.create_connection((self.config.host, self.config.port), timeout=3) as sock:
            if self.config.use_tls:
                context = ssl.create_default_context()
                sock = context.wrap_socket(sock, server_hostname=self.config.host)

            if self.config.password:
                sock.sendall(_encode_command("AUTH", self.config.password))
                _read_response(sock)

            if self.config.db:
                sock.sendall(_encode_command("SELECT", str(self.config.db)))
                _read_response(sock)

            sock.sendall(_encode_command(*parts))
            return _read_response(sock)

    def get_json(self, key: str) -> dict[str, object] | None:
        try:
            value = self._request("GET", key)
        except Exception:
            return None

        if not isinstance(value, str) or not value:
            return None

        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return None

        return parsed if isinstance(parsed, dict) else None

    def set_json(self, key: str, value: dict[str, object], ttl_seconds: int) -> None:
        try:
            self._request("SETEX", key, str(ttl_seconds), json.dumps(value, separators=(",", ":"), sort_keys=True))
        except Exception:
            return


def build_cache_key(prefix: str, payload: dict[str, object]) -> str:
    digest = sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    return f"gitgrade:{prefix}:{digest}"
