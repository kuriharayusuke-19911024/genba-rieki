/**
 * エクステージ 現場利益管理 — データ側（Google Apps Script）
 * スプレッドシートに紐づけて使う。ウェブアプリとして「全員」に公開。
 * お金の数字は社内パスワードを確認したときだけ返す。外注さんには現場名と自分の記録だけ返す。
 */
const COLLS = ['sites', 'budget', 'estimates', 'bills', 'cinvoices', 'reports', 'worklogs', 'invoices', 'templates', 'accesslog'];
const DEFAULTS = {
  staffPassword: '1228',
  targetMargin: '22',
  fiscalEndMonth: '12',
  managers: '牛尾和寛、牛尾翔汰',
  staffNames: '',
  companyName: '株式会社エクステージ',
  aiModel: 'claude-haiku-5-5'
};
const MAX_BYTES = 8 * 1024 * 1024;

function onOpen() {
  SpreadsheetApp.getUi().createMenu('現場管理')
    .addItem('PDF読取のAPIキーを設定', 'setApiKey')
    .addItem('初期設定（シート作成）', 'setup')
    .addToUi();
}

function setApiKey() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('PDF読取のAPIキー', 'AnthropicのAPIキー（sk-ant-…）を貼り付けてください', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const k = r.getResponseText().trim();
  if (!k) return;
  PropertiesService.getScriptProperties().setProperty('ANTHROPIC_API_KEY', k);
  ui.alert('保存しました');
}

function setup() {
  COLLS.forEach(sheet_);
  cfgSheet_();
  folder_();
}

/* ---------- 保存まわり ---------- */
function sheet_(name) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(['id', 'json', 'updated']);
    sh.setFrozenRows(1);
  }
  return sh;
}
function cfgSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('config');
  if (!sh) {
    sh = ss.insertSheet('config');
    sh.getRange('A:B').setNumberFormat('@');
    sh.appendRow(['key', 'value']);
    Object.keys(DEFAULTS).forEach(function (k) { sh.appendRow([k, DEFAULTS[k]]); });
  }
  return sh;
}
function cfg_() {
  const v = cfgSheet_().getDataRange().getValues();
  const c = Object.assign({}, DEFAULTS);
  for (let i = 1; i < v.length; i++) if (v[i][0]) c[v[i][0]] = String(v[i][1]);
  return c;
}
function setCfg_(obj) {
  const sh = cfgSheet_();
  const v = sh.getDataRange().getValues();
  Object.keys(obj).forEach(function (k) {
    if (!(k in DEFAULTS) || k === 'aiModel') return;
    let row = -1;
    for (let i = 1; i < v.length; i++) if (v[i][0] === k) row = i + 1;
    if (row > 0) sh.getRange(row, 2).setValue(String(obj[k]));
    else { sh.appendRow([k, String(obj[k])]); v.push([k, obj[k]]); }
  });
}
function all_(name) {
  const v = sheet_(name).getDataRange().getValues();
  const out = [];
  for (let i = 1; i < v.length; i++) {
    if (!v[i][0]) continue;
    try { out.push(JSON.parse(v[i][1])); } catch (e) { }
  }
  return out;
}
function find_(name, id) {
  return all_(name).filter(function (r) { return r.id === id; })[0] || null;
}
function save_(name, rec) {
  if (COLLS.indexOf(name) < 0) throw new Error('保存先が不正です');
  rec = rec || {};
  if (!rec.id) rec.id = Utilities.getUuid().slice(0, 8) + Date.now().toString(36);
  const sh = sheet_(name);
  const ids = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues();
  const json = JSON.stringify(rec);
  for (let i = 1; i < ids.length; i++) {
    if (ids[i][0] === rec.id) { sh.getRange(i + 1, 2, 1, 2).setValues([[json, now_()]]); return rec; }
  }
  sh.appendRow([rec.id, json, now_()]);
  return rec;
}
function remove_(name, id) {
  const sh = sheet_(name);
  const ids = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues();
  for (let i = ids.length - 1; i >= 1; i--) if (ids[i][0] === id) sh.deleteRow(i + 1);
}
function withLock_(fn) {
  const l = LockService.getScriptLock();
  l.waitLock(20000);
  try { return fn(); } finally { l.releaseLock(); }
}
function now_() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'); }
function split_(s) { return String(s || '').split(/[、,，]/).map(function (x) { return x.trim(); }).filter(String); }
function num_(v) { const x = Number(String(v == null ? '' : v).replace(/[,¥円\s]/g, '')); return isFinite(x) ? x : 0; }

function folder_() {
  const name = 'エクステージ現場管理_PDF';
  const it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}
function trash_(f) {
  try { if (f && f.fileId) DriveApp.getFileById(f.fileId).setTrashed(true); } catch (e) { }
}

/* ---------- 入口 ---------- */
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}
function doPost(e) {
  let out;
  try { out = route_(JSON.parse(e.postData.contents)); }
  catch (err) { out = { error: String((err && err.message) || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function route_(b) {
  const c = cfg_();
  const a = b.action;
  const pwOk = String(b.pw || '') === String(c.staffPassword);

  if (a === 'publicConfig') {
    return { config: { staffNames: split_(c.staffNames), managers: split_(c.managers), targetMargin: num_(c.targetMargin), fiscalEndMonth: num_(c.fiscalEndMonth), companyName: c.companyName } };
  }
  if (a === 'checkPw') return { ok: pwOk };
  if (a === 'login') {
    const nm = String(b.name || '').trim();
    if (!nm) return { error: '名前を入力してください' };
    if (b.role === 'staff' && !pwOk) return { error: 'パスワードが違います' };
    if (b.role !== 'staff' && b.role !== 'out') return { error: '区分が不正です' };
    withLock_(function () {
      if (b.role === 'staff') {
        const n = split_(cfg_().staffNames);
        if (n.indexOf(nm) < 0) { n.push(nm); setCfg_({ staffNames: n.join('、') }); }
      }
      save_('accesslog', { name: nm, role: b.role === 'staff' ? '社内' : '外注', at: now_() });
    });
    return { ok: true };
  }

  /* 外注・協力業者：現場名と自分の記録だけ */
  if (b.role === 'out') {
    const nm = String(b.name || '').trim();
    if (!nm) return { error: '名前がありません' };
    if (a === 'outData') {
      return {
        sites: all_('sites').filter(function (s) { return s.status !== '完了'; }).map(function (s) { return { id: s.id, name: s.name }; }),
        worklogs: all_('worklogs').filter(function (w) { return w.name === nm; }),
        invoices: all_('invoices').filter(function (v) { return v.name === nm; }).map(function (v) {
          return { id: v.id, siteId: v.siteId, siteName: v.siteName, date: v.date, subtotal: v.subtotal, total: v.total, memo: v.memo, status: v.status, sentAt: v.sentAt, fileName: v.file && v.file.fileName };
        })
      };
    }
    if (a === 'saveWorklog') {
      const r = b.rec || {};
      return {
        rec: withLock_(function () {
          if (r.id) { const old = find_('worklogs', r.id); if (!old || old.name !== nm) throw new Error('編集できません'); }
          const rec = { id: r.id, name: nm, siteId: String(r.siteId || ''), siteName: String(r.siteName || ''), date: String(r.date || ''), start: String(r.start || ''), end: String(r.end || ''), breakMin: num_(r.breakMin), work: String(r.work || ''), expenses: (r.expenses || []).map(function (x) { return { item: String(x.item || ''), amount: num_(x.amount) }; }), updatedAt: now_() };
          return save_('worklogs', rec);
        })
      };
    }
    if (a === 'removeWorklog') {
      withLock_(function () {
        const old = find_('worklogs', b.id);
        if (!old || old.name !== nm) throw new Error('削除できません');
        remove_('worklogs', b.id);
      });
      return { ok: true };
    }
    if (a === 'upload') return upload_(b, nm);
    if (a === 'saveInvoice') {
      const r = b.rec || {};
      if (!r.file || !r.file.fileId) return { error: '請求書のファイルがありません' };
      const inv = { name: nm, siteId: String(r.siteId || ''), siteName: String(r.siteName || ''), date: String(r.date || ''), subtotal: num_(r.subtotal), total: num_(r.total), memo: String(r.memo || ''), file: { fileId: String(r.file.fileId), fileName: String(r.file.fileName || ''), mime: String(r.file.mime || '') }, parsed: r.parsed || null, status: '新着', sentAt: now_() };
      return { rec: withLock_(function () { return save_('invoices', inv); }) };
    }
    if (a === 'withdrawInvoice') {
      let old;
      withLock_(function () {
        old = find_('invoices', b.id);
        if (!old || old.name !== nm || old.status !== '新着') throw new Error('取り下げできません');
        remove_('invoices', b.id);
      });
      trash_(old.file);
      return { ok: true };
    }
    return { error: '権限がありません' };
  }

  /* ここから社内のみ */
  if (b.role !== 'staff' || !pwOk) return { error: 'パスワードが違います' };

  if (a === 'all') {
    const o = {};
    COLLS.forEach(function (n) { o[n] = all_(n); });
    o.accesslog = o.accesslog.slice(-300);
    return { data: o, config: c };
  }
  if (a === 'save') return { rec: withLock_(function () { return save_(b.coll, b.rec); }) };
  if (a === 'saveMany') {
    return { recs: withLock_(function () { return (b.items || []).map(function (it) { return save_(it.coll, it.rec); }); }) };
  }
  if (a === 'remove') {
    if (COLLS.indexOf(b.coll) < 0) return { error: '削除先が不正です' };
    withLock_(function () { remove_(b.coll, b.id); });
    if (b.file) trash_(b.file);
    return { ok: true };
  }
  if (a === 'upload') return upload_(b, '');
  if (a === 'read') {
    const f = DriveApp.getFileById(b.fileId);
    const blob = f.getBlob();
    return { parsed: readDoc_(Utilities.base64Encode(blob.getBytes()), blob.getContentType()) };
  }
  if (a === 'getFile') {
    const f = DriveApp.getFileById(b.fileId);
    const blob = f.getBlob();
    return { b64: Utilities.base64Encode(blob.getBytes()), mime: blob.getContentType(), name: f.getName() };
  }
  if (a === 'saveConfig') {
    withLock_(function () { setCfg_(b.config || {}); });
    return { config: cfg_() };
  }
  return { error: '不明な操作です' };
}

/* ---------- ファイル ---------- */
function upload_(b, prefix) {
  const bytes = Utilities.base64Decode(b.b64 || '');
  if (!bytes.length) return { error: 'ファイルが空です' };
  if (bytes.length > MAX_BYTES) return { error: 'ファイルは8MBまでです' };
  const mime = String(b.mime || 'application/pdf');
  if (!/^application\/pdf$|^image\//.test(mime)) return { error: 'PDFか画像だけ送れます' };
  const name = (prefix ? prefix + '_' : '') + String(b.fileName || 'file');
  const f = folder_().createFile(Utilities.newBlob(bytes, mime, name));
  const out = { file: { fileId: f.getId(), fileName: f.getName(), mime: mime } };
  if (b.read) {
    try { out.parsed = readDoc_(b.b64, mime); }
    catch (e) { out.readError = String((e && e.message) || e); }
  }
  return out;
}

/* AI（Claude）で見積書・請求書の金額を読む */
function readDoc_(b64, mime) {
  const key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) throw new Error('PDF読取のAPIキーが未設定です');
  let block;
  if (mime === 'application/pdf') block = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } };
  else if (/^image\/(jpeg|png|gif|webp)$/.test(mime)) block = { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } };
  else throw new Error('この形式は読み取れません');
  const prompt = 'この書類（日本の見積書・請求書・契約書）から次の項目を読み取り、JSONだけを返してください。説明文は不要です。\n' +
    '{"kind":"見積書|請求書|契約書|その他","company":"書類を発行した会社名（宛先ではない）","date":"発行日 YYYY-MM-DD","subtotal":税抜の合計金額(数値),"tax":消費税額(数値),"total":税込の合計金額(数値),"title":"件名・工事名"}\n' +
    '金額はカンマや円記号を付けない数値。読めない項目はnull。';
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: cfg_().aiModel || DEFAULTS.aiModel, max_tokens: 800, messages: [{ role: 'user', content: [block, { type: 'text', text: prompt }] }] }),
    muteHttpExceptions: true
  });
  const j = JSON.parse(res.getContentText());
  if (res.getResponseCode() !== 200) throw new Error('読取エラー: ' + ((j.error && j.error.message) || res.getResponseCode()));
  const text = (j.content || []).map(function (x) { return x.text || ''; }).join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('読み取れませんでした');
  const p = JSON.parse(m[0]);
  ['subtotal', 'tax', 'total'].forEach(function (k) { p[k] = p[k] == null || p[k] === '' ? null : num_(p[k]); });
  if (p.subtotal == null && p.total != null && p.tax != null) p.subtotal = p.total - p.tax;
  if (p.total == null && p.subtotal != null && p.tax != null) p.total = p.subtotal + p.tax;
  return p;
}
