/**
 * Firebase Identity Toolkit validates the ID token before returning a uid.
 * This API does not trust a user ID supplied in a request body or URL.
 */
export async function authenticatedUid(request: Request): Promise<string | null> {
  const apiKey = process.env.FIREBASE_AUTH_API_KEY ||
    process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
  const token = request.headers.get('authorization')?.match(/^Bearer ([\w.-]+)$/)?.[1];
  if (!apiKey || !token || token.length > 4500) return null;
  try {
    const verify = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(6000) }
    );
    if (!verify.ok) return null;
    const data = await verify.json() as {users?: {localId?:string;disabled?:boolean}[]};
    const user=data.users?.[0];
    return user && !user.disabled && typeof user.localId==='string' && /^[a-zA-Z0-9_-]{1,128}$/.test(user.localId)
      ? user.localId : null;
  } catch { return null; }
}
export async function authorize(request: Request) {
  return Boolean(await authenticatedUid(request));
}
