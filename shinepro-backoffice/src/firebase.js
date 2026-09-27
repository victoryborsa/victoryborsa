const crypto = require('node:crypto');

// Verifies a Firebase Auth ID token (from Firebase Phone Authentication) without
// the firebase-admin SDK, following Google's documented checks:
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

async function fetchGoogleCerts() {
  const res = await fetch(CERTS_URL, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Could not load Google certificates (${res.status})`);
  const maxAge = Number((/max-age=(\d+)/.exec(res.headers.get('cache-control') || '') || [])[1]) || 3600;
  return { certs: await res.json(), expiresAt: Date.now() + maxAge * 1000 };
}

function createPhoneVerifier({ projectId, fetchCerts = fetchGoogleCerts }) {
  let cache = null;
  const getCerts = async () => {
    if (!cache || cache.expiresAt < Date.now()) cache = await fetchCerts();
    return cache.certs;
  };
  const b64json = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

  // Returns the verified E.164 phone number, or throws.
  return async function verifyPhoneToken(idToken) {
    const parts = String(idToken || '').split('.');
    if (parts.length !== 3) throw new Error('Malformed token');
    const header = b64json(parts[0]);
    const claims = b64json(parts[1]);
    if (header.alg !== 'RS256') throw new Error('Unexpected token algorithm');
    const certs = await getCerts();
    const cert = certs[header.kid];
    if (!cert) throw new Error('Unknown token signing key');
    const valid = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`),
      crypto.createPublicKey(cert), Buffer.from(parts[2], 'base64url'));
    if (!valid) throw new Error('Invalid token signature');
    const now = Math.floor(Date.now() / 1000);
    if (claims.aud !== projectId) throw new Error('Token is for a different project');
    if (claims.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('Wrong token issuer');
    if (!(claims.exp > now)) throw new Error('Token expired');
    if (!(claims.iat <= now + 300) || !(claims.auth_time <= now + 300)) throw new Error('Token issued in the future');
    if (!claims.sub) throw new Error('Token has no subject');
    if (!claims.phone_number) throw new Error('Token has no verified phone number');
    return claims.phone_number;
  };
}

module.exports = { createPhoneVerifier };
