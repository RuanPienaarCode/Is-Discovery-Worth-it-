/* An in-memory stand-in for Obsidian's Vault, exposing the surface the
   preview touches (getFiles, cachedRead, events). Adapted from Rhythm's harness. */
export function makeMemoryVault(initial) {
  const files = new Map(Object.entries(initial || {}));
  const mtimes = new Map();
  const folders = new Set();
  const listeners = {};
  const locks = new Map();
  let clock = 1;
  const parent = p => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
  const ensureParents = p => { let d = parent(p); while (d) { folders.add(d); d = parent(d); } };
  for (const p of files.keys()) { ensureParents(p); mtimes.set(p, clock++); }

  const fileObj = p => {
    const name = p.slice(p.lastIndexOf('/') + 1);
    const dot = name.lastIndexOf('.');
    return { path: p, name, basename: dot > 0 ? name.slice(0, dot) : name, extension: dot > 0 ? name.slice(dot + 1) : '', stat: { mtime: mtimes.get(p) || 0 } };
  };
  const emit = (ev, ...a) => (listeners[ev] || []).forEach(cb => cb(...a));
  const touch = p => mtimes.set(p, clock++);

  return {
    files,
    getMarkdownFiles() { return [...files.keys()].filter(p => p.endsWith('.md')).map(fileObj); },
    getFiles() { return [...files.keys()].map(fileObj); },
    getFolderByPath(p) { return folders.has(p) ? { path: p, children: [] } : null; },
    getFileByPath(p) { return files.has(p) ? fileObj(p) : null; },
    getAbstractFileByPath(p) { return files.has(p) ? fileObj(p) : (folders.has(p) ? { path: p, children: [] } : null); },
    async cachedRead(f) { return files.get(f.path) ?? ''; },
    async read(f) { return files.get(f.path) ?? ''; },
    async create(p, content) {
      if ([...files.keys()].some(k => k.toLowerCase() === p.toLowerCase())) throw new Error('exists: ' + p);
      ensureParents(p); files.set(p, content); touch(p); emit('create', fileObj(p)); return fileObj(p);
    },
    async modify(f, content) { files.set(f.path, content); touch(f.path); emit('modify', fileObj(f.path)); },
    /* fn is SYNCHRONOUS (data: string) => string, per the real Vault.process. */
    async process(f, fn) {
      const path = f.path;
      const prior = locks.get(path) || Promise.resolve();
      const run = prior.then(() => {
        const next = fn(files.get(path) ?? '');
        files.set(path, next);
        touch(path);
        emit('modify', fileObj(path));
        return next;
      });
      locks.set(path, run.catch(() => {}));
      return run;
    },
    async createFolder(p) { folders.add(p); ensureParents(p + '/x'); },
    async rename(f, newPath) {
      const c = files.get(f.path); files.delete(f.path); ensureParents(newPath); files.set(newPath, c); touch(newPath);
      emit('rename', fileObj(newPath), f.path);
    },
    on(ev, cb) { (listeners[ev] = listeners[ev] || []).push(cb); return { ev, cb }; },
  };
}
