# PATCH /users/:id

Owner only. Import this cURL into Postman and log in as Owner first. Set
`adminId` to the Admin account ID returned by `POST /users`.

```bash
curl --request PATCH '{{baseUrl}}/users/{{adminId}}' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "isActive": false
  }'
```

To edit account details, send any supported fields: `name`, `email`,
`password` (12–72 characters), or `isActive`. The role cannot be changed.
