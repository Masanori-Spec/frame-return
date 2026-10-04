import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
const html=await fs.readFile('dist/index.html','utf8'),app=await fs.readFile('web/app.js','utf8'),workflow=await fs.readFile('.github/workflows/verify.yml','utf8');
test('standalone includes one parseable script and no external runtime URL',()=>{const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];assert.equal(scripts.length,1);new vm.Script(scripts[0][1]);assert(!/<script[^>]+src=|<link[^>]+stylesheet[^>]+href=/.test(html));assert(!/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|serviceWorker/.test(app));});
test('CSP blocks network and embeds required runtime license',()=>{assert(html.includes("connect-src 'none'"));assert(html.includes("default-src 'none'"));assert(html.includes('Blue Oak Model License'));assert(html.includes('Version 1.0.0'));});
test('JA and EN, skip link, live status and all file boundaries are present',()=>{for(const id of ['language','workspace','notice','source-input','review-input','assignment-input','return-input','current-input','reset'])assert(html.includes(`id="${id}"`),id);assert(html.includes('aria-live="polite"'));assert(html.includes('href="#workspace"'));assert(html.includes('value="en"'));assert(html.includes('value="ja"'));});
test('browser suite keeps Chromium sandbox and native gate is mandatory',async()=>{const testSource=await fs.readFile('tests/browser-test.mjs','utf8');assert(testSource.includes('chromiumSandbox:true'));assert(testSource.includes('Browser.getBrowserCommandLine'));assert(workflow.includes('ubuntu-24.04'));assert(workflow.includes('NATIVE_WORKDIR: test-results/native'));assert(workflow.includes('--case short'));assert(workflow.includes('--case long'));assert(workflow.includes('contents: read'));assert(!workflow.includes('continue-on-error'));});
test('UI async tasks are guarded and original assignment is independent',()=>{assert(app.includes('id===seq'));assert(app.includes('state.assignment'));assert(app.includes('originalPacket:state.assignment'));assert(app.includes("$('assignment-input').addEventListener"));assert(app.includes('approvedNames:[...state.approved]'));});

test('hosted native and browser jobs use compatible runners with artifact dependencies',()=>{
 const fixture=workflow.split('  native-fixtures:')[1].split('  sandbox-browser:')[0];
 const browser=workflow.split('  sandbox-browser:')[1].split('  native-reopen:')[0];
 const native=workflow.split('  native-reopen:')[1];
 assert(fixture.includes('runs-on: ubuntu-24.04'));
 assert(fixture.includes('harness.py generate --workdir test-results/native'));
 assert(fixture.includes('name: frame-return-native-fixtures'));
 assert(browser.includes('needs: native-fixtures'));
 assert(browser.includes('runs-on: ubuntu-22.04'));
 assert(browser.includes('actions/download-artifact@v4'));
 assert(browser.includes('name: frame-return-native-fixtures'));
 assert(browser.includes('name: frame-return-browser-downloads'));
 assert(!browser.includes('install-ci.sh'));
 assert(native.includes('needs: sandbox-browser'));
 assert(native.includes('runs-on: ubuntu-24.04'));
 assert(native.includes('name: frame-return-browser-downloads'));
 assert(native.includes('--case short')&&native.includes('--case long'));
 assert(!native.includes('harness.py generate'));
 assert(!/sysctl|apparmor_restrict|--no-sandbox/.test(workflow));
});
