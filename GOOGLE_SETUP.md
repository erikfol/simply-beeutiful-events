# Google sign-in setup (one time, about 15 minutes, free)

This lets the SBE Event Manager offer **Sign in with Google** and read the SBE event folders. Do it once, with **your own Google account** (the one that will sign in to the app). Nothing here costs money, and no credit card is needed.

At the end you'll have a **Client ID**, a long code ending in `.apps.googleusercontent.com`. It identifies the app to Google. It is not a password, and it is fine for it to be public.

> Google renames menu items now and then. If a label below doesn't match exactly, look for the closest match; the steps stay the same.

## 1. Create a project

1. Go to https://console.cloud.google.com and sign in with your Google account.
2. Accept the terms if asked.
3. Top left, open the project picker → **New project**.
4. Name it `SBE Event Manager` and click **Create**. Make sure it's selected in the project picker afterwards.

## 2. Turn on the Google Drive API

1. Menu (☰) → **APIs & Services** → **Library**.
2. Search for **Google Drive API**, open it, click **Enable**.

## 3. Describe the app to Google (the sign-in screen)

1. Menu (☰) → **Google Auth Platform** (older name: *OAuth consent screen*). Click **Get started** if shown.
2. **App name:** `SBE Event Manager`. **User support email:** your email.
3. **Audience:** choose **External**.
4. **Contact information:** your email.
5. Agree to the policy and click **Create**.

## 4. Choose who may sign in

1. In **Google Auth Platform**, open **Audience**.
2. Leave the publishing status as **Testing**. Don't publish the app.
3. Under **Test users**, click **Add users** and add **your own email address**.

While the app is in Testing, **only the test users on this list can sign in**. Anyone else is turned away by Google. To let someone else in later (for example the SBE owner), add their email here.

## 5. Create the Client ID

1. In **Google Auth Platform**, open **Clients** (older name: *APIs & Services → Credentials → Create credentials → OAuth client ID*).
2. Click **Create client**.
3. **Application type:** **Web application**. **Name:** `SBE site`.
4. Under **Authorized JavaScript origins**, add both of these (exactly, no slash at the end):
   - `https://erikfol.github.io`
   - `http://localhost:8000`
5. Leave **Authorized redirect URIs** empty.
6. Click **Create**.
7. Copy the **Client ID** and send it to Claude (or paste it into `docs/js/config.js` as `GOOGLE_CLIENT_ID`).

You'll also see a **Client secret**. The app doesn't use it; don't share it.

## 6. Share the events folder (SBE owner)

If the SBE events folder isn't already shared with your Google account, the owner opens it in Google Drive → **Share** → adds your email as **Viewer**. The app never changes her files; Viewer is enough.

## What to expect the first time you sign in

- Google shows **"Google hasn't verified this app."** That's expected for a private app in Testing. Click **Continue**.
- Google asks to allow the app to **see your Google Drive files** and to **see, edit, create and delete only the specific Google Drive files you use with this app**. The first is how it reads the event folders; the second is how it saves its own data (timelines, statuses) in an **SBE App Data** folder in your Drive. It can't change any other file.
- The sign-in lasts about an hour. When it runs out, the app says so and keeps unsaved changes in the browser; click **Sign in again** and save.

## Turning it off

Delete the project in Google Cloud, or remove your email from the test users. You can also remove the app's access at https://myaccount.google.com/permissions.
