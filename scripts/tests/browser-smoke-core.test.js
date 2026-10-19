const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
  classifyHttpResponse,
  classifyRequestFailure,
  createPageNavigator,
} = require('../browser-smoke-core.js');

test('ignores cancellation only when the harness has retired its owning page', () => {
  for (const errorText of ['net::ERR_ABORTED', 'NS_BINDING_ABORTED', 'Load cancelled']) {
    assert.equal(classifyRequestFailure({ errorText, pageRetired: true }), 'ignore');
    assert.equal(classifyRequestFailure({ errorText, pageRetired: false }), 'fatal');
    assert.equal(classifyRequestFailure({ errorText }), 'fatal');
  }
});

test('real network errors remain fatal, including after page retirement', () => {
  for (const errorText of ['net::ERR_NAME_NOT_RESOLVED', 'NS_ERROR_FAILURE', 'net::ERR_CONNECTION_RESET', 'unknown request failure']) {
    for (const pageRetired of [false, true]) {
      assert.equal(classifyRequestFailure({ errorText, pageRetired }), 'fatal');
    }
  }
});

test('keeps real HTTP failures fatal', () => {
  for (const status of [200, 304, 399]) assert.equal(classifyHttpResponse(status), 'ignore');
  for (const status of [400, 404, 429, 500, 503]) assert.equal(classifyHttpResponse(status), 'fatal');
});

test('late requests during teardown keep the old page identity', async () => {
  const outcomes = [], observed = [];
  const context = {
    async newPage() {
      const page = new EventEmitter();
      page.goto = async () => ({ status: () => 200 });
      page.close = async () => {
        // Reproduce a chained request starting after the harness begins leaving.
        page.emit('request', 'late-data-request');
        page.emit('requestfailed', 'net::ERR_ABORTED');
      };
      return page;
    },
  };
  const navigator = createPageNavigator(context, (page, lifecycle) => {
    observed.push({ page, lifecycle });
    page.on('requestfailed', errorText => outcomes.push(classifyRequestFailure({ errorText, pageRetired: lifecycle.retired })));
  });
  await navigator.goto('https://example.test/first');
  const second = await navigator.goto('https://example.test/second');
  assert.notEqual(observed[0].page, second.page);
  assert.deepEqual(outcomes, ['ignore']);
  // Late errors from the old page cannot affect ownership of the new page.
  observed[0].page.emit('requestfailed', 'NS_BINDING_ABORTED');
  observed[0].page.emit('requestfailed', 'net::ERR_CONNECTION_RESET');
  second.page.emit('requestfailed', 'net::ERR_ABORTED');
  assert.deepEqual(outcomes, ['ignore', 'ignore', 'fatal', 'fatal']);
  await navigator.close();
  await navigator.close();
  assert.deepEqual(outcomes, ['ignore', 'ignore', 'fatal', 'fatal', 'ignore']);
});

test('navigation errors propagate and failed visits can still be closed', async () => {
  let closed = 0;
  const navigator = createPageNavigator({
    async newPage() {
      return { goto: async () => { throw new Error('navigation timeout'); }, close: async () => { closed += 1; } };
    },
  }, () => {});
  await assert.rejects(navigator.goto('https://example.test/'), /navigation timeout/);
  await navigator.close();
  assert.equal(closed, 1);
});
