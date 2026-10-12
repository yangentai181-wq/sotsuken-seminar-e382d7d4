/* Existing checklist UI + Supabase sync. The cloud is authoritative; legacy storage is import-only. */
(() => {
  'use strict';
  const root = document.getElementById('research-roadmap');
  if (!root) return;
  const $ = id => document.getElementById(id);
  const config = window.RESEARCH_SYNC || {};
  const authLinkFailed = /(?:^|[&#])error=/.test(location.hash);
  const inputs = [...root.querySelectorAll('.rm-task input[type=checkbox]')];
  const known = new Map(inputs.map(input => [input.id, input]));
  const stages = [...root.querySelectorAll('.rm-stage')];
  const feedback = root.querySelector('.rm-feedback');
  const filter = $('rm-pending-only');
  const legacyKey = 'sotsuken:csc-research-roadmap:v1';
  let cloud = new Map(), client, ready = false, editor = false, busy = false, refreshing = false;
  let sessionUser = null, preview = null, refreshAgain = false, authEpoch = 0;
  const say = (text, error = false) => { feedback.textContent = text; feedback.dataset.error = String(error); };
  const connection = (label, message, state = 'ready') => {
    $('rm-connection').textContent = label; $('rm-connection').dataset.state = state;
    $('rm-sync-status').textContent = message;
  };
  function controls() {
    const edit = ready && editor && !busy && !refreshing && navigator.onLine;
    inputs.forEach(input => { input.disabled = !edit || !!preview; });
    $('rm-import-button').disabled = !edit || !!preview;
    $('rm-legacy').disabled = !edit || !!preview;
    $('rm-import-apply').disabled = !edit;
    $('rm-refresh').disabled = !client || busy || refreshing;
    $('rm-export').disabled = busy;
    $('rm-signout').disabled = busy;
    $('rm-signout').hidden = !sessionUser;
    $('rm-login-panel').hidden = !!sessionUser;
  }
  function render() {
    let total = 0;
    for (const input of inputs) {
      const row = input.closest('.rm-task'), origin = row.querySelector('.rm-origin');
      const modified = input.checked !== input.defaultChecked;
      total += Number(input.checked); row.dataset.done = String(input.checked);
      row.hidden = filter.checked && input.checked;
      origin.dataset.kind = modified ? 'manual' : input.defaultChecked ? 'verified' : 'pending';
      origin.textContent = modified ? (input.checked ? '手動で完了' : '手動で未完了に変更') : input.defaultChecked ? '記録を確認済み' : '未達成・未確認';
    }
    root.querySelector('[data-total-count]').textContent = `${total} / ${inputs.length}`;
    for (const stage of stages) {
      const list = [...stage.querySelectorAll('.rm-task input')], count = list.filter(input => input.checked).length;
      const state = count === list.length ? 'done' : count ? 'partial' : 'pending';
      const label = state === 'done' ? '完了' : state === 'partial' ? '一部完了' : '未達成';
      const badge = stage.querySelector('.rm-badge'); badge.dataset.state = state;
      badge.textContent = `${label} · ${count}/${list.length}`;
      root.querySelector(`[data-map-for="${stage.id}"]`).textContent = badge.textContent;
      stage.querySelector('.rm-empty').hidden = !filter.checked || count !== list.length;
    }
    $('rm-expand').textContent = stages.every(s => s.open) ? '全工程を閉じる' : '全工程を開く';
    const priority = [...$('roadmap-02').querySelectorAll('.rm-task input'), ...inputs.filter(i => !i.closest('#roadmap-02'))];
    const next = priority.filter(input => !input.checked).slice(0, 3);
    $('master-next-list').replaceChildren(...next.map(input => {
      const li = document.createElement('li'), a = document.createElement('a');
      a.href = '#' + input.getAttribute('aria-labelledby');
      a.textContent = $(input.getAttribute('aria-labelledby')).textContent; li.append(a); return li;
    }));
    if (!next.length) { const li = document.createElement('li'); li.textContent = 'チェック項目はすべて完了しています。提出物の確認へ進みます。'; $('master-next-list').append(li); }
    controls();
  }
  function validateRows(rows) {
    if (!Array.isArray(rows) || rows.length !== inputs.length) throw new Error('incomplete');
    const result = new Map();
    for (const item of rows) {
      if (!item || !known.has(item.task_id) || result.has(item.task_id) || typeof item.checked !== 'boolean' || !Number.isSafeInteger(item.revision) || item.revision < 0 || !Number.isFinite(Date.parse(item.updated_at))) throw new Error('invalid');
      result.set(item.task_id, item);
    }
    return result;
  }
  function applyCloud(rows) {
    cloud = validateRows(rows);
    for (const [id, item] of cloud) known.get(id).checked = item.checked;
    render();
  }
  async function refresh(announce = false) {
    if (!client || busy || refreshing) { if (client) refreshAgain = true; return; }
    refreshing = true; controls(); const epoch = authEpoch;
    try {
      const { data, error } = await client.rpc('read_research_progress');
      if (error) throw error;
      const valid = validateRows(data);
      const { data: allowed, error: authError } = sessionUser ? await client.rpc('is_research_editor') : {data: false};
      if (authError) throw authError;
      if (epoch !== authEpoch) { refreshAgain = true; return; }
      cloud = valid; for (const [id, item] of cloud) known.get(id).checked = item.checked;
      ready = true; editor = allowed === true;
      const latest = Math.max(...data.map(item => Date.parse(item.updated_at)));
      const date = new Date(latest).toLocaleString('ja-JP');
      connection(editor ? '編集できます' : '閲覧モード', `${editor ? '変更は自動保存されます。' : sessionUser ? 'このアカウントには編集権限がありません。' : '管理者だけが進捗を変更できます。'} 最終更新：${date}`);
      if (announce) say('最新の進捗を取得しました。');
    } catch {
      ready = false; editor = false;
      connection('接続できません', '現在の表示は最後に取得した状態です。通信を確認して「最新の進捗を取得」を押してください。保存先が休止中の場合は管理者が再開してください。', 'error');
      if (announce) say('進捗を取得できません。チェックは変更していません。', true);
    } finally {
      refreshing = false; render();
      if (refreshAgain) { refreshAgain = false; setTimeout(() => refresh(), 0); }
    }
  }
  async function save(changes) {
    if (!editor || !ready || busy || refreshing || !navigator.onLine) { render(); return false; }
    busy = true; controls(); say('保存中…');
    changes.forEach(c => { known.get(c.task_id).closest('.rm-task').dataset.saving = 'true'; });
    let success = false;
    try {
      const { data, error } = await client.rpc('set_research_progress', {p_changes: changes});
      if (error) throw error;
      applyCloud(data); success = true;
      say('保存済み。別の端末ではページを開き直すか「最新の進捗を取得」で確認できます。');
      connection('編集できます', `保存済み：${new Date().toLocaleString('ja-JP')}。公開ページにも反映されます。`);
    } catch (error) {
      for (const [id, item] of cloud) known.get(id).checked = item.checked;
      ready = false;
      say(error?.code === '40001' ? '別の端末で同じ項目が変更されました。今回の変更は保存していません。最新の状態を確認して、必要ならもう一度チェックしてください。' : '保存を確認できませんでした。通信が戻ったら最新の進捗を取得し、内容を確認してください。', true);
      connection('要確認', '最新の進捗を再取得しています。確認が終わるまで編集できません。', 'error');
    } finally {
      busy = false;
      changes.forEach(c => { known.get(c.task_id).closest('.rm-task').dataset.saving = 'false'; });
      render();
      // A lost response may still mean a committed write. Read again; never retry a write blindly.
      if (!success || refreshAgain) { refreshAgain = false; await refresh(); }
    }
    return success;
  }
  function validateBackup(data) {
    if (!data || data.format !== 'csc-research-roadmap' || data.version !== 1 || !Array.isArray(data.checks)) throw new Error('format');
    const seen = new Set(), items = [];
    for (const item of data.checks) {
      if (!item || typeof item.id !== 'string' || typeof item.checked !== 'boolean' || seen.has(item.id)) throw new Error('item');
      seen.add(item.id); if (known.has(item.id)) items.push(item);
    }
    if (!items.length) throw new Error('empty'); return items;
  }
  function prepareImport(data) {
    if (!ready || !editor || busy) throw new Error('unavailable');
    const items = validateBackup(data);
    preview = items.filter(item => cloud.get(item.id).checked !== item.checked).map(item => ({task_id:item.id, checked:item.checked, expected_revision:cloud.get(item.id).revision}));
    $('rm-import-diff').replaceChildren(...preview.map(item => {
      const li = document.createElement('li');
      li.textContent = `${$(known.get(item.task_id).getAttribute('aria-labelledby')).textContent} → ${item.checked ? '完了' : '未完了'}`;
      return li;
    }));
    if (!preview.length) { preview = null; say('現在の進捗と同じです。変更はありません。'); return; }
    $('rm-import-preview').hidden = false; render(); $('rm-import-preview').scrollIntoView({block:'center'});
    say(`${preview.length}項目の変更候補です。まだ保存していません。`);
  }
  function cancelImport() { preview = null; $('rm-import-preview').hidden = true; render(); }
  inputs.forEach(input => input.addEventListener('change', async () => {
    const saved = cloud.get(input.id);
    if (!saved || !ready || !editor) { input.checked = saved?.checked ?? input.defaultChecked; render(); return; }
    await save([{task_id:input.id, checked:input.checked, expected_revision:saved.revision}]);
  }));
  $('rm-import-apply').addEventListener('click', async () => {
    if (!preview || busy) return;
    const changes = preview; cancelImport(); await save(changes);
  });
  $('rm-import-cancel').addEventListener('click', () => { cancelImport(); say('引き継ぎを取り消しました。'); });
  $('rm-import-button').addEventListener('click', () => $('rm-import').click());
  $('rm-import').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try { if (file.size > 1024 * 1024) throw new Error('large'); prepareImport(JSON.parse(await file.text())); }
    catch { say('読み込めません。このロードマップの進捗JSONを選び、ログインと通信状態を確認してください。現在の進捗は変更していません。', true); }
    finally { event.target.value = ''; }
  });
  try { $('rm-legacy').hidden = !localStorage.getItem(legacyKey); } catch { /* Private browsing may deny storage. */ }
  $('rm-legacy').addEventListener('click', () => {
    try { prepareImport(JSON.parse(localStorage.getItem(legacyKey))); }
    catch { say('この端末の旧チェックを読み込めません。元の進捗ファイルから引き継いでください。', true); }
  });
  $('rm-export').addEventListener('click', () => {
    const snapshot = {format:'csc-research-roadmap', version:1, evidenceDate:'2026-10-12', savedAt:new Date().toISOString(), source:ready ? 'cloud' : 'last-known-or-baseline', checks:inputs.map(i => ({id:i.id, checked:i.checked, updatedAt:cloud.get(i.id)?.updated_at || null}))};
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], {type:'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = `研究ロードマップ_進捗_${new Date().toISOString().slice(0,10)}.json`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    say('表示中の進捗をバックアップとして書き出しました。');
  });
  filter.addEventListener('change', render);
  $('rm-expand').addEventListener('click', () => { const open = !stages.every(s => s.open); stages.forEach(s => {s.open = open;}); render(); });
  stages.forEach(stage => stage.addEventListener('toggle', () => { $('rm-expand').textContent = stages.every(s => s.open) ? '全工程を閉じる' : '全工程を開く'; }));
  const printable = [...root.querySelectorAll('.rm-stage,.rm-task-disclosure')]; let beforePrint;
  window.addEventListener('beforeprint', () => { beforePrint = {open:printable.map(d => d.open), filter:filter.checked}; filter.checked = false; printable.forEach(d => {d.open = true;}); render(); });
  window.addEventListener('afterprint', () => { if (beforePrint) { printable.forEach((d,i) => {d.open = beforePrint.open[i];}); filter.checked = beforePrint.filter; beforePrint = null; render(); } });
  root.querySelector('.rm-tools').hidden = false; render();
  $('rm-online-link').hidden = location.origin === new URL(config.siteUrl).origin && location.protocol === 'https:';
  if (!config.url || !config.publishableKey || !window.supabase || location.protocol === 'file:') {
    connection('閲覧用', location.protocol === 'file:' ? '端末間の進捗更新には公開マスタを開いてください。ここでは記録確認時点の内容を表示しています。' : '保存先を準備中です。現在は記録確認時点の内容を表示しています。', 'loading');
    $('rm-login-panel').hidden = true; return;
  }
  const authMessage = (text, error = false) => { $('rm-auth-message').textContent = text; $('rm-auth-message').dataset.error = String(error); };
  // Bound all requests so a suspended Free instance cannot leave a saving spinner indefinitely.
  const boundedFetch = (url, init = {}) => fetch(url, {...init, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000)});
  try {
    client = window.supabase.createClient(config.url, config.publishableKey, {auth:{storageKey:'sotsuken:research-auth:v1', persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, flowType:'implicit'}, global:{fetch:boundedFetch}});
  } catch { connection('接続できません', 'ブラウザーの保存設定を確認し、ページを開き直してください。', 'error'); return; }
  $('rm-email').disabled = false; $('rm-send-link').disabled = false;
  if (authLinkFailed) { $('rm-login-panel').open = true; authMessage('ログイン用リンクが無効か、期限が切れています。新しいリンクを送ってください。', true); }
  $('rm-login-form').addEventListener('submit', async event => {
    event.preventDefault(); $('rm-send-link').disabled = true;
    try {
      const {error} = await client.auth.signInWithOtp({email:$('rm-email').value.trim(), options:{shouldCreateUser:false, emailRedirectTo:config.siteUrl}});
      if (error) throw error;
      authMessage('ログイン用リンクを送りました。メールのリンクをこの端末で開いてください。受信箱・迷惑メールを確認してください。');
    } catch { authMessage('送信できませんでした。登録済みの管理者メールか確認し、少し待って再試行してください。', true); }
    finally { setTimeout(() => { $('rm-send-link').disabled = false; }, 60000); }
  });
  $('rm-signout').addEventListener('click', async () => {
    editor = false; controls();
    const {error} = await client.auth.signOut({scope:'local'});
    if (error) { say('ログアウトを確認できません。接続を確認して再試行してください。', true); return; }
    cancelImport(); say('この端末からログアウトしました。');
  });
  client.auth.onAuthStateChange((_event, session) => {
    sessionUser = session?.user || null; editor = false; ready = false; authEpoch++; controls();
    // Do not await another Supabase call inside the auth lock.
    setTimeout(() => refresh(), 0);
  });
  $('rm-refresh').addEventListener('click', () => refresh(true));
  window.addEventListener('online', () => refresh());
  window.addEventListener('offline', () => { ready = false; controls(); connection('オフライン', '通信が戻るまで編集できません。表示は最後に取得した状態です。', 'error'); });
  window.addEventListener('focus', () => refresh());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  setInterval(() => { if (!document.hidden && navigator.onLine) refresh(); }, 60000);
  refresh();
})();
