import asyncio
import logging
from typing import Annotated, List, Set

from fastapi import APIRouter, Depends, status

from clients.slashid import GroupsApi, PersonsApi
from pydantic import BaseModel

from ..utils import (
    PageID,
    Permission,
    UserID,
    require_page_id,
    require_permissions,
    set_user_permissions,
    trace,
)
from .pages_db import pages
from .users import UserInfo, get_user_by_id


logger = logging.getLogger(__name__)

admin_router = APIRouter(prefix="/admin", tags=["admin"])


class UserPermissions(BaseModel):
    user: UserInfo
    permissions: Set[Permission]


class PageSettings(BaseModel):
    id: PageID
    public: bool
    users: List[UserPermissions]


class UserPermissionsPatch(BaseModel):
    id: UserID
    permissions: Set[Permission] | None


class PageSettingsPatch(BaseModel):
    public: bool | None = None
    users: List[UserPermissionsPatch] | None = None


@admin_router.get("/{page_path:path}", dependencies=[Depends(require_permissions(Permission.Admin))])
@trace
async def get_page_settings(
    page_id: Annotated[PageID, Depends(require_page_id)],
) -> PageSettings:
    """
    Returns whenever a page is public, and the users that have permissions to read/write/admin it
    """
    persons_api = PersonsApi()
    persons = (await persons_api.persons_get(slash_id_org_id=page_id)).result

    @trace
    async def get_user_permissions(user_id: UserID) -> UserPermissions | None:
        groups_api = GroupsApi()
        person_groups = (
            await groups_api.persons_person_id_groups_get(person_id=user_id, slash_id_org_id=page_id)
        ).result

        # Skips users that have no permissions
        if not person_groups:
            return None

        return UserPermissions(
            user=await get_user_by_id(user_id),
            permissions=set(Permission(group) for group in person_groups),
        )

    return PageSettings(
        id=page_id,
        public=pages[page_id].public,
        users=[
            user_permissions
            for user_permissions in await asyncio.gather(
                *[get_user_permissions(person.person_id) for person in persons]
            )
            if user_permissions
        ],
    )


@admin_router.patch(
    "/{page_path:path}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permissions(Permission.Admin))],
)
@trace
async def patch_page_settings(
    page_id: Annotated[PageID, Depends(require_page_id)],
    updates: PageSettingsPatch,
) -> None:
    """
    Allows modifying whenever a page is public, and which users have permissions to read/write/admin it.

    Only specified users are modified. To remove a user, set the permissions to `[]`:

    ```
    PageSettingsPatch(
        users=[
            UserPermissionsPatch(
                id=REMOVED_USER_ID,
                permissions=[]
            )
        ]
    )`
    """
    if updates.public is not None:
        pages[page_id].public = updates.public

    if updates.users is not None:
        await asyncio.gather(
            *[
                set_user_permissions(user_id=user.id, page_id=page_id, permissions=user.permissions)
                for user in updates.users
                if user.permissions is not None
            ]
        )
