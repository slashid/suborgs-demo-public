import logging
from typing import Annotated, NewType

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import jwt

from .. import slashid
from ..trace import trace


logger = logging.getLogger(__name__)

UserID = NewType("UserID", str)

jwt_bearer_scheme = HTTPBearer(bearerFormat="JWT", auto_error=False)


@trace
def get_user_id(token: Annotated[HTTPAuthorizationCredentials | None, Depends(jwt_bearer_scheme)]) -> UserID | None:
    """Get the user ID from the request's Authorization token.

    Returns None if there is no token"""

    if token is None:
        return None

    try:
        header = jwt.get_unverified_header(token.credentials)
        decoded_token = jwt.decode(
            token.credentials,
            slashid.JWKS[header["kid"]].key,
            algorithms=[header["alg"]],
            audience=slashid.ROOT_ORG_ID,
            iss=slashid.CLIENT_CONFIG.host,
        )
        return UserID(decoded_token["sub"])
    except Exception:
        logger.warning("Could not validate credentials", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


@trace
def require_user_id(user_id: Annotated[UserID | None, Depends(get_user_id)]) -> UserID:
    """Get the user ID from the request's Authorization token.

    Fails with 401 Unauthorized if there is no token"""

    if user_id is not None:
        return user_id
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Requires user credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
