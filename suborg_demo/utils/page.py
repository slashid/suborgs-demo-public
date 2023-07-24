import logging
from typing import Annotated, List, NewType

from fastapi import Depends, HTTPException, status

from .. import slashid
from ..slashid import get_org_id
from ..trace import trace


logger = logging.getLogger(__name__)
logger.info("Log setup complete :)")

PagePath = NewType("PagePath", List[str])
PageID = NewType("PageID", str)  # SlashID's OrganizationID


@trace
def get_page_path(page_path: str) -> PagePath:
    """Returns the page path elements, ignoring extra slashes"""
    return PagePath([x for x in page_path.split("/") if x])


@trace
async def get_page_id(page_path: Annotated[PagePath, Depends(get_page_path)]) -> PageID | None:
    """Returns the PageID (SlashID OrgID) from the path.

    Returns None if the page (organization) doesn't exist"""

    org_name = "/".join([slashid.ROOT_ORG_NAME] + page_path)
    org_id = await get_org_id(org_name)
    if org_id is None:
        return None
    return PageID(org_id)


@trace
def require_page_id(page_id: Annotated[PageID, Depends(get_page_id)]) -> PageID:
    """Returns the PageID (SlashID OrgID)

    Fails with 404 Not Found if the page (organization) doesn't exist"""
    if page_id is not None:
        return page_id
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Page not found",
    )
