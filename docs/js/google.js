// Google sign-in in the browser (Google Identity Services, token flow). Tokens live in memory only.
// Who may sign in is controlled in Google Cloud: while the app is in "Testing", only listed test users can.
import { GOOGLE_CLIENT_ID } from './config.js';

// Read everything the person can already see in Drive; write only files this app creates.
export const SCOPES = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';

export class NeedsSignIn extends Error {
  constructor(msg = 'Sign in with Google to continue.') { super(msg); this.name = 'NeedsSignIn'; }
}

let token = null;
let expiresAt = 0;
let tokenClient = null;
let fake = false;

// Tests and the offline smoke test use a pretend sign-in (paired with drive.useTransport).
export function useFakeAuth() { fake = true; }

export const isConfigured = () => fake || !!GOOGLE_CLIENT_ID;
export const isSignedIn = () => !!token && Date.now() < expiresAt;

export function accessToken() {
  if (!isSignedIn()) throw new NeedsSignIn(token ? 'Your Google sign-in expired. Sign in again to continue.' : undefined);
  return token;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load Google sign-in. Check the internet connection and reload.'));
    document.head.append(s);
  });
}

// Load Google's sign-in library ahead of time so the Sign in click can open the popup immediately.
export async function prepare() {
  if (fake || tokenClient || !GOOGLE_CLIENT_ID) return;
  await loadScript('https://accounts.google.com/gsi/client');
  tokenClient = window.google.accounts.oauth2.initTokenClient({ client_id: GOOGLE_CLIENT_ID, scope: SCOPES, callback: () => {} });
}

export const isReady = () => fake || !!tokenClient;

// Call directly from a click handler (browsers only allow the popup after a click).
export function signIn() {
  if (fake) {
    token = 'fake-token'; expiresAt = Date.now() + 3600 * 1000;
    return Promise.resolve();
  }
  if (!tokenClient) return Promise.reject(new Error('Google sign-in is still loading. Try again in a moment.'));
  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) { reject(new Error(resp.error_description || resp.error)); return; }
      token = resp.access_token;
      expiresAt = Date.now() + (Number(resp.expires_in) - 60) * 1000;
      resolve();
    };
    tokenClient.error_callback = (err) => reject(new Error(err.type === 'popup_closed' ? 'Sign-in window was closed.' : (err.message || 'Sign-in failed.')));
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

export function signOut() {
  if (token && !fake && window.google) window.google.accounts.oauth2.revoke(token, () => {});
  token = null; expiresAt = 0;
}
