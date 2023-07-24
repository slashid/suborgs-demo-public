import logging
from collections import defaultdict

from pydantic import BaseModel

from ..utils import PageID


logger = logging.getLogger(__name__)


class Page(BaseModel):
    public: bool
    contents: str


pages = defaultdict[PageID, Page](lambda: Page(public=False, contents="#eee"))
