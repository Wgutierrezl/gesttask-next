# Go-live checklist

Everything in this repository runs without a cloud account ([ADR 0017](adr/0017-local-first-and-go-live-last.md)). Going live
changes environment variables only, no code. This checklist needs YOUR accounts (AWS, Neon, Vercel), so nothing here is
automated, and nothing has been verified against the real services yet: step 9 is how you verify it.

Do the steps in this order. Step 1 comes before anything that can cost money.

## 0. What you need

- A Vercel account (Hobby is enough; it is non-commercial use only), a Neon account, an AWS account.
- Locally: this repository, `pnpm install`, and the ability to run `openssl`.
- Generate two secrets and keep them in a password manager, not in a file in the repository:

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 24   # CRON_SECRET (at least 16 characters)
```

## 1. AWS Budgets alert FIRST

Before a bucket or an access key exists, so a mistake or an abusive visitor cannot become a surprise bill.

1. Billing and Cost Management, Budgets, create a **cost budget** (monthly, for example USD 1 or 5).
2. Alerts at 50 %, 80 % and 100 % of ACTUAL spend, and one on FORECASTED spend at 100 %, all to your email.
3. Confirm the subscription email AWS sends. An unconfirmed alert protects nothing.

The application also limits abuse by itself (5 MB per file, five allowed types, 5 attachments and 5 uploads per hour
for a demo visitor, [ADR 0013](adr/0013-rate-limits-in-postgres.md)), but the budget is the backstop.

## 2. S3 bucket and a minimum-privilege key

1. Create a bucket in one region (`AWS_REGION`), **Block all public access ON**, default encryption on. The bucket stays
   private: downloads use signed URLs of five minutes ([ADR 0009](adr/0009-storage.md)).
2. CORS (the browser POSTs the file straight to the bucket, [ADR 0010](adr/0010-presigned-post.md)). Replace the origin:

```json
[
  {
    "AllowedOrigins": ["https://YOUR-APP-ORIGIN"],
    "AllowedMethods": ["POST"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 300
  }
]
```

3. Lifecycle rule: **abort incomplete multipart uploads after 1 day**. (Optional, only if this deployment is a pure demo:
   expire the `boards/` prefix after a few days as a second safety net. Do not do this for real data.)
4. An IAM user for the app only, no console access, with this policy (replace `BUCKET`). `ListBucket` is there so that
   asking for an object that does not exist answers 404 (the app treats that as "never uploaded") and not 403:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::BUCKET/boards/*" },
    { "Effect": "Allow", "Action": "s3:ListBucket", "Resource": "arn:aws:s3:::BUCKET", "Condition": { "StringLike": { "s3:prefix": "boards/*" } } }
  ]
}
```

5. Create an access key for that user: `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. Do not set `S3_ENDPOINT` (it is for RustFS).

## 3. Neon

1. Create a project and a database. Copy the **pooled** connection string (the host contains `-pooler`), with
   `sslmode=require`. That is `DATABASE_URL`, and `DB_DRIVER` is `neon` ([ADR 0003](adr/0003-postgres-drizzle-drivers.md)).
2. Apply the migrations from your machine (migrations always use plain node-postgres over TCP):

```bash
DATABASE_URL='postgres://...-pooler...?sslmode=require' pnpm db:migrate
```

3. Seed the shared demo board (it also uploads its two sample attachments to the bucket, so it needs the S3 variables):

```bash
DB_DRIVER=neon DATABASE_URL='...' STORAGE_DRIVER=s3 S3_BUCKET=... AWS_REGION=... \
AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... BETTER_AUTH_SECRET='any 32+ characters' pnpm db:seed
```

Run it twice if you like: the second run says "already exists".

## 4. Vercel project and environment variables

Import the GitHub repository (framework Next.js, defaults for install and build). Add these to **Production**:

| Variable | Value |
|---|---|
| `DB_DRIVER` | `neon` |
| `DATABASE_URL` | the pooled Neon connection string |
| `BETTER_AUTH_SECRET` | the 32-byte secret from step 0 (the placeholder from `.env.example` is refused in production) |
| `BETTER_AUTH_URL` | the public origin, with scheme and no path, for example `https://gesttask.vercel.app`. Cookies, the trusted origin of the CSRF check and auth callbacks use it, so set it to the FINAL domain (and again if you add a custom one). |
| `STORAGE_DRIVER` | `s3` |
| `S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | from step 2 |
| `CRON_SECRET` | the secret from step 0. Vercel sends it as `Authorization: Bearer ...` to the cron route by itself. Without it the cron cannot authenticate and the app logs a warning at startup. |

Notes:

- `TRUSTED_PROXY_HOPS` is **not needed on Vercel**: there the client address comes from the platform's headers and the
  variable is ignored. Set it only when you run the app somewhere else behind N reverse proxies (N = how many append to
  `X-Forwarded-For`); with the default 0, production off Vercel refuses sign-ins and answers the API with 503, on purpose.
- Give Preview deployments their own database (a Neon branch) and no production secrets. A preview that points at the
  production database would run the demo's purge against it.
- `STORAGE_DRIVER=local` is refused on Vercel (read-only filesystem).

## 5. Cron

`vercel.json` already schedules `GET /api/cron/reset` once a day at 04:00 UTC, the most often Hobby allows (Hobby runs a
cron at most once a day, at an imprecise time within the hour). After the first deploy it appears under Settings, Cron Jobs.
The route purges expired demo guests, sweeps abandoned uploads, drains queued storage deletions and trims the rate-limit
table ([ADR 0018](adr/0018-guest-sandbox-and-scheduled-maintenance.md)). Demo data therefore lives up to 24 hours plus up
to one day until the next run.

## 6. Vercel Blob (optional fallback)

Only if you want the fallback driver ([ADR 0009](adr/0009-storage.md)): create a **private** Blob store, copy
`BLOB_READ_WRITE_TOKEN`, and set `STORAGE_DRIVER=blob` instead of the S3 variables. Known differences: the download file
name is not honored (Blob cannot set it), and `pnpm db:seed` cannot upload the sample attachments to it (it seeds the
comments without them and says so). Switching drivers later does not migrate existing files.

## 7. Deploy

Deploy from `main`. Migrations are NOT run by the build: apply new migrations to Neon (`pnpm db:migrate`, step 3) BEFORE
promoting a version that needs them.

## 8. Smoke test

In this order, against the production URL:

1. `curl -s https://YOUR-APP-ORIGIN/api/v1/openapi.json | head -c 200` answers an OpenAPI 3.1 document, and `/api/docs`
   renders the reference.
2. Landing page, "Try the demo": you reach a board with cards, in well under 30 seconds (the first request after a long
   idle includes the Neon wake-up).
3. Open a task, write a comment, attach a small file, post it, reload, download the file. This is the check of the S3
   CORS rule and the IAM policy: if the upload fails in the browser, look at the CORS origin first.
4. Drag a card to another stage and reload.
5. The cron:

```bash
curl -i https://YOUR-APP-ORIGIN/api/cron/reset                                   # 401
curl -i -H "Authorization: Bearer $CRON_SECRET" https://YOUR-APP-ORIGIN/api/cron/reset   # 200, every job "ok": true
```

6. Vercel logs show none of: `CRON_SECRET is not set`, `TRUSTED_PROXY_HOPS`, `STORAGE_DRIVER=local`.
7. AWS Budgets shows the budget as active, and the alert subscription is confirmed.

## 9. What only the real services can show

These are the parts the repository's tests cannot prove (no accounts existed during development): the Neon WebSocket
driver (`DB_DRIVER=neon`), the AWS S3 adapter against AWS itself (it is tested against RustFS), and the Vercel Cron
invocation. Steps 8.2, 8.3 and 8.5 are their tests. If one fails, the fix is almost always an environment variable, a CORS
origin or an IAM action.

## 10. After it works

1. Put the production URL in the README ("Live demo").
2. Pin this repository on your GitHub profile.
3. Archive the old `GestTask` and `GestTask_FR` repositories with a banner pointing here.

## Rollback

Redeploy the previous Vercel deployment. The bucket and the Neon project can be deleted without touching anything else;
revoke the IAM user's access key first.
