# GET /products

Import this cURL into Postman. Log in first so Postman sends the
`access_token` cookie.

```bash
curl --request GET '{{baseUrl}}/products'
```

Optional status filters:

```bash
curl --request GET '{{baseUrl}}/products?isActive=true'
```

```bash
curl --request GET '{{baseUrl}}/products?isActive=false'
```
