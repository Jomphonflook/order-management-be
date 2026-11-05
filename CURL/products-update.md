# PATCH /products/:id

Import this cURL into Postman. Set `productId` to the product ID, then log in
so Postman sends the `access_token` cookie. Send only the fields to update.
New images are appended to existing images; use the same `images` field for
each file. A product can have up to 8 images total.

```bash
curl --request PATCH '{{baseUrl}}/products/{{productId}}' \
  --form 'sellingPrice=650' \
  --form 'costPrice=380' \
  --form 'commissionPercent=6.5' \
  --form 'images=@C:/path/to/updated-product.jpg'
```

To deactivate a product instead of deleting it:

```bash
curl --request PATCH '{{baseUrl}}/products/{{productId}}' \
  --form 'isActive=false'
```

The backend recalculates `profitPerUnit` whenever selling or cost price changes.
