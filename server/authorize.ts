export async function authorize(request: Request) {
  const apiKey = process.env.FIREBASE_AUTH_API_KEY;
  const token = request.headers.get('authorization')?.match(/^Bearer ([\w.-]+)$/)?.[1];
  if (!apiKey || !token || token.length > 4500) return false;
  const verify = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(5000) });
  if (!verify.ok) return false;
  const data = await verify.json();
  return Boolean(data.users?.[0]?.localId && !data.users[0].disabled);
}
