// Google sign-in setup. The client ID is a public identifier (not a secret); see GOOGLE_SETUP.md.
// Empty = Google sign-in is hidden and the app works with the demo and local events only.
export const GOOGLE_CLIENT_ID = '560003713045-n9vv70rvhk25ses9de505inmc5089nq6.apps.googleusercontent.com';

// Public API key for the online timeline page (timeline.html), which shows people a timeline without signing in.
// It can only read Drive files shared with "anyone with the link", and Google only accepts it from the SBE site.
// Empty = online timeline links are switched off. See GOOGLE_SETUP.md, "Online timeline links".
export const PUBLIC_API_KEY = '';

// Folder the app creates in the signed-in person's Drive for its own data (timelines, statuses, settings).
export const APP_DATA_FOLDER = 'SBE App Data';
