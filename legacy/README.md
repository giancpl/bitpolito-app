# Archived server installation

Before the distributed Android app, BitPolito ran on a Fastify/SQLite server with
a PWA, Web Push and Firebase alerts. That code is no longer part of this branch.

The complete archived installation (server, migrations, Docker/Caddy deployment,
its guides and its tests) is preserved at the git tag **`server-final`**:

```bash
git fetch --tags
git worktree add ../bitpolito-server server-final
```

Use that checkout only to consult or export an existing installation. Its
sessions, invitations, active requests and push registrations do not grant
membership in the encrypted Marmot team, and the two apps never share live
office state.

## Moving the catalogue

The catalogue export stays in this repository because it is the migration path:

```bash
npm run resources:export -- --database /path/to/existing.sqlite --output artifacts/resources.json
```

It reads the database read-only and exports only catalogue fields. An
administrator previews the JSON in **Profile → Administration → Resources →
Import an existing catalogue** and explicitly publishes it. Identities, sessions,
push tokens, invitations and operational history are never exported.
