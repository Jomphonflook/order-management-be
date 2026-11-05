# POST /auth/logout

Import this cURL into Postman. The request uses the `access_token` cookie stored
by Postman after login.

```bash
curl --request POST '{{baseUrl}}/auth/logout'
```

The response clears the authentication cookie.
