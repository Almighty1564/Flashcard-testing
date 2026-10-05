/* Official lecture IDs verified against Harvard's CS50x 2026 week pages.
   No course progress, account information or credentials belong in embed URLs. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.T08LessonMedia = api;
})(globalThis, function () {
  'use strict';
  const lectures = Object.freeze({
    scratch: 'UuIEbpQms8o', c: 'SlqjA04_dpk', arrays: 'h5Gc1n8ZuU8',
    algorithms: '6Svu_ae5ebk', memory: 'db0H0U13YsA', structures: 'PmAI76OGE_E',
    python: 'Rl0ludWTLxs', sql: 'oqRU2So6Z2Y', ai: '-9bo8HlSxwQ',
    web: 'yYst7puZXjw', flask: 'am7POvSZ4GE', capstone: 'ApQTgFkf8TU'
  });
  const scratchEditor = 'https://scratchfoundation.github.io/scratch-gui/';
  function videoURL(unit, origin) {
    if (!Object.hasOwn(lectures, unit)) return null;
    let site; try { site = new URL(origin); } catch (_) { return null; }
    if (!['http:', 'https:'].includes(site.protocol)) return null;
    const url = new URL('https://www.youtube-nocookie.com/embed/' + lectures[unit]);
    url.search = new URLSearchParams({enablejsapi: '1', origin: site.origin, playsinline: '1', rel: '0', autoplay: '0'});
    return url.href;
  }
  function officialPlayer(unit) {
    return Object.hasOwn(lectures, unit) ? 'https://video.cs50.io/' + lectures[unit] : null;
  }
  return Object.freeze({lectures, scratchEditor, videoURL, officialPlayer});
});
