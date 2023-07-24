import logging
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, status
from fastapi.responses import PlainTextResponse

from clients.slashid import (
    OrganizationsApi,
    PersonHandle,
    PersonHandleType,
    SuborganizationCreateRequest,
)

from .. import slashid
from ..slashid import ADMIN_EMAILS
from ..utils import (
    PageID,
    PagePath,
    Permission,
    UserID,
    get_page_id,
    get_page_path,
    get_user_id,
    require_page_id,
    require_permissions,
    require_user_id,
    set_user_permissions,
    trace,
)
from .pages_db import Page, pages


logger = logging.getLogger(__name__)


pages_router = APIRouter(prefix="/pages", tags=["pages"])


@pages_router.get("/{page_path:path}", response_class=PlainTextResponse)
@trace
async def get_page(
    person_id: Annotated[UserID, Depends(get_user_id)],
    page_id: Annotated[PageID, Depends(require_page_id)],
) -> str:
    """
    Retrieves the page contents.

    The page must be public or the user needs to to read permission.
    """
    content = pages[page_id]
    if not content.public:
        await require_permissions(Permission.Read)(person_id, page_id)

    return content.contents


@pages_router.put(
    "/{page_path:path}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permissions(Permission.Write))],
)
@trace
async def put_page(
    page_id: Annotated[PageID, Depends(require_page_id)],
    body: str = Body(..., media_type="text/plain"),
) -> None:
    """
    Updates the page contents.

    Requires write permission.
    """
    pages[page_id].contents = body


@pages_router.post("/{page_path:path}", status_code=status.HTTP_204_NO_CONTENT)
@trace
async def post_page(
    person_id: Annotated[UserID, Depends(require_user_id)],
    page_path: Annotated[PagePath, Depends(get_page_path)],
    page_id: Annotated[PageID, Depends(get_page_id)],
    body: str = Body(..., media_type="text/plain"),
) -> None:
    """
    Creates a new page, having the current user as admin.

    Requires admin permission on parent path.
    """

    # Ensures the page doesn't exist
    if page_id is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Page already exists")

    # And we have permissions on the parent
    parent_page_path = PagePath(page_path[:-1])
    parent_page_id = require_page_id(await get_page_id(parent_page_path))
    parent_page_permissions = await require_permissions(Permission.Admin)(person_id, parent_page_id)

    # Create page (suborg)
    orgs_api = OrganizationsApi()
    suborg = (
        await orgs_api.organizations_suborganizations_post(
            slash_id_org_id=str(parent_page_id),
            suborganization_create_request=SuborganizationCreateRequest(
                sub_org_name="/".join([slashid.ROOT_ORG_NAME] + page_path),
                admins=[
                    PersonHandle(type=PersonHandleType(PersonHandleType.EMAIL_ADDRESS), value=admin_email)
                    for admin_email in ADMIN_EMAILS
                ],
                persons_org_id=str(parent_page_id),
                groups_org_id=str(parent_page_id),
            ),
        )
    ).result
    assert suborg is not None
    page_id = PageID(suborg.id)

    # Add current user as suborg admin
    await set_user_permissions(user_id=person_id, page_id=page_id, permissions=parent_page_permissions)

    # Store page contents
    pages[page_id] = Page(public=pages[parent_page_id].public, contents=body)


@pages_router.delete(
    "/{page_path:path}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permissions(Permission.Admin))],
)
@trace
async def delete_page(
    page_id: Annotated[PageID, Depends(require_page_id)],
) -> None:
    """
    Removes an existing page.

    Requires admin permission.

    Currently not implemented, as SlashID has no API to delete a sub-organization.
    """

    del pages[page_id]
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Suborg removal not implemented by SlashID API"
    )
