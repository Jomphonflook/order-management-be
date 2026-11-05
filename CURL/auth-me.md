# GET /auth/me

Import this cURL into Postman. Log in first so Postman has the
`access_token` cookie.

```bash
curl --request GET '{{baseUrl}}/auth/me'
```

Returns the currently authenticated user.
