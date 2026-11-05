# POST /users

Owner only. Import this cURL into Postman and log in as Owner first.
The password must be 12–72 characters.

```bash
curl --request POST '{{baseUrl}}/users' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "name": "Store Admin",
    "email": "{{adminEmail}}",
    "password": "{{adminPassword}}"
  }'
```

Returns the created Admin account without its password or password hash.
