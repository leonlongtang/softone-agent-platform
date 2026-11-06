from __future__ import annotations

from typing import Any, Optional

from ..domain.errors import (
    INVALID_CREDENTIALS_CODES,
    NOT_AUTHENTICATED_CODES,
    SESSION_EXPIRED_CODES,
    InvalidCredentials,
    InvalidRequest,
    InvalidServiceCall,
    NotAuthenticated,
    SessionExpired,
    SoftOneError,
)


def raise_for_softone_error(resp: dict[str, Any]) -> None:
    """
    SoftOne public docs show `success: true|false` and a table of error codes.

    Since the exact error envelope fields are not fully specified there, we accept:
    - `{"success": false, "error": {"code": int, "message": str}}` (our mock style)
    - or any response with `success` false and best-effort fields.
    """
    if resp.get("success", True) is True:
        return

    code: Optional[int] = None
    message: str = "SoftOne error"

    err = resp.get("error")
    if isinstance(err, dict):
        if isinstance(err.get("code"), int):
            code = err["code"]
        if isinstance(err.get("message"), str):
            message = err["message"]

    if code is None:
        # fallback: unknown error
        raise SoftOneError(-9, message, {"response": resp})

    details = {"response": resp}

    if code in INVALID_CREDENTIALS_CODES:
        raise InvalidCredentials(code, message, details)
    if code in SESSION_EXPIRED_CODES:
        raise SessionExpired(code, message, details)
    if code in NOT_AUTHENTICATED_CODES:
        raise NotAuthenticated(code, message, details)
    if code in (-12,):
        raise InvalidServiceCall(code, message, details)
    if code in (-9,):
        raise InvalidRequest(code, message, details)

    raise SoftOneError(code, message, details)
