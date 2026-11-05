# POST /products

Import this cURL into Postman. Log in first so Postman sends the
`access_token` cookie. Use `form-data` for the text fields and attach each image
with the same `images` field name. Each image must be JPEG, PNG, or WebP, up to
5 MB; a product supports up to 8 images.

```bash
curl --request POST '{{baseUrl}}/products' \
  --form 'name=Steel garden hoe' \
  --form 'sku=HOE-001' \
  --form 'category=Garden tools' \
  --form 'description=Durable steel garden hoe' \
  --form 'sellingPrice=590' \
  --form 'costPrice=350' \
  --form 'commissionPercent=5' \
  --form 'isActive=true' \
  --form 'images=@C:/path/to/hoe-front.jpg' \
  --form 'images=@C:/path/to/hoe-side.png'
```

`profitPerUnit` is calculated by the backend as `sellingPrice - costPrice`.
Omit image form fields if the product has no images.
