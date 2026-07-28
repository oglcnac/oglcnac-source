"use strict";

const BENIGN_ABORTS = /(?:ERR_ABORTED|NS_BINDING_ABORTED|cancel(?:led|ed))/i;

function classifyRequestFailure(failure) {
  const superseded =
    Number.isInteger(failure.navigationId) &&
    Number.isInteger(failure.currentNavigationId) &&
    failure.navigationId < failure.currentNavigationId;
  if (superseded && BENIGN_ABORTS.test(String(failure.errorText || ""))) {
    return "ignore";
  }
  return "fatal";
}

function classifyHttpResponse(status) {
  return Number(status) >= 400 ? "fatal" : "ignore";
}

module.exports = { classifyHttpResponse, classifyRequestFailure };
