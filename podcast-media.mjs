// Private Module 2 media. The existing bucket's RLS enforces access.
export const MANIFEST_PATH = 'podcasts/mod2/current.json';
const ROOT = 'podcasts/mod2/';
const LINK_SECONDS = 7200;

export function canonicalJSON(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJSON).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJSON(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function validateManifest(value) {
  const revision = value?.revision;
  if (value?.version !== 1 || !/^[a-f0-9-]{36}$/.test(revision || '') ||
      value.audioPath !== ROOT + revision + '/audio.mp3' ||
      value.transcriptPath !== ROOT + revision + '/transcript.pdf' ||
      !/^[a-f0-9]{64}$/.test(value.sourceFingerprint || '') ||
      !Number.isInteger(value.questionCount) || value.questionCount < 1 ||
      !Number.isFinite(Date.parse(value.publishedAt))) {
    throw new Error('The podcast details are incomplete. Please ask the developer to upload the episode again.');
  }
  return value;
}

export async function validateFiles(audio, transcript) {
  if (!audio || !transcript) throw new Error('Choose both an MP3 and a PDF.');
  if (!/\.mp3$/i.test(audio.name) || audio.size < 3 || audio.size > 48 * 1024 * 1024) {
    throw new Error('Choose an MP3 smaller than 48 MB.');
  }
  if (!/\.pdf$/i.test(transcript.name) || transcript.size < 5 || transcript.size > 16 * 1024 * 1024) {
    throw new Error('Choose a PDF smaller than 16 MB.');
  }
  const a = new Uint8Array(await audio.slice(0, 3).arrayBuffer());
  const p = new Uint8Array(await transcript.slice(0, 5).arrayBuffer());
  const mp3 = (a[0] === 73 && a[1] === 68 && a[2] === 51) || (a[0] === 255 && (a[1] & 224) === 224);
  if (!mp3 || String.fromCharCode(...p) !== '%PDF-') throw new Error('The selected files do not appear to be an MP3 and PDF.');
}

export function createPodcastStore(fc) {
  const storage = fc.client.storage.from(fc.config.imageBucket);
  const unwrap = result => {
    if (result.error) throw result.error;
    return result.data;
  };

  async function allRows(table, fields, moduleId, activeOnly = false) {
    const rows = [];
    for (let start = 0; ; start += 1000) {
      let query = fc.client.from(table).select(fields).eq('module_id', moduleId).order('id', {ascending: true}).range(start, start + 999);
      if (activeOnly) query = query.eq('is_active', true);
      const page = unwrap(await query) || [];
      rows.push(...page);
      if (page.length < 1000) return rows;
    }
  }

  async function sourceSnapshot() {
    const module = await fc.getModule('mod2');
    if (!module) throw new Error('Module 2 is unavailable for this account.');
    const [groups, questions] = await Promise.all([
      allRows('question_groups', 'id,name,sort_order', module.id),
      allRows('questions', 'id,group_id,question_type,question_text,question_image_path,answer_data,sort_order,is_active,updated_at', module.id, true)
    ]);
    const bytes = new TextEncoder().encode(canonicalJSON({module, groups, questions}));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const fingerprint = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    return {fingerprint, questionCount: questions.length};
  }

  async function load() {
    const result = await storage.download(MANIFEST_PATH);
    if (result.error) {
      if (String(result.error.statusCode) === '404' || result.error.code === 'NoSuchKey' || /object not found/i.test(result.error.message || '')) return null;
      throw result.error;
    }
    const manifest = validateManifest(JSON.parse(await result.data.text()));
    const [stream, audioDownload, transcript] = await Promise.all([
      storage.createSignedUrl(manifest.audioPath, LINK_SECONDS),
      storage.createSignedUrl(manifest.audioPath, LINK_SECONDS, {download: 'Module_2_SATCOM_Podcast.mp3'}),
      storage.createSignedUrl(manifest.transcriptPath, LINK_SECONDS, {download: 'Module_2_SATCOM_Transcript.pdf'})
    ]);
    return {manifest, stream: unwrap(stream).signedUrl, audioDownload: unwrap(audioDownload).signedUrl, transcript: unwrap(transcript).signedUrl};
  }

  async function publish(audio, transcript) {
    await validateFiles(audio, transcript);
    const userResult = await fc.client.auth.getUser();
    const user = unwrap(userResult)?.user;
    const profile = await fc.getProfile();
    if (!user || profile?.id !== user.id || profile.role !== 'developer') throw new Error('Sign in with your developer account to upload an episode.');
    const before = await sourceSnapshot();
    if (!before.questionCount) throw new Error('Module 2 has no active questions.');
    const revision = crypto.randomUUID();
    const manifest = {
      version: 1, revision, publishedAt: new Date().toISOString(),
      sourceFingerprint: before.fingerprint, questionCount: before.questionCount,
      audioPath: ROOT + revision + '/audio.mp3',
      transcriptPath: ROOT + revision + '/transcript.pdf'
    };
    // New files first; the current episode changes only after both uploads succeed.
    unwrap(await storage.upload(manifest.audioPath, audio, {contentType: 'audio/mpeg', cacheControl: '3600', upsert: false}));
    unwrap(await storage.upload(manifest.transcriptPath, transcript, {contentType: 'application/pdf', cacheControl: '3600', upsert: false}));
    const after = await sourceSnapshot();
    if (before.fingerprint !== after.fingerprint) throw new Error('Module 2 changed during the upload. Refresh the episode from the new questions before publishing it. The previous episode is still selected.');
    unwrap(await storage.upload(MANIFEST_PATH, new Blob([JSON.stringify(manifest)], {type: 'application/json'}), {contentType: 'application/json', cacheControl: '0', upsert: true}));
    return manifest;
  }

  return {load, publish, sourceSnapshot};
}
