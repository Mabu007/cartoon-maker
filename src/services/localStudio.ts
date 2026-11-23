/**
 * SIRVIBE local-only development session.
 *
 * Deliberately restricted to loopback origins running Vite in development:
 * the deployed website keeps its existing cloud account behaviour. This is
 * a convenience workspace, NOT an authentication or security boundary.
 *
 * Projects and media already live in this browser's IndexedDB / OPFS.
 * Keep using the legacy 'guest' scope so prior local cartoons remain visible.
 */
export function localStudioEnabled(development:boolean, hostname:string):boolean {
  if(!development)return false;
  return ['localhost','127.0.0.1','::1','[::1]'].includes(hostname.toLowerCase());
}
export const localStudioMode=localStudioEnabled(
  Boolean(import.meta.env?.DEV),
  typeof location==='undefined'?'':location.hostname
);
export const LOCAL_PROJECT_SCOPE='guest' as const;
export const LOCAL_CREATOR_LABEL='Local Creator' as const;
