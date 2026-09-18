import { describe, expect, it } from 'vitest';
import { isAllowedOrigin } from '../src/lib/request-origin';
const site='https://sj-krystal13.vercel.app';
function request(origin?:string,url=site,headers:Record<string,string>={}){
  return new Request(`${url}/api/journeys`,{method:'POST',headers:{...(origin?{origin}:{}),...headers}});
}
describe('deployment origin validation',()=>{
  it('accepts the actual deployment when APP_URL still contains localhost',()=>{
    expect(isAllowedOrigin(request(site),'http://localhost:3000')).toBe(true);
  });
  it('accepts a preview posting to itself while the configured URL is production',()=>{
    const preview='https://sj-preview-example.vercel.app';
    expect(isAllowedOrigin(request(preview,preview),site)).toBe(true);
  });
  it('accepts the explicitly configured public origin behind a proxy',()=>{
    expect(isAllowedOrigin(request(site,'http://localhost:3000'),site)).toBe(true);
  });
  it('handles whitespace and trailing paths in configured URLs',()=>{
    expect(isAllowedOrigin(request(site,'http://localhost:3000'),` ${site}/ `)).toBe(true);
  });
  it('does not let a malformed APP_URL break requests from the deployment',()=>{
    expect(isAllowedOrigin(request(site),'not a url')).toBe(true);
  });
  it('rejects foreign sites, including other Vercel projects',()=>{
    expect(isAllowedOrigin(request('https://untrusted.vercel.app'),site)).toBe(false);
    expect(isAllowedOrigin(request('https://sj-krystal13.vercel.app.evil.test'),site)).toBe(false);
  });
  it('ignores forged forwarded hosts',()=>{
    expect(isAllowedOrigin(request('https://evil.test',site,{'x-forwarded-host':'evil.test','x-forwarded-proto':'https'}),site)).toBe(false);
  });
  it('rejects opaque origins and protocol or port mismatches',()=>{
    expect(isAllowedOrigin(request('null'),site)).toBe(false);
    expect(isAllowedOrigin(request('http://sj-krystal13.vercel.app'),site)).toBe(false);
    expect(isAllowedOrigin(request(`${site}:8443`),site)).toBe(false);
  });
  it('allows non-browser server requests but rejects cross-site browser metadata',()=>{
    expect(isAllowedOrigin(request(),site)).toBe(true);
    expect(isAllowedOrigin(request(undefined,site,{'sec-fetch-site':'cross-site'}),site)).toBe(false);
  });
});
