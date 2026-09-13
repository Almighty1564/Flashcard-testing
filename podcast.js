import {createPodcastStore} from './podcast-media.mjs?v=1';

const byId = id => document.getElementById(id);
const audio = byId('audio');
let profile = null, request = 0, authEpoch = 0, store = null, signingIn = false;

function clearPlayer() {
  request++;
  audio.pause(); audio.removeAttribute('src'); audio.load();
  byId('audioDownload').removeAttribute('href');
  byId('transcriptDownload').removeAttribute('href');
  byId('player').hidden = true;
}

function showLogin(message = '') {
  authEpoch++;
  clearPlayer(); profile = null;
  byId('workspace').hidden = true; byId('developer').hidden = true;
  byId('signOut').hidden = true; byId('login').hidden = false;
  byId('loginStatus').textContent = message;
  byId('uploadForm').reset(); byId('uploadStatus').textContent = '';
}

async function loadEpisode() {
  clearPlayer();
  const ticket = request;
  byId('episodeStatus').textContent = 'Opening your episode…';
  byId('reloadEpisode').disabled = true;
  try {
    const episode = await store.load();
    if (ticket !== request || !profile) return;
    if (!episode) {
      byId('episodeDate').textContent = 'SATCOM';
      byId('episodeStatus').textContent = 'The podcast is not available yet. It will appear here after the first episode is uploaded.';
      return;
    }
    const date = new Date(episode.manifest.publishedAt).toLocaleDateString(undefined, {year:'numeric',month:'short',day:'numeric'});
    byId('episodeDate').textContent = date;
    byId('episodeStatus').textContent = episode.manifest.questionCount + ' questions in the source snapshot · Full episode and transcript';
    audio.src = episode.stream; audio.playbackRate = Number(byId('speed').value);
    byId('audioDownload').href = episode.audioDownload;
    byId('transcriptDownload').href = episode.transcript;
    byId('player').hidden = false;
  } catch (error) {
    if (ticket === request && profile) byId('episodeStatus').textContent = 'The episode could not be opened. Check your connection and try Reload episode.';
  } finally { if (ticket === request) byId('reloadEpisode').disabled = false; }
}

async function enter(next) {
  if (!next) { showLogin(); return; }
  profile = next;
  byId('login').hidden = true; byId('workspace').hidden = false;
  byId('signOut').hidden = false; byId('developer').hidden = next.role !== 'developer';
  await loadEpisode();
}

byId('signInForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (signingIn || !store) return;
  signingIn = true; byId('signIn').disabled = true;
  const epoch = ++authEpoch;
  byId('loginStatus').textContent = 'Signing in…';
  try {
    await FC.signIn(byId('username').value, byId('password').value);
    byId('password').value = '';
    const next = await FC.requireUser();
    if (epoch !== authEpoch) return;
    if (!next) throw new Error('Your session could not be opened. Please sign in again.');
    await enter(next);
  } catch (error) { if (epoch === authEpoch) showLogin(error.message || 'Sign in failed. Please try again.'); }
  finally { signingIn = false; byId('signIn').disabled = false; }
});

byId('signOut').addEventListener('click', async () => {
  showLogin('Signing out…');
  byId('signIn').disabled = true;
  try {
    const result = await FC.client.auth.signOut({scope:'local'});
    if (result.error) throw result.error;
    byId('username').value = ''; byId('password').value = '';
    byId('loginStatus').textContent = 'Signed out.';
  } catch (_) { byId('loginStatus').textContent = 'Sign-out could not be completed. Check your connection and reload this page.'; }
  finally { byId('signIn').disabled = false; }
});

byId('reloadEpisode').addEventListener('click', loadEpisode);
byId('speed').addEventListener('change', () => { audio.playbackRate = Number(byId('speed').value); });
byId('back15').addEventListener('click', () => { if (Number.isFinite(audio.duration)) audio.currentTime = Math.max(0, audio.currentTime - 15); });
byId('forward15').addEventListener('click', () => { if (Number.isFinite(audio.duration)) audio.currentTime = Math.min(audio.duration, audio.currentTime + 15); });
audio.addEventListener('error', () => { if (audio.hasAttribute('src') && profile) byId('episodeStatus').textContent = 'Playback stopped. Check your connection, then use Reload episode to get a fresh link.'; });

byId('uploadForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (byId('publish').disabled || profile?.role !== 'developer') return;
  byId('publish').disabled = true;
  byId('uploadStatus').textContent = 'Uploading the episode and transcript. Keep this page open…';
  const accountId = profile.id;
  try {
    await store.publish(byId('mp3File').files[0], byId('pdfFile').files[0]);
    if (profile?.id !== accountId) return;
    byId('uploadStatus').textContent = 'Episode published. Your new files are ready to open.';
    byId('uploadForm').reset();
    await loadEpisode();
  } catch (error) { if (profile?.id === accountId) byId('uploadStatus').textContent = error.message || 'The upload could not be completed. Please try again.'; }
  finally { byId('publish').disabled = false; }
});

async function boot() {
  if (!window.FC) { showLogin('Sign-in could not load. Check your connection and reload this page.'); byId('signIn').disabled = true; return; }
  store = createPodcastStore(FC);
  FC.client.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') showLogin('Your session ended. Sign in to continue.'); });
  byId('signIn').disabled = true;
  const epoch = authEpoch;
  try { const next = await FC.requireUser(); if (epoch === authEpoch) await enter(next); }
  catch (_) { showLogin('Your session could not be checked. Please sign in.'); }
  finally { byId('signIn').disabled = false; }
}

window.addEventListener('pageshow', async event => {
  if (!event.persisted || !store) return;
  const epoch = authEpoch;
  try { const next = await FC.requireUser(); if (epoch === authEpoch) await enter(next); } catch (_) { if (epoch === authEpoch) showLogin('Please sign in again.'); }
});
boot();
