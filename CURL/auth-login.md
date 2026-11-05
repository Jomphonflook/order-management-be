# POST /auth/login

Import this cURL into Postman. Set `baseUrl`, `ownerEmail`, and `ownerPassword`
in the selected Postman environment first.

```bash
curl --request POST '{{baseUrl}}/auth/login' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "email": "{{ownerEmail}}",
    "password": "{{ownerPassword}}"
  }'
```

Successful login returns the user and sets the HttpOnly `access_token` cookie.
Postman stores and sends this cookie automatically for requests to the same
host and port.
