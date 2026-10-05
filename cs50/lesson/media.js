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
  // Exact English sources resolved from official CS50x week pages, 2026-10-05.
  const streams = Object.freeze({
  "scratch": {
    "video": "https://cdn.cs50.net/2025/fall/lectures/0/lecture0-720p.mp4",
    "captions": "https://cdn.cs50.net/2025/fall/lectures/0/lang/en/lecture0.srt"
  },
  "c": {
    "video": "https://cdn.cs50.net/2025/fall/lectures/1/lecture1-720p.mp4",
    "captions": "https://cdn.cs50.net/2025/fall/lectures/1/lang/en/lecture1.srt"
  },
  "arrays": {
    "video": "https://cdn.cs50.net/2025/fall/lectures/2/lecture2-720p.mp4",
    "captions": "https://cdn.cs50.net/2025/fall/lectures/2/lang/en/lecture2.srt"
  },
  "algorithms": {
    "video": "https://cdn.cs50.net/2025/fall/lectures/3/lecture3-720p.mp4",
    "captions": "https://cdn.cs50.net/2025/fall/lectures/3/lang/en/lecture3.srt"
  },
  "memory": {
    "video": "https://cdn.cs50.net/2025/fall/lectures/4/lecture4-720p.mp4",
    "captions": "https://cdn.cs50.net/2025/fall/lectures/4/lang/en/lecture4.srt"
  },
  "structures": {
    "video": "https://cdn.cs50.net/2025/fall/lectures/5/lecture5-720p.mp4",
    "captions": "https://cdn.cs50.net/2025/fall/lectures/5/lang/en/lecture5.srt"
  },
  "python": {
    "video": "https://cdn.cs50.net/2025/fall/lectures/6/lecture6-720p.mp4",
    "captions": "https://cdn.cs50.net/2025/fall/lectures/6/lang/en/lecture6.srt"
  },
  "sql": {
    "video": "https://cdn.cs50.net/2025/fall/lectures/7/lecture7-720p.mp4",
    "captions": "https://cdn.cs50.net/2025/fall/lectures/7/lang/en/lecture7.srt"
  },
  "ai": {
    "video": "https://cdn.cs50.net/2025/fall/lectures/ai/ai-720p.mp4",
    "captions": "https://cdn.cs50.net/2025/fall/lectures/ai/lang/en/ai.srt"
  },
  "web": {
    "video": "https://cdn.cs50.net/2025/fall/lectures/8/lecture8-720p.mp4",
    "captions": "https://cdn.cs50.net/2025/fall/lectures/8/lang/en/lecture8.srt"
  },
  "flask": {
    "video": "https://cdn.cs50.net/2025/fall/lectures/9/lecture9-720p.mp4",
    "captions": "https://cdn.cs50.net/2025/fall/lectures/9/lang/en/lecture9.srt"
  },
  "capstone": {
    "video": "https://cdn.cs50.net/2025/fall/lectures/10/lecture10-720p.mp4",
    "captions": "https://cdn.cs50.net/2025/fall/lectures/10/lang/en/lecture10.srt"
  }
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
  function streamURL(unit) { return Object.hasOwn(streams, unit) ? streams[unit].video : null; }
  function captionsURL(unit) { return Object.hasOwn(streams, unit) ? streams[unit].captions : null; }
  function captionsVTT(text) {
    if (typeof text !== 'string' || text.length > 2000000) throw new TypeError('Invalid captions');
    const clean = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
    if (!/\d{2}:\d{2}:\d{2},\d{3} --> /u.test(clean)) throw new TypeError('Unsupported captions');
    return 'WEBVTT\n\n' + clean.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/gu, '$1.$2') + '\n';
  }
  return Object.freeze({lectures, scratchEditor, videoURL, officialPlayer, streamURL, captionsURL, captionsVTT});
});
