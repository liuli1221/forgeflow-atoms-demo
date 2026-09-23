import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import healthHandler from '../api/health.mjs';
import generateHandler from '../api/generate.mjs';

function response() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = String(value); },
    end(value = '') { this.body += String(value); },
    json() { return JSON.parse(this.body); },
  };
}

function request(method, body) {
  const req = new EventEmitter();
  req.method = method;
  req.body = body;
  req.headers = { 'x-forwarded-for': '203.0.113.8, 10.0.0.1' };
  req.socket = { remoteAddress: '127.0.0.1' };
  return req;
}

test('Vercel health 暴露生成服务状态但不暴露供应商或模型名', () => {
  const res = response();
  healthHandler(request('GET'), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().storage, 'browser');
  assert.equal(res.json().runtime, 'vercel-function');
  assert.equal('provider' in res.json().llm, false);
  assert.equal('model' in res.json().llm, false);
});

test('Vercel generate 拒绝非 POST 请求', async () => {
  const res = response();
  await generateHandler(request('GET'), res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'POST');
});

test('Vercel generate 在调用模型前校验 prompt', async () => {
  const res = response();
  await generateHandler(request('POST', { prompt: '短' }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.json().error, /4 到 4000/);
});
