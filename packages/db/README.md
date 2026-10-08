# Database

This package owns the Prisma schema, migration history, generated client, and shared connection. The backend imports the connection and Prisma types from `@repo/db`.

Generate the client from the repository root after installing dependencies:

```bash
bun run db:generate
```

The client is generated into `packages/db/generated/client`, which is ignored by Git and generated during builds. Generation does not connect to the database or apply migrations.

To apply committed migrations manually, copy this package's `.env.example` to `.env` and supply a direct database connection URL, or export `DATABASE_URL` in your shell. The backend's runtime URL must refer to the same database and may use a pooled endpoint.

```bash
bun run db:migrate:deploy
bun run db:migrate:status
```

Use `db:migrate` to create development migrations and `db:studio` to inspect a database. Application startup never applies migrations.
