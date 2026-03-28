"""AES-256 encryption for sensitive data (API keys, OAuth tokens)."""
import base64
from cryptography.fernet import Fernet
from app.config import settings


def _get_fernet() -> Fernet:
    """Build a Fernet instance from the app's ENCRYPTION_KEY."""
    raw = settings.encryption_key.strip()
    # Accept both raw bytes (base64-encoded) and hex strings
    try:
        key_bytes = base64.urlsafe_b64decode(raw + "==")
    except Exception:
        key_bytes = raw.encode()
    # Fernet requires exactly 32 bytes, encoded as URL-safe base64
    if len(key_bytes) < 32:
        key_bytes = key_bytes.ljust(32, b"\x00")
    elif len(key_bytes) > 32:
        key_bytes = key_bytes[:32]
    fernet_key = base64.urlsafe_b64encode(key_bytes)
    return Fernet(fernet_key)


def encrypt(plaintext: str) -> str:
    """Encrypt a plaintext string. Returns base64-encoded ciphertext."""
    f = _get_fernet()
    token = f.encrypt(plaintext.encode("utf-8"))
    return token.decode("utf-8")


def decrypt(ciphertext: str) -> str:
    """Decrypt a ciphertext string. Returns original plaintext."""
    f = _get_fernet()
    return f.decrypt(ciphertext.encode("utf-8")).decode("utf-8")


def key_hint(plaintext: str) -> str:
    """Return the last 4 characters of the key for display purposes."""
    return f"...{plaintext[-4:]}" if len(plaintext) >= 4 else "****"
