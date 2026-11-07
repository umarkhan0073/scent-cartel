# The Scent Cartel: backend

Node.js (Express) + Google Firestore, serving the website and the API from one Cloud Run service.

## What works
| Feature | Status |
|---|---|
| Catalogue and prices from the database (editable in `/admin`) | Working |
| Orders: server recalculates prices, coupon, shipping; validates phone/address; blocks duplicates | Working |
| Cash on Delivery | Working (payment stays "Pending" until you mark it Paid in `/admin`) |
| Bank Transfer | Working (customer sees your bank details, can submit a payment reference; you mark it Paid) |
| JazzCash hosted checkout | Built, needs your merchant credentials and a sandbox test (see below) |
| Contact form (stored, rate limited, spam trap, email to you) | Working |
| Order and contact emails | Working once SMTP is set |
| Admin dashboard `/admin` (orders, payments, messages, products, coupons) | Working |

**Not included:** Easypaisa, card gateway, customer accounts with passwords (the Account page stays a browser-only profile), product reviews, and the AI assistant on the site is still the built-in catalogue/FAQ assistant (no external AI).

## 1. Run locally (optional)
```
npm install
cp .env.example .env            # then fill ADMIN_PASSWORD and SESSION_SECRET
gcloud auth application-default login
export $(grep -v '^#' .env | xargs)   # or set the variables another way
npm run seed                    # loads the 28 perfumes + WELCOME10 coupon
npm start                       # http://localhost:8080  (admin: /admin)
```

## 2. Deploy on Google Cloud (Cloud Run + Firestore)
```
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com firestore.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com
gcloud firestore databases create --location=asia-south1 --type=firestore-native
# Then paste firestore.rules in Console > Firestore > Rules

printf 'YOUR-LONG-ADMIN-PASSWORD' | gcloud secrets create ADMIN_PASSWORD --data-file=-
openssl rand -hex 32 | gcloud secrets create SESSION_SECRET --data-file=-

gcloud run deploy scent-cartel --source . --region asia-south1 --allow-unauthenticated \
  --set-secrets ADMIN_PASSWORD=ADMIN_PASSWORD:latest,SESSION_SECRET=SESSION_SECRET:latest \
  --set-env-vars NODE_ENV=production,BASE_URL=https://YOUR-DOMAIN-OR-RUN-URL,PAY_COD=true,PAY_BANK=true,"BANK_DETAILS=Bank: ...\nAccount title: ...\nIBAN: ...",OWNER_EMAIL=you@domain.com
```
Give the Cloud Run service account the role **Cloud Datastore User** (it normally has it by default). Then run `npm run seed` once (locally, step 1) to load the catalogue.

`BASE_URL` must be the exact public address customers use (needed for payment return links). To use your own domain: Cloud Run > Manage custom domains.

**If your site is already on Firebase Hosting:** keep it, and add rewrites to `firebase.json` so `/api/**` and `/admin` go to Cloud Run:
`"rewrites":[{"source":"/api/**","run":{"serviceId":"scent-cartel","region":"asia-south1"}},{"source":"/admin","run":{"serviceId":"scent-cartel","region":"asia-south1"}},{"source":"**","destination":"/index.html"}]`
and upload `public/index.html` as your hosted page. Set `BASE_URL` to the Firebase domain.

## 3. Email
Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `OWNER_EMAIL` (any SMTP provider, e.g. your domain mailbox or Gmail app password). Without them, orders and messages are still saved and visible in `/admin`, but no emails are sent.

## 4. JazzCash
1. Get a JazzCash merchant account; ask for sandbox access, your Merchant ID, Password and Integrity Salt.
2. Set `JAZZCASH_MERCHANT_ID`, `JAZZCASH_PASSWORD`, `JAZZCASH_SALT` (use Secret Manager) and redeploy. JazzCash then appears at checkout automatically.
3. In the sandbox, place a test order. **Compare the fields in `lib/jazzcash.js` with your JazzCash integration guide** (field names, `pp_TxnType`, `pp_BankID`, `pp_ProductID` differ by product) and adjust. Set `JAZZCASH_TXN_TYPE` if your guide requires it.
4. Only switch `JAZZCASH_URL` to the live URL after sandbox payments show "Paid" correctly.

An order is marked **Paid** only when JazzCash posts back to `/api/pay/jazzcash/return` with a valid secure hash, response code 000 and the correct amount. A browser success page never marks anything as paid.

## 5. Daily use
Open `https://YOUR-SITE/admin`: view orders, change order status, mark bank/COD orders Paid, read contact messages, edit prices, hide or sell-out perfumes, add perfumes, manage coupons.
Change delivery charge or free-delivery limit with `SHIP_FEE` and `FREE_OVER`.

## Security notes
- Prices, discounts and totals are always recomputed on the server.
- Secrets live in environment variables / Secret Manager, never in the website code.
- Admin sessions use a signed, HttpOnly, SameSite=Strict cookie; login is rate limited.
- Order pages need a private token, so order numbers alone reveal nothing.
- Firestore rules block all direct browser access (`firestore.rules`).
- Cart preview in the browser knows only the WELCOME10 coupon; the server applies any active coupon you create, so totals on the confirmation page are the real ones.
