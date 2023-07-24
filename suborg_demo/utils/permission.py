import functools
import logging
from enum import Enum
from typing import Annotated, Awaitable, Callable, Set

from fastapi import Depends, HTTPException, status

from clients.slashid import GroupsApi, PersonCreateReq, PersonsApi

from ..slashid import ROOT_ORG_ID
from ..trace import trace
from .auth import UserID, get_user_id, require_user_id
from .page import PageID, get_page_id, require_page_id


logger = logging.getLogger(__name__)


class Permission(Enum):
    Read = "read"
    Write = "write"
    Admin = "admin"


Permission.Read.__doc__ = "Allowed to read page contents"
Permission.Write.__doc__ = "Allowed to update page contents"
Permission.Admin.__doc__ = "Allowed to manage user permission and create subpages"

print(f"Read: {Permission.Read.__doc__}")


@trace
async def get_permissions(
    user_id: Annotated[UserID | None, Depends(get_user_id)],
    page_id: Annotated[PageID | None, Depends(get_page_id)],
) -> Set[Permission]:
    if user_id is None or page_id is None:
        return set()

    groups_api = GroupsApi()
    groups = (await groups_api.persons_person_id_groups_get(person_id=user_id, slash_id_org_id=str(page_id))).result
    return {Permission(group) for group in groups}


@functools.cache
def require_permissions(*permissions: Permission) -> Callable[[UserID, PageID], Awaitable[Set[Permission]]]:
    @trace
    async def wrapped(
        user_id: Annotated[UserID | None, Depends(require_user_id)],
        page_id: Annotated[PageID | None, Depends(require_page_id)],
    ) -> Set[Permission]:
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Requires user credentials")
        if page_id is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Page not found")

        actual_permissions = await get_permissions(user_id=user_id, page_id=page_id)
        for permission in permissions:
            if permission not in actual_permissions:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Missing permissions. Requires: {set(permissions)}. Has: {actual_permissions}",
                )
        return actual_permissions

    return wrapped


@trace
async def set_user_permissions(user_id: UserID, page_id: PageID, permissions: Set[Permission]) -> None:
    persons_api = PersonsApi()
    if page_id != ROOT_ORG_ID and permissions == set():
        # If we are removing all permissions we can just delete the person from the org
        # (Unless it is the root org)
        logger.info(f"Removing user {user_id} from page {page_id}")
        await persons_api.persons_person_id_delete(person_id=user_id, slash_id_org_id=page_id)
    else:
        logger.info(f"Setting permissions of user {user_id} on page {page_id} to {permissions}")
        handles = (
            await persons_api.persons_person_id_handles_get(person_id=user_id, slash_id_org_id=ROOT_ORG_ID)
        ).result
        assert handles is not None

        person = (
            await persons_api.persons_put(
                slash_id_org_id=page_id,
                person_create_req=PersonCreateReq(
                    handles=handles,
                    groups=[permission.value for permission in permissions],
                    active=None,
                    roles=None,
                    attributes=None,
                    region=None,
                ),
            )
        ).result
        assert person.person_id == user_id
