# Cloudflare R2 CORS (required for direct browser uploads)

The frontend uploads media **directly to R2** via a presigned PUT URL issued by
the API (`POST /api/upload/sign`). For the browser to PUT across origins
(Cloudflare domain → R2), the R2 bucket must allow it.

Configure **R2 → your bucket → Settings → CORS** with a policy like:

```json
[
  {
    "AllowedOrigins": [
      "https://little-something-web.pages.dev"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 300
  }
]
```

Notes:
- The presigned URL already authorizes the PUT, so no extra auth header is sent.
- Keep `AllowedHeaders: ["*"]` so `Content-Type` is permitted.
- If you make the bucket **private**, also issue signed GET URLs from the API
  instead of relying on `R2_PUBLIC_URL`.
- Add every Cloudflare Pages preview domain you use to `AllowedOrigins`.
