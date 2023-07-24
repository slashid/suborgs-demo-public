import asyncio
import logging
from typing import Annotated, List, Mapping, Set

from fastapi import APIRouter, Depends, HTTPException, status

from clients.slashid import (
    AttributesApi,
    GroupsApi,
    PersonHandle,
    PersonHandleType,
    PersonsApi,
)
from clients.slashid.exceptions import ApiException
from pydantic import BaseModel

from .. import slashid
from ..slashid import ROOT_ORG_ID
from ..utils import Permission, UserID, require_user_id, trace


logger = logging.getLogger(__name__)

users_router = APIRouter(prefix="/users", tags=["users"])


class UserInfo(BaseModel):
    id: UserID
    name: str | None
    emails: List[str]
    phones: List[str]


class MeInfo(BaseModel):
    user: UserInfo
    pages: Mapping[str, Set[Permission]]


class UserInfoPatch(BaseModel):
    name: str | None = None


class MeInfoPatch(BaseModel):
    user: UserInfoPatch | None = None


USER_NAME_ATTR_BUCKET = "person_pool-end_user_read_write"
USER_NAME_ATTR_NAME = "name"


@users_router.get("/me")
@trace
async def get_user_me(
    user_id: Annotated[UserID, Depends(require_user_id)],
) -> MeInfo:
    """
    Retrieves information about the current user: ID, name, handles and pages it has access to
    """

    async def get_pages_permissions() -> Mapping[str, Set[Permission]]:
        persons_api = PersonsApi()
        person_orgs = (
            await persons_api.persons_person_id_organizations_get(person_id=user_id, slash_id_org_id=ROOT_ORG_ID)
        ).result
        person_orgs.sort(key=lambda org: org.org_name)

        groups_api = GroupsApi()
        person_orgs_groups = await asyncio.gather(
            *[
                groups_api.persons_person_id_groups_get(person_id=user_id, slash_id_org_id=org.id)
                for org in person_orgs
            ]
        )

        return {
            org.org_name[len(slashid.ROOT_ORG_NAME) :] + "/": set(Permission(group) for group in groups.result)
            for org, groups in zip(person_orgs, person_orgs_groups)
            if groups.result
        }

    user_info, pages_permissions = await asyncio.gather(get_user_by_id(user_id), get_pages_permissions())

    return MeInfo(
        user=user_info,
        pages=pages_permissions,
    )


@users_router.patch("/me", status_code=status.HTTP_204_NO_CONTENT)
@trace
async def patch_user_me(
    user_id: Annotated[UserID, Depends(require_user_id)],
    updates: MeInfoPatch,
) -> None:
    """
    Updates information about the current user. Currently only the name is updatable
    """
    if updates.user is not None:
        if updates.user.name is not None:
            attr_api = AttributesApi()
            await attr_api.persons_person_id_attributes_bucket_name_put(
                person_id=user_id,
                slash_id_org_id=ROOT_ORG_ID,
                bucket_name=USER_NAME_ATTR_BUCKET,
                body={USER_NAME_ATTR_NAME: updates.user.name},
            )


@users_router.get("/email/{email}")
@trace
async def get_user_by_email(email: str) -> UserInfo:
    """
    Retrieves a users from its the email handle
    """
    return await _get_user_by_handle(f"email_address:{email}")


@users_router.get("/phone/{phone}")
@trace
async def get_user_by_phone(phone: str) -> UserInfo:
    """
    Retrieves a users from its the phone number handle
    """
    return await _get_user_by_handle(f"phone_number:{phone}")


async def _get_user_by_handle(handle: str) -> UserInfo:
    try:
        persons_api = PersonsApi()
        persons = (await persons_api.persons_get(slash_id_org_id=ROOT_ORG_ID, handle=handle)).result
        return await get_user_by_id(persons[0].person_id)
    except ApiException as e:
        if e.status == status.HTTP_404_NOT_FOUND:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No user with handle {handle} found",
            )
        raise e


@users_router.get("/id/{user_id}")
@trace
async def get_user_by_id(
    user_id: UserID,
) -> UserInfo:
    """
    Retrieves information about the specified user
    """

    async def get_name() -> str | None:
        attr_api = AttributesApi()
        person_attrs = await attr_api.persons_person_id_attributes_bucket_name_get(
            person_id=str(user_id),
            slash_id_org_id=ROOT_ORG_ID,
            bucket_name=USER_NAME_ATTR_BUCKET,
        )
        assert person_attrs.result is not None
        return person_attrs.result.get(USER_NAME_ATTR_NAME)

    async def get_handles() -> List[PersonHandle]:
        persons_api = PersonsApi()
        person_handles = (
            await persons_api.persons_person_id_handles_get(person_id=user_id, slash_id_org_id=ROOT_ORG_ID)
        ).result
        assert person_handles is not None
        return list(person_handles)

    try:
        name, person_handles = await asyncio.gather(get_name(), get_handles())
        return UserInfo(
            id=user_id,
            name=name,
            emails=[handle.value for handle in person_handles if handle.type == PersonHandleType.EMAIL_ADDRESS],
            phones=[handle.value for handle in person_handles if handle.type == PersonHandleType.PHONE_NUMBER],
        )
    except ApiException as e:
        if e.status in [status.HTTP_404_NOT_FOUND, status.HTTP_400_BAD_REQUEST]:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No user with id {user_id} found",
            )
        raise e
