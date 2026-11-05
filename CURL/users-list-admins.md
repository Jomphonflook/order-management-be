# GET /users

Owner only. Import this cURL into Postman and log in as Owner first.

```bash
curl --request GET '{{baseUrl}}/users'
```

Returns the list of Admin accounts. Postman sends the login cookie
automatically when the host and port match.
