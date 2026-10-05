import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Exercise Auth requests with a fake project; never use production credentials.
const source = (await readFile(new URL('../portfolio-backend.js', import.meta.url), 'utf8'))
  .replace("import { portfolioConfig } from './portfolio-config.js';",
    "const portfolioConfig = {url:'https://auth.example.test',publishableKey:'test-public-key',slug:'test'};");
const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
};
const calls = [];
let nextResponse = {};
let nextStatus = 200;
globalThis.fetch = async (url, options = {}) => {
  calls.push({url, ...options});
  return new Response(JSON.stringify(nextResponse), {status:nextStatus});
};
const auth = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const destination = 'https://portfolio.example.test/studio/reset-password';
await auth.requestPasswordReset(' owner@example.test ', destination);
assert.equal(calls[0].url, 'https://auth.example.test/auth/v1/recover?redirect_to=' + encodeURIComponent(destination));
assert.deepEqual(JSON.parse(calls[0].body), {email:'owner@example.test'});
assert.equal(calls[0].headers.Authorization, undefined);
assert.equal(storage.size, 0);

nextResponse = {id:'recovery-user'};
await auth.verifyRecoverySession('fake-recovery-token');
assert.equal(calls.at(-1).headers.Authorization, 'Bearer fake-recovery-token');
assert.equal(storage.size, 0, 'Recovery must not persist a Studio login');
nextStatus = 401; nextResponse = {message:'Invalid JWT'};
await assert.rejects(auth.verifyRecoverySession('expired-fake-token'), /Invalid JWT/);
const before = calls.length;
await assert.rejects(auth.resetOwnerPassword('', 'synthetic-password'), /new reset link/);
await assert.rejects(auth.resetOwnerPassword('fake-recovery-token', 'short'), /8 characters/);
assert.equal(calls.length, before, 'Invalid inputs must not send an update');

nextStatus = 200; nextResponse = {id:'recovery-user'};
storage.set('folio-lab-owner-session-test', 'old-session');
await auth.resetOwnerPassword('fake-recovery-token', 'synthetic-test-password');
assert.equal(calls.at(-1).method, 'PUT');
assert.equal(calls.at(-1).headers.Authorization, 'Bearer fake-recovery-token');
assert.deepEqual(JSON.parse(calls.at(-1).body), {password:'synthetic-test-password'});
assert.equal(storage.size, 0);
assert(calls.every(call => call.url.includes('/auth/v1/')), 'Recovery must never save or publish portfolio content');
nextStatus = 429; nextResponse = {message:'Too many requests'};
await assert.rejects(auth.requestPasswordReset('owner@example.test', destination), /Too many requests/);
console.log('Password recovery request, token isolation, invalid/expired token handling, password validation, update, and rate-limit checks passed.');

const uiSource = (await readFile(new URL('./reset-password.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/, 'const {portfolioBackendReady,requestPasswordReset,verifyRecoverySession,resetOwnerPassword} = globalThis.recoveryTestAuth;\n');
let uiRun = 0;
async function setupUI(fragment, verifyFails = false) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      hidden: id === 'password-form', dataset:{}, handlers:{}, textContent:'',
      button:{disabled:false}, elements:{},
      addEventListener(type, handler) { this.handlers[type] = handler; },
      querySelector() { return this.button; }, focus() {},
      reset() { for (const field of Object.values(this.elements)) field.value = ''; },
    });
    return nodes.get(id);
  };
  const input = () => ({value:'',focus(){}});
  node('request-form').elements = {email:input()};
  node('password-form').elements = {password:input(),confirm:input()};
  const authCalls = [];
  globalThis.recoveryTestAuth = {
    portfolioBackendReady:true,
    async requestPasswordReset(...args) {authCalls.push(['request',...args]);},
    async verifyRecoverySession(token) {
      authCalls.push(['verify',token]);
      if (verifyFails) throw new Error('expired');
    },
    async resetOwnerPassword(...args) {authCalls.push(['update',...args]);},
  };
  globalThis.location = {origin:'https://portfolio.example.test',pathname:'/studio/reset-password',hash:fragment,search:''};
  globalThis.history = {replaceState() {location.hash='';}};
  globalThis.window = {addEventListener(){}};
  globalThis.document = {getElementById:node,querySelector:()=>node('back-link')};
  await import('data:text/javascript;base64,'+Buffer.from(uiSource+'\n// run '+(++uiRun)).toString('base64'));
  return {node,authCalls};
}
let ui = await setupUI('#type=recovery&access_token=synthetic-recovery-token');
assert.equal(location.hash, '', 'Remove credentials from URL');
assert.equal(ui.node('password-form').hidden, false);
const form = ui.node('password-form');
form.elements.password.value='synthetic-password';form.elements.confirm.value='different-password';
await form.handlers.submit({preventDefault(){}});
assert.match(ui.node('reset-status').textContent,/don’t match/);
assert.equal(ui.authCalls.filter(call=>call[0]==='update').length,0);
form.elements.confirm.value='synthetic-password';
await form.handlers.submit({preventDefault(){}});
assert.equal(ui.authCalls.filter(call=>call[0]==='update').length,1);
assert.equal(ui.node('reset-title').textContent,'Password updated');
assert.equal(form.hidden,true);assert.equal(form.elements.password.value,'');
ui = await setupUI('#type=recovery&access_token=synthetic-expired-token',true);
assert.equal(ui.node('password-form').hidden,true);assert.equal(ui.node('request-form').hidden,false);
assert.match(ui.node('reset-description').textContent,/expired/);
ui = await setupUI('#type=signup&access_token=synthetic-wrong-flow-token');
assert.equal(ui.authCalls.length,0,'A signup link must not open password recovery');
assert.equal(ui.node('password-form').hidden,true);
console.log('Recovery screen, URL cleanup, mismatched password, successful update, expired-link, and wrong-flow checks passed.');
