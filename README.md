# suborg-demo

Demo application based on suborgs, with access control and management dashboard.

This acts as a playground for SlashID, aimed to try our features from the perspective of a 3rd party, and as a demo for customers.

## What

This demo implements a simple CMS (content management system): Users can GET and PUT content on various pages, defined by paths.

Each path has access control rules: Each user can have read/write/admin permissions on defined per path:

- "Read" allows the path contents to be retrieved (Alternatively, a page may be marked as `public`)
- "Write" allows the path contents to be overwritten
- "Admin" allows managing users and their permissions, and creating new sub-pages.

Additionally, usernames are stored as SlashID Attributed (Using Vault APIs).

## How

- For this demo we want to exercise suborgs and their recursive features. Therefore each page path represents a SlashID suborg. E.g.,

  - `/` represents the root SlashId organization, `MyOrg`
  - `/foo/` represents a SlashId sub-organization, `MyOrg/foo`
  - `/foo/bar/` represents a SlashId sub-organization, `MyOrg/foo/bar`

- We want a single authenticatication to be used for all paths (suborgs), therefore:

  - Users authenticate on the root organization
  - User permissions on each page are stored as SlashID's groups
  - Access control rules are enforced by the application backend, which calls SlashID's backend using the API Key

### Prerequisited

1. A [SlashID](https://www.slashid.dev/) Organization.

   You can get it on our [Signup page](https://console.slashid.dev/signup).

2. [Python 3.11](https://www.python.org/)
3. [Node](https://nodejs.org/en)
4. [Yarn](https://yarnpkg.com/)
5. [Taskfile](https://taskfile.dev/)

## Running

1. Start the server:

   ```sh
   task start
   ```

2. Visit the frontend at [http://localhost:8000/](http://localhost:8000/)

3. Alternatively, you interactive with the backend directly accessing the [SwaggerUI](https://swagger.io/tools/swagger-ui/) frontend at [http://localhost:8000/docs](http://localhost:8000/docs)

## Code Guide

This demo project also includes a walkthrough over the most important bits of the backend and frontend code in [GUIDE.md](GUIDE.md).
