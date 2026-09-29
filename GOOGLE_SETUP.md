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

If the SBE events folder isn't already shared with your Google account, the owner opens it in Google Drive → **Share** → adds your email as **Viewer**. The app never changes the event documents; Viewer is enough to read them.

## 7. Shared saving: the "SBE App Data" folder (SBE owner, once)

Everything the app saves (run sheets, vendor statuses, corrections, event details, templates) lives in one **"SBE App Data"** folder inside the SBE events folder, so every planner sees the same work.

1. The owner of the events folder signs in to the app once and chooses the events folder. The app creates **"SBE App Data"** inside it automatically.
2. The owner opens that folder in Google Drive → **Share** → adds each other planner as **Editor** (only this folder; the rest stays Viewer).
3. Other planners click **Check again** in the app's Google bar (or sign in again). Anything they saved on their own before is moved into the shared folder once.

Until step 2, other planners can see everything but not save; the app says so and keeps their changes in the browser.

## Adding another person

1. In Google Cloud: **Google Auth Platform → Audience → Test users → Add users**, add their Google email.
2. In Google Drive: share the SBE events folder with them as **Viewer**, and the **SBE App Data** folder inside it as **Editor**.

## What to expect the first time you sign in

- Google shows **"Google hasn't verified this app."** That's expected for a private app in Testing. Click **Continue**.
- Google asks to allow the app to **see, edit, create and delete all your Google Drive files**. Tick the box. This broad permission is what lets several planners save into one shared **SBE App Data** folder; Google's narrower option only works per person. The app itself only reads the event documents and only writes inside **SBE App Data** (the automated tests check this), and Drive's sharing still decides what each person can change.
- The sign-in lasts about an hour. When it runs out, the app says so and keeps unsaved changes in the browser; click **Sign in again** and save.

## Turning it off

Delete the project in Google Cloud, or remove your email from the test users. You can also remove the app's access at https://myaccount.google.com/permissions.
