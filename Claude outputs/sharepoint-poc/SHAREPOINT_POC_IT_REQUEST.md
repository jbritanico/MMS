# Request to M365 / IT: SharePoint test site for the MMS storage proof-of-concept

**From:** Jess Britanico, MMS project
**Purpose:** Before choosing SharePoint Lists or Azure MySQL as the MMS online database, we want to measure how SharePoint behaves with real MR-I data: save times, partial saves, edit conflicts, the 5,000-item list limit, throttling and photo uploads. The test runs only against a separate test site and is deleted afterwards. No production site or data is touched.

## What we need

1. **A new, empty SharePoint site for testing only**
   - Suggested name: `MMS Storage PoC` (URL e.g. `https://<tenant>.sharepoint.com/sites/MMSStoragePoC`)
   - Owners: Jess Britanico
   - No other users, and not linked to any production site or hub

2. **An Entra ID app registration for the test app**
   - Name: `MMS SharePoint PoC`
   - Supported account types: this organisation only
   - Credential: a client secret (expiry 30–90 days) **or** a certificate
   - Please send us: tenant ID, client (application) ID, the secret or certificate, and the test site URL

3. **Permissions, limited to the test site only (least privilege)**
   - Microsoft Graph **application** permission **`Sites.Selected`**, with admin consent
   - Then grant the app **write** access to the test site only (one Graph call by an admin: `POST /sites/{site-id}/permissions` with role `write`). The app can then see no other site in the tenant.
   - Please do **not** grant `Sites.ReadWrite.All`.

## What the test will do (for your information)

- Create about 10 lists and 1 document library on the test site, shaped like MMS reports (header, checklist results, faults, decisions, repairs, photos).
- Write a few thousand list items in total (one scenario needs more than 5,000 items in one list), plus about 20 small test photos.
- One scenario sends a short, capped burst of requests to observe SharePoint throttling (HTTP 429). It stops at the first sustained throttling and backs off. We will run it outside business hours if you prefer, so please tell us.
- At the end, a clean-up script deletes all lists and files. You can then delete the site and the app registration.

## Duration

About 1 week for building and running, then removal. The secret can expire after that.
