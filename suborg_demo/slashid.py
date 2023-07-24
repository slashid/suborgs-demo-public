import asyncio
import logging
import secrets
from typing import MutableMapping

import jwt
from clients.slashid import (
    ApiClient,
    Configuration,
    GroupsApi,
    OidcDiscoveryApi,
    OrganizationsApi,
    PersonCreateReq,
    PersonHandle,
    PersonHandleType,
    PersonsApi,
    PostGroupReq,
    PostMintTokenRequest,
)

from .trace import trace


logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

ROOT_ORG_ID = "b6f94b67-d20f-7fc3-51df-bf6e3b82683e"
ROOT_API_KEY = "53fFJEWD6RlJ2lij48rJ218ILRk="
ROOT_ORG_NAME = "<placeholder>"  # We'll populate it later
ADMIN_EMAILS = ["paulo@slashid.dev", "jake@slashid.dev"]  # Identifiers of your admin users
API_ENDPOINT = "https://api.slashid.com"  # Or https://api.sandbox.slashid.com
JWKS: jwt.PyJWKSet

CLIENT_CONFIG = Configuration(
    host=API_ENDPOINT,
    api_key={"ApiKeyAuth": ROOT_API_KEY},
)
CLIENT_CONFIG.connection_pool_maxsize = None  # type: ignore
ApiClient.set_default(ApiClient(CLIENT_CONFIG, pool_threads=100))


ORG_NAME_CACHE: MutableMapping[str, str] = {}  # ID -> Name
ORG_NAME_CACHE_REVERSE: MutableMapping[str, str] = {}  # Name -> ID


async def get_org_name(org_id: str) -> str:
    """
    Retrieves the organization name from its ID.

    FIXME: This is TERRIBLE, but SlashID's `GET /organizations` currently lacks the name but
    `GET /persons/{person_id}/organizations` has it, so we add a user, use it to retrieve
    the org name and then delete it.
    """

    if org_id in ORG_NAME_CACHE:
        return ORG_NAME_CACHE[org_id]

    async with ApiClient(CLIENT_CONFIG) as api_client:
        persons_api = PersonsApi(api_client)
        person = (
            await persons_api.persons_put(
                slash_id_org_id=org_id,
                person_create_req=PersonCreateReq(
                    handles=[
                        PersonHandle(
                            type=PersonHandleType(PersonHandleType.EMAIL_ADDRESS),
                            value=f"{secrets.token_hex(16)}@example.com",
                        )
                    ],
                    groups=[],
                    active=False,
                    attributes=None,
                ),
            )
        ).result

        try:
            orgs = (
                await persons_api.persons_person_id_organizations_get(
                    person_id=person.person_id, slash_id_org_id=org_id
                )
            ).result
            for org in orgs:
                ORG_NAME_CACHE[org.id] = org.org_name
                ORG_NAME_CACHE_REVERSE[org.org_name] = org.id
            return ORG_NAME_CACHE[org_id]
        finally:
            await persons_api.persons_person_id_delete(person_id=person.person_id, slash_id_org_id=org_id)


@trace
async def get_org_id(org_name: str) -> str | None:
    """Returns the organization ID from the its name

    Returns None if the organization doesn't exist"""
    if org_name in ORG_NAME_CACHE_REVERSE:
        return ORG_NAME_CACHE_REVERSE[org_name]

    parts = org_name.rsplit("/", 1)
    if len(parts) < 2:
        return None  # There is no parent to lookup

    parent_org_id = await get_org_id(parts[0])
    if parent_org_id is None:
        return None

    async with ApiClient(CLIENT_CONFIG) as api_client:
        orgs_api = OrganizationsApi(api_client)
        parent_suborg_ids = (await orgs_api.organizations_suborganizations_get(slash_id_org_id=parent_org_id)).result
        assert parent_suborg_ids is not None
        parent_suborg_names = await asyncio.gather(*map(get_org_name, parent_suborg_ids))

        for id, name in zip(parent_suborg_ids, parent_suborg_names):
            if name == org_name:
                return str(id)

        return None


@trace
async def initialize_slashid() -> None:
    async def initialize_root_org_name() -> None:
        """Get name of root org -- suborganizations will be named '{ROOT_ORG_NAME}/path/to/page'"""
        global ROOT_ORG_NAME
        ROOT_ORG_NAME = await get_org_name(ROOT_ORG_ID)
        ORG_NAME_CACHE[ROOT_ORG_ID] = ROOT_ORG_NAME
        ORG_NAME_CACHE_REVERSE[ROOT_ORG_NAME] = ROOT_ORG_ID
        logger.info(f"Root organization name is {ROOT_ORG_NAME}")

    async def initialize_jwks() -> None:
        """Get JWKs -- Used to authenticate user tokens"""
        global JWKS
        oidc_discovery_api = OidcDiscoveryApi()
        JWKS = jwt.PyJWKSet.from_dict(await oidc_discovery_api.well_known_jwks_json_get())
        logger.info("Loaded JWKs")

    async def initialize_groups() -> None:
        """Ensure permission groups exist"""
        from .utils import Permission

        groups_api = GroupsApi()

        async def create_permission(permission: Permission) -> None:
            await groups_api.groups_post(
                slash_id_org_id=ROOT_ORG_ID,
                post_group_req=PostGroupReq(name=permission.value, description=permission.__doc__),
            )
            logger.info(f"Created permission {permission.value} ({permission.__doc__})")

        await asyncio.gather(*map(create_permission, Permission))

    async def initialize_admins() -> None:
        """Ensure admin users exist and have all permissions on main page"""
        await initialize_groups()

        persons_api = PersonsApi()

        async def create_admin(admin_email: str) -> None:
            from .utils import Permission

            person = await persons_api.persons_put(
                slash_id_org_id=ROOT_ORG_ID,
                person_create_req=PersonCreateReq(
                    handles=[PersonHandle(type=PersonHandleType(PersonHandleType.EMAIL_ADDRESS), value=admin_email)],
                    groups=[Permission.Read.value, Permission.Write.value, Permission.Admin.value],
                    active=True,
                    attributes=None,
                ),
            )
            mint_result = await persons_api.persons_person_id_mint_token_post(
                person_id=person.result.person_id,
                slash_id_org_id=ROOT_ORG_ID,
                post_mint_token_request=PostMintTokenRequest(custom_claims={}),
            )
            logger.info(f"Create user {admin_email}, token={mint_result.result}")

        await asyncio.gather(*map(create_admin, ADMIN_EMAILS))

    await asyncio.gather(
        initialize_root_org_name(),
        initialize_jwks(),
        initialize_admins(),
    )
