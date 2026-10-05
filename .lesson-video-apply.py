"""One-use source update for the approved lesson workspace. No account/data access."""
from pathlib import Path
import json
root=Path('.')
p=root/'cs50/lesson/media.js';s=p.read_text()
weeks={'scratch':'0','c':'1','arrays':'2','algorithms':'3','memory':'4','structures':'5','python':'6','sql':'7','ai':'ai','web':'8','flask':'9','capstone':'10'}
registry={k:{'video':f'https://cdn.cs50.net/2025/fall/lectures/{w}/{"ai" if w=="ai" else "lecture"+w}-720p.mp4','captions':f'https://cdn.cs50.net/2025/fall/lectures/{w}/lang/en/{"ai" if w=="ai" else "lecture"+w}.srt'} for k,w in weeks.items()}
assert 'const streams' not in s
s=s.replace('  const scratchEditor','  // Exact English sources resolved from official CS50x week pages, 2026-10-05.\n  const streams = Object.freeze('+json.dumps(registry,indent=2)+');\n  const scratchEditor')
s=s.replace('  return Object.freeze({lectures, scratchEditor, videoURL, officialPlayer});',r'''  function streamURL(unit) { return Object.hasOwn(streams, unit) ? streams[unit].video : null; }
  function captionsURL(unit) { return Object.hasOwn(streams, unit) ? streams[unit].captions : null; }
  function captionsVTT(text) {
    if (typeof text !== 'string' || text.length > 2000000) throw new TypeError('Invalid captions');
    const clean = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
    if (!/\d{2}:\d{2}:\d{2},\d{3} --> /u.test(clean)) throw new TypeError('Unsupported captions');
    return 'WEBVTT\n\n' + clean.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/gu, '$1.$2') + '\n';
  }
  return Object.freeze({lectures, scratchEditor, videoURL, officialPlayer, streamURL, captionsURL, captionsVTT});''')
p.write_text(s)
p=root/'cs50/lesson/workspace.js';s=p.read_text();s=s.replace("Loads YouTube's embedded player here. Playback is not a course completion.","Stream the matching lecture here. Playback is not a course completion.")
s=s.replace('<span>Harvard CS50 · English</span><a id="lwVideoFallback"','<label class="lw-video-source">Video source <select id="lwVideoSource"><option value="harvard">Harvard stream · 720p</option><option value="youtube">YouTube player</option></select></label><a id="lwVideoFallback"')
s=s.replace('</a></div>\n          </section>\n          <section id="lwPanel-scratch"','</a></div><p id="lwVideoStatus" class="lw-media-status" role="status">Harvard CS50 · English. Media loads only when requested.</p>\n          </section>\n          <section id="lwPanel-scratch"',1)
s=s.replace('let switching = 0, scratchTimer = null;','let switching = 0, scratchTimer = null, captionRequest = null, captionBlob = null;')
s=s.replace("    video?.contentWindow?.postMessage(JSON.stringify({event: 'command', func: 'pauseVideo', args: []}), 'https://www.youtube-nocookie.com');", "    if (video?.tagName === 'VIDEO') video.pause();\n    else video?.contentWindow?.postMessage(JSON.stringify({event: 'command', func: 'pauseVideo', args: []}), 'https://www.youtube-nocookie.com');")
s=s.replace("    pauseVideo(); clearTimeout(scratchTimer); video?.remove(); scratch?.remove(); video = null; scratch = null;", "    disposeVideo(); clearTimeout(scratchTimer); scratch?.remove(); scratch = null;")
old='''    const url = media.videoURL(unit.id, location.origin); if (!url) return;
    video = document.createElement('iframe'); video.id = 'lwVideoFrame'; video.title = 'Official CS50 lecture: ' + unit.title;
    video.referrerPolicy = 'strict-origin-when-cross-origin';
    video.allow = 'encrypted-media; picture-in-picture; fullscreen'; video.allowFullscreen = true;
    video.src = url; $('lwVideoMount').append(video); $('lwVideoStart').hidden = true;'''
new='''    const native = $('lwVideoSource').value === 'harvard';
    const url = native ? media.streamURL(unit.id) : media.videoURL(unit.id, location.origin); if (!url) return;
    video = document.createElement(native ? 'video' : 'iframe'); video.id = 'lwVideoFrame'; video.title = 'Official CS50 lecture: ' + unit.title;
    if (native) {
      video.controls = true; video.preload = 'metadata'; video.playsInline = true; video.crossOrigin = 'anonymous';
      video.addEventListener('error', () => { $('lwVideoStatus').textContent = 'Stream unavailable. Choose YouTube player or open the official player.'; });
      video.addEventListener('loadedmetadata', () => { $('lwVideoStatus').textContent = 'Harvard CS50 · English · 720p. Use the video controls to play.'; });
    } else {
      video.referrerPolicy = 'strict-origin-when-cross-origin';
      video.allow = 'encrypted-media; picture-in-picture; fullscreen'; video.allowFullscreen = true;
    }
    video.src = url; $('lwVideoMount').append(video); $('lwVideoStart').hidden = true;
    $('lwVideoStatus').textContent = native ? 'Loading Harvard video stream…' : 'YouTube player. If unavailable, choose Harvard stream without leaving this page.';
    if (native) loadCaptions(video, unit.id);'''
assert old in s;s=s.replace(old,new)
start='''  function disposeVideo() {
    pauseVideo(); captionRequest?.abort(); captionRequest = null;
    if (captionBlob) URL.revokeObjectURL(captionBlob); captionBlob = null;
    if (video?.tagName === 'VIDEO') { video.removeAttribute('src'); video.load(); }
    video?.remove(); video = null;
    $('lwVideoStart').hidden = false;
  }
  async function loadCaptions(target, id) {
    captionRequest = new AbortController();
    try {
      const response = await fetch(media.captionsURL(id), {credentials: 'omit', signal: captionRequest.signal, referrerPolicy: 'strict-origin-when-cross-origin'});
      if (!response.ok) throw new Error('Captions unavailable');
      const text = await response.text(); if (target !== video) return;
      captionBlob = URL.createObjectURL(new Blob([media.captionsVTT(text)], {type: 'text/vtt'}));
      const track = document.createElement('track'); track.kind = 'captions'; track.label = 'English'; track.srclang = 'en'; track.src = captionBlob;
      target.append(track);
    } catch (error) {
      if (target === video && error.name !== 'AbortError') $('lwVideoStatus').textContent = 'Captions could not load. The official player and lesson page include English captions/transcript.';
    }
  }
'''
s=s.replace('  function clearMedia() {',start+'  function clearMedia() {')
s=s.replace("unit = next; video?.remove(); video = null; $('lwVideoStart').hidden = false;","unit = next; disposeVideo();")
s=s.replace("  root.querySelector('.lw-tablist').addEventListener", "  $('lwVideoSource').addEventListener('change', () => { const loaded = !!video; disposeVideo(); if (loaded) loadVideo(); });\n  root.querySelector('.lw-tablist').addEventListener")
s=s.replace("catch (_) { if (request !== authRevision) return; approved = false; }", "catch (_) { if (request !== authRevision) return; approved = false; return; } // A transient access-check failure must not discard an open project.")
p.write_text(s)
p=root/'cs50/lesson/workspace.css';s=p.read_text().replace('.lw-video iframe{','.lw-video iframe,.lw-video video{');s+='\n.lw-video-source{display:flex;align-items:center;gap:8px;font-size:12px}.lw-video-source select{max-width:210px;background:#10202c;color:#e4edf7;border:1px solid #334d60;border-radius:6px;padding:7px;font:inherit}.lw-media-status{margin:0;padding:0 16px 10px;font-size:11px;color:#aebdce}.lw-video video{object-fit:contain;background:#000}.lw-resource-foot{flex-wrap:wrap;gap:10px}\n';p.write_text(s)
p=root/'tests/lesson-workspace.test.cjs';s=p.read_text();s+=r'''
test('Every native stream is an exact Harvard-hosted English SDR source', () => {
  for (const unit of Object.keys(media.lectures)) {
    const video = new URL(media.streamURL(unit));
    assert.equal(video.origin,'https://cdn.cs50.net');
    assert.match(video.pathname,/^\/2025\/fall\/lectures\/(?:[0-9]+|ai)\/(?:lecture[0-9]+|ai)-720p\.mp4$/);
    assert.equal(new URL(media.captionsURL(unit)).origin,'https://cdn.cs50.net');
  }
  assert.equal(media.streamURL('__proto__'),null);
});
test('SRT timestamps convert to native WebVTT without executing content', () => {
  assert.equal(media.captionsVTT('1\r\n00:00:01,200 --> 00:00:02,400\r\nExample caption.\r\n'), 'WEBVTT\n\n1\n00:00:01.200 --> 00:00:02.400\nExample caption.\n');
  assert.throws(()=>media.captionsVTT('<html>Error</html>'));
});
''';p.write_text(s)
p=root/'tests/lesson-workspace-browser.py';s=p.read_text();s=s.replace("   if url.startswith('https://www.youtube-nocookie.com/embed/'):","   if url.startswith('https://cdn.cs50.net/'):\n    if url.endswith('.srt'):return r.fulfill(content_type='text/plain',headers={'Access-Control-Allow-Origin':'*'},body='1\\n00:00:00,000 --> 00:00:03,000\\nSynthetic test caption.\\n')\n    return r.fulfill(status=204,headers={'Access-Control-Allow-Origin':'*'})\n   if url.startswith('https://www.youtube-nocookie.com/embed/'):")
s=s.replace("'/UuIEbpQms8o?'", "'/0/lecture0-720p.mp4'")
s=s.replace("  page.locator('#lwTab-scratch').click();expect(page.locator('#lwPanel-scratch')).to_be_visible()\n  frame=page.locator('#lwVideoFrame').element_handle().content_frame();frame.wait_for_function('window.paused===true')", "  page.locator('#lwVideoFrame').evaluate('(v)=>{window.__nativeElement=v;const pause=v.pause.bind(v);v.pause=()=>{window.__nativePause=true;pause();};}')\n  page.locator('#lwTab-scratch').click();expect(page.locator('#lwPanel-scratch')).to_be_visible()\n  page.wait_for_function('window.__nativePause===true')")
s=s.replace("sum('youtube-nocookie.com' in u for u in requests)==1", "page.evaluate('document.querySelector(\"#lwVideoFrame\")===window.__nativeElement')")
s=s.replace("  check('Viewing tools never awards credit'", "  page.locator('#lwTab-lecture').click();page.locator('#lwLoadVideo').click();page.locator('#lwVideoSource').select_option('youtube');check('Alternate embedded player stays in the same page','youtube-nocookie.com' in page.locator('#lwVideoFrame').get_attribute('src'));page.locator('#lwVideoSource').select_option('harvard')\n  check('Viewing tools never awards credit'")
p.write_text(s)
p=root/'cs50/lesson/README.md';s=p.read_text();s+='''
## Direct video stream
The default player uses Harvard's published English SDR 720p MP4 in a native HTML5 video element. YouTube remains a selectable embedded alternative. Both are click-to-load, pause when hidden, and award no course credit. Official English SRT captions convert to an in-memory VTT track; they are not rehosted or persisted. All 12 URLs were resolved from official CS50x week pages on 2026-10-05. Real playback, captions, and actual .sb3 download are checked independently of fixture tests.
''';p.write_text(s)
Path('.git/lesson-video-paths.txt').write_text('\n'.join(['cs50/lesson/media.js','cs50/lesson/workspace.js','cs50/lesson/workspace.css','cs50/lesson/README.md','tests/lesson-workspace.test.cjs','tests/lesson-workspace-browser.py','.lesson-video-apply.py'])+'\n')
Path('.lesson-video-apply.py').unlink()
