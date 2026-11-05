# DELETE /products/:id/images/:imageId

Import this cURL into Postman. Set `productId` and `imageId` to the product ID
and image subdocument ID, then log in so Postman sends the `access_token`
cookie.

```bash
curl --request DELETE '{{baseUrl}}/products/{{productId}}/images/{{imageId}}'
```

This removes only the selected product image. Products themselves are not
hard-deleted; set `isActive=false` with `PATCH /products/:id` to deactivate a
product.
