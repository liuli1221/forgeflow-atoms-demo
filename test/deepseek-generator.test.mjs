import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWithDeepSeek } from '../server/deepseek-generator.mjs';
import { makeArtifactFixture } from './fixtures/llm-artifacts.mjs';

function responseFor(artifact, id) {
  return {
    ok: true,
    async json() {
      return {
        id,
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(artifact) }] }],
        usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
      };
    },
  };
}

test('DeepSeek 生成失败后把校验错误反馈给模型并自动修复', async () => {
  const bad = makeArtifactFixture('calculator');
  bad.files['index.html'] = bad.files['index.html'].replace('data-testid="calculator-display"', '');
  bad.files['app.js'] = bad.files['app.js'].replace('data-testid="calculator-display"', 'data-testid="calculator-output"');
  const good = makeArtifactFixture('calculator');
  const bodies = [];
  let calls = 0;
  const fakeFetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    calls += 1;
    return responseFor(calls === 1 ? bad : good, `resp_${calls}`);
  };

  const result = await generateWithDeepSeek(
    { prompt: '生成一个计算器', mode: 'create', appId: 'app_calc' },
    { apiKey: 'not-a-real-key', fetch: fakeFetch, maxAttempts: 3 },
  );

  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.equal(result.attempts[0].ok, false);
  assert.equal(result.attempts[1].ok, true);
  assert.match(bodies[1].input, /计算器交互契约/);
  assert.equal(result.spec.engine, 'deepseek');
  assert.equal(result.spec.appId, 'app_calc');
});

test('没有密钥时明确失败且不调用模型', async () => {
  const result = await generateWithDeepSeek({ prompt: '生成贪吃蛇' }, { apiKey: '' });
  assert.equal(result.ok, false);
  assert.match(result.error, /DEEPSEEK_API_KEY/);
});

test('认证失败立即返回，不进入无意义的自动修复', async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    return {
      ok: false,
      status: 401,
      async json() { return { error: { message: 'Authentication Fails' } }; },
    };
  };
  const result = await generateWithDeepSeek(
    { prompt: '生成一个计算器' },
    { apiKey: 'invalid-key', fetch: fakeFetch, maxAttempts: 3 },
  );
  assert.equal(result.ok, false);
  assert.equal(calls, 1);
  assert.equal(result.attempts.length, 1);
  assert.match(result.error, /Authentication Fails/);
});
