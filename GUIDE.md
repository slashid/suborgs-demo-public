# Guide: Multitenancy application with SlashID

## Introduction

This guide will show you how to implement a very simple content management system based on SlashID’s primitives. You will be able to view/edit pages, and each user will be assigned a different set of permissions on each page.

Before going into implementation details, here is a quick recap of some of the SlashID’s features that you will build on, and how you will map them into your product. You can read more about them on the [Suborganizations Guide](https://developer.slashid.dev/docs/guides/suborgs).

### Suborganizations

SlashID allows organizing your users in hierarchical categories, called “Suborganizations”: It is a flexible abstraction that can be mapped to your domain in a number of ways. A few simple examples:

- Teams: My Organization -> Software Engineering -> Backend
- Projects: My Organization -> Software Products -> Website
- Physical Locations: My Organization -> Country -> City -> Address -> Room

In this demo you will use a SlashID suborganization to represent each page in the content management system. SlashID suborganization names and their hierarchy are built around the path of each page:

| URL                         | SlashID Organization Hierarchy      |
| --------------------------- | ----------------------------------- |
| http://example.com/         | MyOrg                               |
| http://example.com/foo/     | MyOrg -> MyOrg/foo                  |
| http://example.com/foo/bar/ | MyOrg -> MyOrg/foo -> MyOrg/foo/bar |

### Person Pools

Depending on your application, you may decide to share the user databases between suborganizations (share the same person pool) or to keep them isolated.

When suborganizations share the same person pool, a user can sign in any of them using the same credentials, always get same personID and shares some of its information (e.g., [organization-scoped attributes in Vault](https://developer.slashid.dev/docs/concepts/attribute_buckets#sharing-scope))

In this example your users sign in just once and use the same credential to access all pages in the CMS, therefore all pages (suborganizations) will share the same Person Pool. For simplicity, users will always sign in the root organization.

### Groups

SlashID allows you to assign groups to each person in each organization. As usual, the semantics of groups can be anything that makes sense to your domain.

For this example, you will use groups to identify the permissions a user has on each page:

| Group | Description                                                               |
| ----- | ------------------------------------------------------------------------- |
| read  | Can access the contents of a page                                         |
| write | Can update the contents of a page                                         |
| admin | Can change which users have access to a page, and can create nested pages |

Since in this example all pages have the same set of groups available, you will use the same group pool on all pages (suborganizations).

Keep in mind that despite having the same group pool, group membership is defined per-organization, i.e., Someone can be a member of the “admin” group in the page `/foo/` but not in `/bar/`.

### OpenAPI

[OpenAPI](https://www.openapis.org/) is a widely adopted standard to define and document HTTP APIs, and can be used to automatically create client and server stubs that can be easily used from various programming languages.

It is used on [SlashID’s APIs](https://developer.slashid.dev/docs/category/api), and will be used in this example to make calls to the backend.

# Implementation

## Backend

The backend is implemented in Python and uses FastAPI to expose an API to access/edit/manage pages.

> NOTE: This section includes snippets for some of the most important parts of the demo code, however some of those have been slightly modified for readability.

### SlashID API

The backend uses [SlashID’s APIs](https://developer.slashid.dev/docs/category/api) to manage the underlying users and suborganizations.

While SlashID allows a few API calls to be performed directly by clients and authenticated with UserTokens, in this example almost everything will be intermediated by the backend. (except the user authentication, which is implemented on the client with by the SlashID React SDK)

While it is not difficult to call SlashID’s APIs directly with a plain HTTP client, it is preferable to generate a client from the OpenAPI Spec, making it much easier to use it from your programming language of choice.

#### Generating client library from OpenAPI Specs

The first step is to get the SlashID OpenAPI spec. The latest version of the spec is available at this [link](https://cdn.sandbox.slashid.com/slashid-openapi-latest.yaml).

In this demo you use openapi-generator-cli to produce the client library. It supports several programming languages and is quite configurable, but there are many alternatives to it.

You can use this command to generate the client code in `clients.slashid`

```shell
docker run \
    --user "$(id -u):$(id -g)" \
    --pull=missing \
    --rm \
    -v {{.PROJECT_ROOT}}:/local \
    openapitools/openapi-generator-cli:latest \
    generate \
    -i /local/openapi-slashid.yaml \
    -o /local/ \
    -g python \
    --additional-properties generateSourceCodeOnly=true \
    --additional-properties packageName=clients.slashid \
    --library=asyncio
```

#### Setting up

Before using your new client library you'll need to import some basic info about your root organization (which you can get from the [SlashID Console](https://console.slashid.dev/)):

```python
ROOT_ORG_ID = "00000000-0000-0000-0000-000000000000"
ROOT_API_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAA="
ROOT_ORG_NAME = "<placeholder>"  # You'll populate it during initialization
ADMIN_EMAILS = ["me@example.com"]  # Identifiers of your admin users
API_ENDPOINT="https://api.slashid.com"  # Or https://api.sandbox.slashid.com
```

Now you can use it to setup your client library:

```python
from clients.slashid import Configuration, ApiClient

ApiClient.set_default(ApiClient(Configuration(
    host=API_ENDPOINT,
    api_key={"ApiKeyAuth": ROOT_API_KEY},  # This API key also works with the suborgs
)))
```

#### Application Startup

During application startup you need to:

- Retrieve the name of the main organization (In this demo it will be used as a prefix to name all suborganizations),
- Retrieve JWKs, the keys used to validate user tokens.

Additionally, you need to perform one-time setup of root SlashID organization: (In this demo you will do it on every startup for convenience)

- Create the groups (`read`/`write`/`admin`)
- Add your first users (the admins) and give them `read`/`write`/`admin` permissions on main page of the CMS (the root organization)

```python
import jwt
from clients.slashid import ApiClient, GroupsApi, OidcDiscoveryApi, PersonsApi

# Get name of root org -- suborganizations will be named "{ROOT_ORG_NAME}/path/to/page"
ROOT_ORG_NAME = await get_org_name(ROOT_ORG_ID)
logger.info(f"Root organization name is {ROOT_ORG_NAME}")

# Get JWKs -- Used to authenticate user tokens
oidc_discovery_api = OidcDiscoveryApi()
JWKS = await jwt.PyJWKSet.from_dict(oidc_discovery_api.well_known_jwks_json_get())
logger.info("Loaded JWKs")

# Ensure groups exist
groups_api = GroupsApi()
for name, description in [
    ("read", "Allowed to read page contents"),
    ("write", "Allowed to update page contents"),
    ("admin", "Allowed to manage user permission and create subpages"),
]:
    await groups_api.groups_post(
        slash_id_org_id=ROOT_ORG_ID, post_group_req=PostGroupReq(name=name, description=description)
    )
    logger.info(f"Create group {name}")

# Ensure admin users exist and have all permissions on main page
persons_api = PersonsApi()
for admin_email in ADMIN_EMAILS:
    await persons_api.persons_put(
        slash_id_org_id=ROOT_ORG_ID,
        person_create_req=PersonCreateReq(
            handles=[PersonHandle(type=PersonHandleType(PersonHandleType.EMAIL_ADDRESS), value=admin_email)],
            groups=["admin", "read", "write"],
            active=True,
            attributes=None,
        ),
    )
    logger.info(f"Create user {admin_email}")
```

### Building Blocks

In the next section you'll implement your request handlers, but first here are some of the important building blocks you'll use in your application:

#### Authentication

The backend uses SlashID JWT Tokens to identify the user making a request. Clients should send the user tokens using the `Authorization` header and the `Bearer` schema.

SlashID tokens contain [a lot of information](https://developer.slashid.dev/docs/concepts/token_containers), but for your purposes you only need to care about two things:

- The token is valid (not expired, issued to the correct organization ID, signed with SlashID's keys, etc)
- The person ID

There are a number of tools to parse and validate JWT tokens in all programming languages. It is also possible to use SlashID's [token validation API](https://developer.slashid.dev/docs/api/access/validate-a-user-token). In this demo you use the [pyjwt](https://pyjwt.readthedocs.io/en/stable/) library

Finally, note that you use [FastAPI's Dependency Injection system](https://fastapi.tiangolo.com/tutorial/dependencies/) to extract the token from the HTTP request.

```python
UserID = NewType("UserID", str)

jwt_bearer_scheme = HTTPBearer(bearerFormat="JWT", auto_error=False)

def get_user_id(token: Annotated[HTTPAuthorizationCredentials | None, Depends(jwt_bearer_scheme)]) -> UserID | None:
    """Get the user ID from the request's Authorization token.

    Returns None if there is no token"""

    if token is None:
        return None

    try:
        header = jwt.get_unverified_header(token.credentials)
        decoded_token = jwt.decode(
            token.credentials,
            JWKS[header["kid"]].key,
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
```

You should also add a wrapper function that triggers a `401 Unauthorized` error if no token was provided:

```python
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
```

#### Mapping pages to SlashID (Sub-)Organizations

Users of your CMS will identify pages by their path (`/path/to/page`), but you need to map these to the underlying Organization ID.

The first step is parsing the path and turn it into a list of path elements:

Again, note that `page_path` will usually be automatically be injected by FastAPI.

```python
PagePath = NewType("PagePath", List[str])

def get_page_path(page_path: str) -> PagePath:
    """Returns the page path elements, ignoring extra slashes"""
    return PagePath([x for x in page_path.split("/") if x])
```

Now you can translate the path elements into an organization name and use SlashID APIs to translate it into and organization ID.

```python
async def get_page_id(page_path: Annotated[PagePath, Depends(get_page_path)]) -> PageID | None:
    """Returns the PageID (SlashID OrgID) from the path.

    Returns None if the page (organization) doesn't exist"""

    org_name = "/".join([slashid.ROOT_ORG_NAME] + page_path)
    org_id = await get_org_id(org_name)
    if org_id is None:
        return None
    return PageID(org_id)
```

> **TODO**: SlashID APIs currently doesn't provide an efficient way of implementing `get_org_id` and `get_org_name`. We'll fix it briefly and update this demo.

As before, you add a wrapper function that triggers a `404 Not Found` error if the page (organization) doesn't exist:

```python
def require_page_id(page_id: Annotated[PageID, Depends(get_page_id)]) -> PageID:
    """Returns the PageID (SlashID OrgID)

    Fails with 404 Not Found if the page (organization) doesn't exist"""
    if page_id is not None:
        return page_id
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Page not found",
    )
```

#### Verifying permissions

To retrieve the permissions a user has on a page in your CMS you just need to retrieve what groups it belongs to in the underlying organization:

Note that `user_id` and `page_id` will usually be automatically provided by [FastAPI's Dependency Injection system](https://fastapi.tiangolo.com/tutorial/dependencies/).

```python
class Permission(Enum):
    Read = "read"
    Write = "write"
    Admin = "admin"


async def get_permissions(
    user_id: Annotated[UserID | None, Depends(get_user_id)],
    page_id: Annotated[PageID | None, Depends(get_page_id)],
) -> Set[Permission]:
    if user_id is None or page_id is None:
        return set()

    groups_api = GroupsApi()
    groups = (await groups_api.persons_person_id_groups_get(person_id=user_id, slash_id_org_id=str(page_id))).result
    return {Permission(group) for group in groups}
```

You will also add variant of this method that triggers a `403 Forbidden` error if the required permissions are missing. The awkward function-that-returns-function syntax allows it to be used as a [Parameterized dependency in FastAPI](https://fastapi.tiangolo.com/advanced/advanced-dependencies/#parameterized-dependencies).

```python
def require_permissions(*permissions: Permission) -> Callable[[UserID, PageID], Awaitable[Set[Permission]]]:
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
```

#### Updating permissions

While you are at it, you will also need a function to set the permissions.

On this demo, all users are members of the root organization (root page). This is necessary for login, as authentication always uses ROOT_ORG_ID.

(New users are added automatically to the root organization when they first sign in, but won't have permissions on any pages until an admin grants it.)

For all other suborganizations (sub pages), users are only added as members if they have permissions on that page. When setting permissions to `[]` you actually remove the user from that suborg instead.

And, since the user may not yet be a member of the suborganization, you use [`PUT /persons`](https://developer.slashid.dev/docs/api/core/create-or-update-a-person-idempotent) to insert the user (if needed) and set the groups in a single API call. This endpoints requires the user handles to identify the person.

```python
async def set_user_permissions(user_id: UserID, page_id: PageID, permissions: Set[Permission]) -> None:
    persons_api = PersonsApi()
    if page_id != ROOT_ORG_ID and permissions == set():
        # If you are removing all permissions you can just delete the person from the org
        # (Unless it is the root org)
        logger.info(f"Removing user {user_id} from page {page_id}")
        await persons_api.persons_person_id_delete(person_id=user_id, slash_id_org_id=page_id)
    else:
        logger.info(f"Setting permissions of user {user_id} on page {page_id} to {permissions}")
        handles = (
            await persons_api.persons_person_id_handles_get(person_id=user_id, slash_id_org_id=ROOT_ORG_ID)
        ).result
        assert handles is not None

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
```

### Endpoints

#### Users

Your user structure will be quite simple. It contains a name, a list of email handles and a list of phone handles.

```python
class UserInfo(BaseModel):
    id: UserID
    name: str | None
    emails: List[str]
    phones: List[str]
```

The emails and phone numbers are SlashID handles, while the name is stored as a [DataVault attribute](https://developer.slashid.dev/docs/concepts/attribute_buckets).

As mentioned before, when looking up users you always use the root organization ID, as this is the only organization guaranteed to contain all users.

##### Retrieving user information from an ID

As mentioned before, you need to make 2 calls to fetch the handles and the name.

```python

users_router = APIRouter(prefix="/users", tags=["users"])

# This is the bucket/attribute where you store the user names
USER_NAME_ATTR_BUCKET = "person_pool-end_user_read_write"
USER_NAME_ATTR_NAME = "name"

@users_router.get("/id/{user_id}")
async def get_user_by_id(
    user_id: UserID,
) -> UserInfo:
    """
    Retrieves information about the specified user
    """
    try:
        attr_api = AttributesApi()
        person_attrs = await attr_api.persons_person_id_attributes_bucket_name_get(
            person_id=str(user_id),
            slash_id_org_id=ROOT_ORG_ID,
            bucket_name=USER_NAME_ATTR_BUCKET,
        )
        assert person_attrs.result is not None
        name = person_attrs.result.get(USER_NAME_ATTR_NAME)

        persons_api = PersonsApi()
        person_handles = (
            await persons_api.persons_person_id_handles_get(person_id=user_id, slash_id_org_id=ROOT_ORG_ID)
        ).result
        assert person_handles is not None

        return UserInfo(
            id=user_id,
            name=name,
            emails=[handle.value for handle in person_handles if handle.type == PersonHandleType.EMAIL_ADDRESS],
            phones=[handle.value for handle in person_handles if handle.type == PersonHandleType.PHONE_NUMBER],
        )
    except ApiException as e:
        # If the userID was not found or was malformed
        if e.status in [status.HTTP_404_NOT_FOUND, status.HTTP_400_BAD_REQUEST]:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No user with id {user_id} found",
            )
        raise e
```

##### Retrieving user information from an email

You will also allow looking up users by their e-mails. This allows users to be looked up from the Admin area in the frontend (In order to grant them permissions on new pages)

```python
@users_router.get("/email/{email}")
async def get_user_by_email(email: str) -> UserInfo:
    """
    Retrieves a users from its the email handle
    """
    try:
        persons_api = PersonsApi()
        persons = (await persons_api.persons_get(slash_id_org_id=ROOT_ORG_ID, handle=f"email_address:{email}")).result
        return await get_user_by_id(persons[0].person_id)
    except ApiException as e:
        if e.status == status.HTTP_404_NOT_FOUND:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No user with handle {handle} found",
            )
        raise e
```

This demo also implements `get_by_phone` which is essentially the same.

##### Retrieving current user information

When retrieving information about `me`, you also want to return a bit of extra data: The list of pages the current user has access to, and what permissions he has on each.

To do that you will use [`GET /persons/{person_id}/organizations`](https://developer.slashid.dev/docs/api/core/retrieve-the-list-of-organizations-a-person-belongs-to) to retrieve the list of suborgs (pages) the user belongs to and then use [`GET persons/{person_id}/groups`](https://developer.slashid.dev/docs/api/access/get-groups-for-a-person) to get the list of groups (permissions) the person has on each page (suborganization):

Because retrieving the permissions for each page requires a number of distinct calls, those are executed concurrently using [`asyncio.gather`](https://docs.python.org/3/library/asyncio-task.html#asyncio.gather);

```python

class MeInfo(BaseModel):
    user: UserInfo
    pages: Mapping[str, Set[Permission]]

@users_router.get("/me")
async def get_user_me(
    user_id: Annotated[UserID, Depends(require_user_id)],
) -> MeInfo:
    """
    Retrieves information about the current user: ID, name, handles and pages it has access to
    """

    # Retrieve list of pages (orgs) the user belongs to
    persons_api = PersonsApi()
    person_orgs = (
        await persons_api.persons_person_id_organizations_get(person_id=user_id, slash_id_org_id=ROOT_ORG_ID)
    ).result
    person_orgs.sort(key=lambda org: org.org_name)  # Sort by page name

    # For each page (org) retrieves the permissions (groups) the user has
    groups_api = GroupsApi()
    person_orgs_groups = await asyncio.gather(
        *[
            groups_api.persons_person_id_groups_get(person_id=user_id, slash_id_org_id=org.id)
            for org in person_orgs
        ]
    )

    # Build a map Page Name -> Permissions
    # Page name is just the org name without the prefix for the root organization name.
    # Skips pages where there are no permissions
    pages_permissions = {
        org.org_name[len(slashid.ROOT_ORG_NAME) :] + "/": set(Permission(group) for group in groups.result)
        for org, groups in zip(person_orgs, person_orgs_groups)
        if groups.result
    }

    return MeInfo(
        user=await get_user_by_id(user_id),
        pages=pages_permissions,
    )
```

##### Updating current user information

The only information you will allow updating in this demo is the name. As mentioned before, it is stored as a Vault attribute.

For consistency, the `PATCH` request structure is similar to the `GET` response:

```python
class UserInfoPatch(BaseModel):
    name: str | None = None


class MeInfoPatch(BaseModel):
    user: UserInfoPatch | None = None

@users_router.patch("/me", status_code=status.HTTP_204_NO_CONTENT)
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
```

#### Pages

Each page in your CMS will be very simple, and contain only 2 attributes:

- `public`: If true anyone can see the page contents, without needing explicit user permissions.
- `content`: Some content for the page - for illustrutive purposes this is a hex colour code and will be set as the background colour of the page.

For simplicity, in this demo the pages database is stored in memory. After a restart, every page is implicitly reset to non-public, with default contents:

```python
class Page(BaseModel):
    public: bool
    contents: str


pages = defaultdict[PageID, Page](lambda: Page(public=False, contents="default content"))
```

##### Retrieving page contents

Retrieving the contents of a page is trivial using the building blocks introduced previously, even if you account for the fact that some pages may require `read` permissions:

```python
pages_router = APIRouter(prefix="/pages", tags=["pages"])

@pages_router.get("/{page_path:path}", response_class=PlainTextResponse)
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
```

##### Modifying page contents

Modifying the contents is very similar, but even simpler given that you _always_ need to verify `write` permissions:

```python
@pages_router.put(
    "/{page_path:path}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permissions(Permission.Write))],
)
async def put_page(
    page_id: Annotated[PageID, Depends(require_page_id)],
    body: str = Body(..., media_type="text/plain"),
) -> None:
    """
    Updates the page contents.

    Requires write permission.
    """
    pages[page_id].contents = body
```

##### Deleting a page

Unfortunately it is impossible to support it as this time, as SlashID doesn't yet expose an endpoint to delete a suborg.

This will be added this soon, but in the meantime you should return HTTP code 501 (Not implemented).

```python
@pages_router.delete(
   "/{page_path:path}",
   status_code=status.HTTP_204_NO_CONTENT,
   dependencies=[Depends(require_permissions(Permission.Admin))],
)
async def delete_page(
   page_id: Annotated[PageID, Depends(require_page_id)],
) -> None:
   """
   Removes an existing page.

   Requires admin permission.

   Currently not implemented, as SlashID has no API to delete a sub-organization.
   """
   raise HTTPException(
       status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Suborg removal not implemented by SlashID API"
   )
```

##### Creating a new page

Finally, an endpoint that is a bit more interesting.

In this case, you first need to perform a few checks:

- Page must not yet exist
- Parent page must exist
- User must have `admin` permission on the parent page

Finally, creating a new page means creating a SlashID organization. In this demo:

- Org name must be `{ROOT_ORG_NAME}/path/to/page`
- PersonPool and GroupPool must be shared, therefore you will use the ID of the parent organization in `persons_org_id` and `groups_org_id`
- ADMIN_EMAILS are added as suborg admins. This means they will be able to see it in the [SlashID Console](https://console.slashid.dev/)
- Current user must be added to the new page with the same permissions it has on the parent page.

```python
@pages_router.post("/{page_path:path}", status_code=status.HTTP_204_NO_CONTENT)
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

    # And the currenct user had admin permissions on the parent
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
```

#### Pages Administration

The `admin` endpoints complement the pages endpoints with capability to:

- Get/Modify the `public` flag
- Get/Modify the permissions assigned to users.

Of course, these endpoints require a `admin` permission on the specific page.

##### Retrieving administrative metadata

Your endpoint to retrieve admin metadata should return:

- The page ID (organization ID)
- The `public` flag
- The list of users that have access to this page and their permissions.

Because you need multiple requests to fetch information about each user, those are performed concurrently using [`asyncio.gather`](https://docs.python.org/3/library/asyncio-task.html#asyncio.gather).

````python

admin_router = APIRouter(prefix="/admin", tags=["admin"])

class UserPermissions(BaseModel):
    user: UserInfo
    permissions: Set[Permission]

class PageSettings(BaseModel):
    id: PageID
    public: bool
    users: List[UserPermissions]```

@admin_router.get("/{page_path:path}", dependencies=[Depends(require_permissions(Permission.Admin))])
async def get_page_settings(
    page_id: Annotated[PageID, Depends(require_page_id)],
) -> PageSettings:
    """
    Returns whenever a page is public, and the users that have permissions to read/write/admin it
    """
    persons_api = PersonsApi()
    persons = (await persons_api.persons_get(slash_id_org_id=page_id)).result

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
            if user_permissions  # Skips users that have no permissions
        ],
    )
````

##### Updating administrative metadata

Similar to the above, you need to be able to:

- Modify the `public` flag
- Add/Remove/Modify user permissions

For simplicity, this only updates the permissions of the specified users, and setting an user's permissions to `[]` effective removes it.

As before, you will use [`asyncio.gather`](https://docs.python.org/3/library/asyncio-task.html#asyncio.gather) to execute all users permission updates concurrently.

```python
class UserPermissionsPatch(BaseModel):
    id: UserID
    permissions: Set[Permission] | None


class PageSettingsPatch(BaseModel):
    public: bool | None = None
    users: List[UserPermissionsPatch] | None = None


@admin_router.patch(
    "/{page_path:path}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permissions(Permission.Admin))],
)
async def patch_page_settings(
    page_id: Annotated[PageID, Depends(require_page_id)],
    updates: PageSettingsPatch,
) -> None:
    """
    Allows modifying whenever a page is public, and which users have permissions to read/write/admin it.

    Only specified users are modified. To remove a user, set the permissions to `[]`:
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
```

## Frontend

This application has a web frontend.

User sign in will be implemented using the SlashID React SDK, and everything will be implemented by calling your backend API.

### Getting started

In this guide you're going to build a web app frontend using [React-admin](https://marmelab.com/react-admin/), [Vite](https://vitejs.dev/) and [TypeScript](https://www.typescriptlang.org/). SlashID does not have any direct affiliation or integration with `react-admin`, but using it should save us some time as a lot of things come out of the box.

`react-admin` is an opinionated framework and so you'll need to implement some `react-admin` specific concepts before you get going.

#### Creating a DataProvider

In `react-admin` a `dataProvider` is responsible for fetching data.

`react-admin` [supports many backends out of the box](https://marmelab.com/react-admin/DataProviderList.html) but since your custom backend isn't one of them, you'll need to create your own [DataProvider](https://marmelab.com/react-admin/DataProviderWriting.html).

Create a file `data-provider.tsx` and a function `createDataProvider` which accepts a SlashID [User](https://developer.slashid.dev/docs/sdk/classes/User) object as an argument - more on this later.

```ts
// data-provider.tsx

import { User as SlashIDUser } from "@slashid/slashid";
import { type DataProvider } from "react-admin";

interface Props = {
  user: SlashIDUser
}

export const createDataProvider = ({
  user,
}: Props): DataProvider => {
  const dataProvider: DataProvider = {
    // ...
  };

  return dataProvider;
};
```

Lets implement a quick helper for creating the `authorization` header for your requests.

```ts
// data-provider.tsx

export const createHeaders = ({ user }: { user?: SlashIDUser }) => {
  return {
    headers: new Headers({
      authorization: `Bearer ${user?.token}`,
    }),
  };
};

export const createDataProvider = ({ user }: Props): DataProvider => {
  const { headers } = createHeaders({ user });

  // ...
};
```

Next you will implement the [DataProvider interface](https://marmelab.com/react-admin/DataProviderWriting.html#response-format) and have each method talk with your backend. In this guide you will only use `getOne`, `create` and `update` - the remainder will not be implemented.

```ts
// data-provider.tsx

const dataProvider: DataProvider = {
  getOne: (resource, { data }) => {
    const url = `${baseURL}/${resource}/${data.id}`;
    const body = JSON.stringify(data.raw);

    return fetchJson(url, { method: "POST", headers, body }).then(
      ({ json }) => ({
        data: {
          id: data.id,
          ...json,
        },
      }),
    );
  },
  create: (resource, { data }) => {
    const url = `${baseURL}/${resource}/${data.id}`;
    const body = JSON.stringify(data.raw);

    return fetchJson(url, { method: "POST", headers, body }).then(
      ({ json }) => ({
        data: {
          id: data.id,
          ...json,
        },
      }),
    );
  },
  update: (resource, { id, data, meta }) => {
    const queryString = meta?.query ? `?${stringify(meta.query)}` : "";
    const url = `${baseURL}/${resource}/${id}${queryString}`;
    const body = JSON.stringify(data.raw);
    const method = meta?.method ?? "PUT";

    return fetchJson(url, { method, body, headers }).then(({ json }) => ({
      data: {
        id: data.id,
        ...json,
      },
    }));
  },
  // ...
};
```

Your backend requires authentication and you haven't implemented it. Lets tackle that next.

#### Creating an AuthProvider

Like the `dataProvider` is responsible for fetching data, the `authProvider` is responsible for managing authentication. To authenticate API requests to your backend will will use an `authProvider` to do a basic auth check before sending requests with your `dataProvider`. This component provides the glue between your web application and SlashID.

Let's create it.

Create a file `auth-provider.tsx` and a function `createAuthProvider`. Create a variable `internalUser`, you'll use it to keep a reference to the SlashID [User](https://developer.slashid.dev/docs/sdk/classes/User) object.

```ts
// auth-provider.tsx

import { type AuthProvider } from "react-admin";

interface Props = {
  user: SlashIDUser,
  logOut: () => void
}

export const createAuthProvider = ({ logOut, user }: Props): AuthProvider => {
  let internalUser: SlashIDUser | undefined = user;

  const authProvider: AuthProvider = {
    // ...
  };

  return authProvider;
};
```

Lets implement the [AuthProvider interface](https://marmelab.com/react-admin/AuthProviderWriting.html).

```ts
// auth-provider.tsx

const authProvider: AuthProvider = {
  login: (newUser: SlashIDUser) => {
    internalUser = newUser;

    return Promise.resolve();
  },
  logout: () => {
    logOut();

    return Promise.resolve();
  },
  checkAuth: () => {
    return internalUser ? Promise.resolve() : Promise.reject();
  },
  checkError: (error: any) => {
    const status = error.status;

    if (status === 401 || status === 403) {
      localStorage.removeItem("username");
      return Promise.reject();
    }

    // other error code (404, 500, etc): no need to log out
    return Promise.resolve();
  },
  getIdentity: async () => {
    const { data } = await dataProvider.getOne<UserMeta & { id: string }>(
      "users/me",
      { id: "" },
    );

    return {
      id: data.user.id,
      fullName: data.user.name || "",
    };
  },
  getPermissions: () => Promise.resolve(""),
};
```

The most important things to understand here are:

- `login` will be called post-authentication via `@slashid/react`, you will only use it to store the user reference that is returned following successful authentication.
- `logout` will call the `logOut` function provided by `@slashid/react`
- `checkAuth` is a basic truthy check on your `internalUser` variable. If the user is logged out this will be `undefined`. This method is called by `react-admin` before any request is made to your backend.
- `checkError` recieves http errors and given a `401` or `403` will return a rejected promise, `react-admin` understands this to mean the user needs to be logged out via `authProvider.logout()`.
- `getIdentity` is what `react-admin` uses to learn identity information, primarily for personalisation. In your app the name returned here will be shown in the navigation bar as the logged in user. This method calls the `/users/me` endpoint of your backend API using your `dataProvider`.

#### Creating a login page

When `react-admin` understands the user to be logged out it will present them with a login page, lets define that.

Create a file `pages/login.tsx` and export a `Login` React component.

In this component you'll implement the `<Form />` component provided by `@slashid/react`. [\<Form />](https://developer.slashid.dev/docs/react-sdk/reference/components/react-sdk-reference-form) is an uncontrolled React form, and a full featured login page integrated with the SlashID core SDK. You can use this with no modifications necessary.

On successful authentication you need to let `react-admin` know that it's safe to continue: you can do this with the `onSuccess` callback and `useLogin` hook from `react-admin`.

The function returned from `useLogin` later calls the `login` function you implemented in your `authProvider`.

```tsx
// pages/login.tsx

import { ConfigurationProvider, Form } from "@slashid/react";
import { useLogin } from "react-admin";
import { Box, Container } from "@mui/material";

export const Login = () => {
  const login = useLogin();
  return (
    <ConfigurationProvider factors={[{ method: "email_link" }]}>
      <Container component="main" maxWidth="xs">
        <Box
          sx={{
            padding: "1rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <Form
            onSuccess={(user) => {
              login(user);
            }}
          />
        </Box>
      </Container>
    </ConfigurationProvider>
  );
};
```

#### Starting your app

Now that all the setup is done, lets get the app to render something.

Create a file `app.tsx` and a component export `<App />`, you'll create two sub-components `<WithSlashID />` and `<CMS />`.

First you need to implement the [\<SlashIDProvider />]() provider, this provides a React Context you'll use in the next step. By default `<SlashIDProvider />` talks with the SlashID sandbox environment, be sure to configure `baseApiUrl` so that it's speaking to the same SlashID environment as your backend.

`oid` is your root SlashID organisation ID, the same you used [when you were setting up the backend](#setting-up).

```tsx
// app.tsx

import { SlashIDProvider } from "@slashid/react";

const WithSlashID = ({ children }: { children: React.ReactNode }) => {
  return (
    <SlashIDProvider
      oid="00000000-0000-0000-0000-000000000000"
      tokenStorage="localStorage"
      baseApiUrl="https://api.slashid.com" // or https://api.sandbox.slashid.com
    >
      {children}
    </SlashIDProvider>
  );
};
```

Now lets create the main component for your app `<CMS />`, and implement everything you've created so far: `createAuthProvider`, `createDataProvider` and `<Login />`.

`<CMS />` uses the `useSlashID` hook to get properties from the `<SlashIDProvider />` context you implemented earlier. These properties are needed to create the `dataProvider` and `authProvider`, glueing everything together.

`sdkState` is an undocumented internal property, you'll use it here to guarantee the SDK is ready to go before rendering the app.

```tsx
// app.tsx

import { Admin as ReactAdmin } from "react-admin";
import { createAuthProvider } from "./auth-provider";
import { createDataProvider } from "./data-provider";
import { Login } from "./pages/login";

const CMS = () => {
  const { user, logOut, sdkState, sid } = useSlashID();

  const dataProvider: DataProvider = useMemo(() => {
    return createDataProvider({ user });
  }, [sid?.baseURL, sid?.oid, user]);

  const authProvider: AuthProvider = useMemo(() => {
    return createAuthProvider({ logOut, user });
  }, [logOut, user]);

  if (!["ready", "authenticating"].includes(sdkState)) {
    return (
      <Container maxWidth="xs">
        <CircularProgress />
      </Container>
    );
  }

  return (
    <ReactAdmin
      loginPage={<Login />}
      authProvider={authProvider}
      dataProvider={dataProvider}
    >
      {/* ... */}
    </ReactAdmin>
  );
};
```

Compose the two sub-components into an `<App />` component.

```tsx
// app.tsx

return const App = () => {
  <WithSlashID>
    <CMS />
  </WithSlashID>
}
```

Finally let's create a quick index page to act as a hello world, and run the app.

Create a file `pages/index.tsx` and a export an `Index` React component. The `<Authenticated />` component from `react-admin` is used to enforce login for this page.

```tsx
// pages/index.tsx

export const Index = () => {
  return (
    <Authenticated>
      <div>Hello world!</div>
    </Authenticated>
  );
};
```

In `app.tsx` create an `index` route for `ReactAdmin`.

```tsx
// app.tsx

import { Admin as ReactAdmin, CustomRoutes, Route } from "react-admin";
import { createAuthProvider } from "./auth-provider";
import { createDataProvider } from "./data-provider";
import { Login } from "./pages/login";
import { Index } from "./pages/index";

// ...

const CMS = () => {
  // ...

  return (
    <ReactAdmin
      loginPage={<Login />}
      authProvider={authProvider}
      dataProvider={dataProvider}
    >
      <CustomRoutes>
        <Route index element={<Index />} />
      </CustomRoutes>
    </ReactAdmin>;
  )
}
```

Now when you run your `react-admin` app you'll be presented with a login screen, and then an index page following successful login.

### Implementing permission checks

Your backend API has [three groups](#groups) (`read`, `write`, `admin`), you will want to use these to do conditional rendering and access control in your web application.

The `@slashid/react` SDK is not intended to be used with an intermediary backend like yours, so you will be unable to use some of the convenience components provided by `@slashid/react` - but it's not too hard to make your own. Lets do that now.

#### Conditional rendering

In this section you'll implement permission based personalisation using a custom React hook.

You're going to create a hook `useGroups`. It will use your `dataProvider` to get data from the `/users/me` endpoint and interogate the response to understand which permissions (read: groups) the user has for a given page (read: suborg) in the app.

Create a file `hooks/use-groups.ts`, it exports `useGroups`.

```ts
// hooks/use-groups.ts

export const useGroups = ({ root }: { root: string }) => {
  const { pageKey } = usePageId({ root });
  const {
    data: user,
    isLoading: isGroupsLoading,
    isError: isGroupsError,
  } = useGetOne<UserMeta & { id: string }>("users/me", { id: "" });

  const [initialised, setInitialsed] = useState(false);
  const [isViewer, setIsViewer] = useState(false);
  const [isEditor, setIsEditor] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [raw, setRaw] = useState<string[]>([]);

  const initReady = !isGroupsLoading && !isGroupsError && user && !initialised;

  if (initReady) {
    const groups = user?.pages?.[pageKey];
    if (groups) {
      setIsViewer(groups.includes("read"));
      setIsEditor(groups.includes("write"));
      setIsAdmin(groups.includes("admin"));
      setRaw(groups);
    }

    setInitialsed(true);
  }

  return {
    isGroupsLoading,
    isGroupsError,
    isViewer,
    isAdmin,
    isEditor,
    raw,
  };
};
```

The `root` argument refers to the route root of the current page path (i.e. `admin`, `page`), it's necessary to accurately parse the page path. You may have noticed in this file you will use `usePageId`; it's a convenience helper which uses `root` to get the page path from the URL. See the full code [here](https://github.com/slashid/suborg-demo/blob/main/frontend/src/hooks/use-page-id.ts).

With the `useGroups` hook you can now do simple conditional rendering in your pages.

```jsx
// example

export const Foo = () => {
  const { isEditor, isAdmin, isGroupsLoading, isGroupsError } = useGroups();

  if (isGroupsLoading) return "Loading...";
  if (isGroupsError) return "Error! :(";

  return (
    <div>
      {isEditor && <button>Edit page</button>}
      {isAdmin && <button>Create child page</button>}
    </div>
  );
};
```

#### Route permission guard

In this section you'll implement access control with a route guard.

Earlier in this guide you implemented that [certain actions are gated behind permission groups](#groups). To provide the best user experience you shouldn't allow for permission related http errors to surface in your web app, instead you should first check if the user has permission to view that page and present them with an informational message if not.

The following should be true:
| Route | Required group |
|----------------------|----------------|
| `/` (index) | `read` |
| `/page/{page_path}` | `read` |
| `/edit/{page_path}` | `write` |
| `/new/{page_path}` | `admin` |
| `/admin/{page_path}` | `admin` |

You will use the `useGroups` hook in combination with the `react-admin` `<Authenticated />` component from earlier to create a permission aware route guard component. When a permission check fails you'll present a fallback error message.

Create a file `components/groups.tsx` and export a `Groups` React component.

```tsx
// components/groups.tsx

import { Authenticated } from "react-admin";
import { useGroups } from "../hooks/use-groups";
import { Loading } from "./loading";
import { Oops } from "./oops";

interface Props = {
  root: string;
  belongsTo: ("read" | "write" | "admin")[];
  children: any;
  fallback?: any;
}

export const Groups = (props: Props) => (
  <Authenticated>
    <AssertGroups {...props} />
  </Authenticated>
);

const AssertGroups = ({
  root,
  belongsTo,
  children,
  fallback = "You do not have permission to view this page",
}: Props) => {
  const { raw, isGroupsLoading, isGroupsError } = useGroups({
    root,
  });

  if (isGroupsLoading) return "Loading...";
  if (isGroupsError) return "Error! :(";

  for (const permission of belongsTo) {
    if (!raw.includes(permission)) return fallback;
  }

  return children;
};
```

With `<Groups />` it's straightforward to guard your routes and give actionable feedback to your users about access.

```tsx
// app.tsx

import { ReactAdmin, CustomRoutes, Route } from "react-admin";
import { Index, Page, PageEdit, PageCreate, AdminPage } from "./pages/...";
import { Groups } from "./components/groups.tsx";

const CMS = () => {
  // ...

  return (
    <ReactAdmin
    // ...
    >
      <CustomRoutes>
        <Route
          index
          element={
            <Groups root="" belongsTo={["read"]}>
              <Index />
            </Groups>
          }
        />
        <Route
          path="page/:path/*"
          element={
            <Groups root="page" belongsTo={["read"]}>
              <Page />
            </Groups>
          }
        />
        <Route
          path="edit/:path/*"
          element={
            <Groups root="admin" belongsTo={["write"]}>
              <PageEdit />
            </Groups>
          }
        />
        <Route
          path="new/*"
          element={
            <Groups root="admin" belongsTo={["admin"]}>
              <PageCreate />
            </Groups>
          }
        />
        <Route
          path="admin/:path/*"
          element={
            <Groups root="admin" belongsTo={["admin"]}>
              <AdminPage />
            </Groups>
          }
        />
      </CustomRoutes>
    </ReactAdmin>
  );
};
```
