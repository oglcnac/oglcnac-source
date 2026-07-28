const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyHttpResponse,
  classifyRequestFailure,
} = require("../browser-smoke-core.js");

test("ignores only benign navigation failures superseded by a later document", () => {
  assert.equal(
    classifyRequestFailure({
      errorText: "net::ERR_ABORTED",
      resourceType: "image",
      navigationId: 4,
      currentNavigationId: 5,
    }),
    "ignore",
  );
  assert.equal(
    classifyRequestFailure({
      errorText: "NS_BINDING_ABORTED",
      resourceType: "document",
      navigationId: 8,
      currentNavigationId: 9,
    }),
    "ignore",
  );
});

test("keeps current-navigation aborts and real request failures fatal", () => {
  for (const failure of [
    {
      errorText: "net::ERR_ABORTED",
      resourceType: "script",
      navigationId: 5,
      currentNavigationId: 5,
    },
    {
      errorText: "net::ERR_NAME_NOT_RESOLVED",
      resourceType: "image",
      navigationId: 4,
      currentNavigationId: 5,
    },
    {
      errorText: "NS_ERROR_FAILURE",
      resourceType: "stylesheet",
      navigationId: 4,
      currentNavigationId: 5,
    },
  ]) {
    assert.equal(classifyRequestFailure(failure), "fatal", failure);
  }
});

test("keeps real HTTP failures fatal", () => {
  assert.equal(classifyHttpResponse(200), "ignore");
  assert.equal(classifyHttpResponse(399), "ignore");
  assert.equal(classifyHttpResponse(400), "fatal");
  assert.equal(classifyHttpResponse(503), "fatal");
});
