# Island community wall moderation

The rooftop wall stores submissions as `pending`. Public reads include only moderator approved notes from the last 30 days. The database table is created with the server's normal idempotent boot migration; the API and `DATABASE_URL` must be available for moderation commands to work.

Set local shell variables for the running API and configured administrator token. Keep the token in your local environment or secret manager; do not put it in source control or paste it into shared logs.

```sh
export API_BASE="http://localhost:8787"
export ADMIN_TOKEN="<your local ADMIN_TOKEN value>"
```

List submissions waiting for review:

```sh
curl --fail-with-body "$API_BASE/island-wall/pending" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Approve a submission after reviewing its content:

```sh
curl --fail-with-body -X PATCH "$API_BASE/island-wall/<id>/approve" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Hide a submission:

```sh
curl --fail-with-body -X DELETE "$API_BASE/island-wall/<id>" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Replace `<id>` with the numeric id returned by the pending list. Approval publishes the note while it remains within the 30 day public listing window. Hiding marks it hidden and removes it from public reads.
