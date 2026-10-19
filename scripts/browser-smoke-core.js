"use strict";

const BENIGN_ABORTS = /(?:ERR_ABORTED|NS_BINDING_ABORTED|cancel(?:led|ed))/i;

function classifyRequestFailure(failure) {
  if (failure.pageRetired === true && BENIGN_ABORTS.test(String(failure.errorText || ""))) {
    return "ignore";
  }
  return "fatal";
}

function classifyHttpResponse(status) {
  return Number(status) >= 400 ? "fatal" : "ignore";
}

function createPageNavigator(context, observePage) {
  let active;

  async function close() {
    if (!active) return;
    const visit = active;
    active = undefined;
    // This state belongs to the page, including requests started during teardown.
    // A global navigation counter can mislabel late requests from the old document.
    visit.lifecycle.retired = true;
    await visit.page.close();
  }

  return {
    async goto(url, options) {
      await close();
      const page = await context.newPage();
      const lifecycle = { retired: false };
      active = { page, lifecycle };
      observePage(page, lifecycle);
      const response = await page.goto(url, options);
      return { page, response };
    },
    close,
  };
}

module.exports = { classifyHttpResponse, classifyRequestFailure, createPageNavigator };
