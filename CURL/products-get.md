# GET /products/:id

Import this cURL into Postman. Set `productId` to the product ID returned by
`POST /products`, then log in so Postman sends the `access_token` cookie.

```bash
curl --request GET '{{baseUrl}}/products/{{productId}}'
```
