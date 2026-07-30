(function exposePromptDetailUtils(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ApiBatchPromptDetailUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPromptDetailUtils() {
  function clampSelection(value, textLength) {
    const number = Number(value);
    if (!Number.isFinite(number)) return textLength;
    return Math.max(0, Math.min(textLength, Math.trunc(number)));
  }

  function insertPromptToken(text, selectionStart, selectionEnd, token) {
    const source = String(text ?? "");
    const replacement = String(token ?? "");
    const first = clampSelection(selectionStart, source.length);
    const second = clampSelection(selectionEnd, source.length);
    const start = Math.min(first, second);
    const end = Math.max(first, second);
    return {
      value: `${source.slice(0, start)}${replacement}${source.slice(end)}`,
      caret: start + replacement.length
    };
  }

  return { insertPromptToken };
});
