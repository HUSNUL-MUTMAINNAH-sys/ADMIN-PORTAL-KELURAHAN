(function () {
  'use strict';
  var CFG = window.ADMIN_CONFIG || {};
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };


  // ---- Skema konten (harus cocok dengan labels di web-publik/cms.js) ----
  function P(k, t, labels) {
    return { k: k, t: t, g: 'Data Prasarana', f: [{ k: 'nama', l: 'Nama ' + t, r: 1 }].concat(labels.map(function (l, i) { return { k: 'f' + (i + 1), l: l }; })) };
  }
  var SCHEMA = [
    { k: 'layanan_digital', t: 'Layanan Digital (Link)', g: 'Beranda', f: [{ k: 'judul', l: 'Judul', r: 1 }, { k: 'deskripsi', l: 'Deskripsi singkat' }, { k: 'url', l: 'Alamat link (https://…)', type: 'url', r: 1 }, { k: 'ikon', l: 'Ikon', type: 'icon' }] },
    { k: 'statistik', t: 'Statistik Penduduk', g: 'Beranda', f: [{ k: 'label', l: 'Label (mis. Guru)', r: 1 }, { k: 'jumlah', l: 'Jumlah (orang)', type: 'number', r: 1 }] },
    { k: 'pejabat', t: 'Pejabat (Carousel)', g: 'Beranda', f: [{ k: 'nama', l: 'Nama lengkap', r: 1 }, { k: 'jabatan', l: 'Jabatan', r: 1 }, { k: 'foto', l: 'Foto (rasio 3:4)', type: 'image' }] },
    { k: 'nomor_penting', t: 'Nomor Penting', g: 'Kontak', f: [{ k: 'nama', l: 'Nama instansi / layanan', r: 1 }, { k: 'nomor', l: 'Nomor telepon', r: 1 }] },
    P('posyandu', 'Posyandu', ['Lokasi', 'Pengelola', 'Tempat Kegiatan']),
    P('sekolah_dasar', 'Sekolah Dasar', ['Alamat', 'Naungan']),
    P('paud', 'PAUD', ['Alamat', 'Naungan']),
    P('umkm', 'UMKM', ['Alamat', 'Keterangan']),
    P('sma_smk', 'SMA/SMK', ['Alamat', 'Naungan']),
    P('kelompok_tani', 'Kelompok Tani', ['Alamat', 'Keterangan'])
  ];

  var sb, cur = null, rows = [], counts = {}, editing = null, q = '';

  function toast(m, bad) {
    var t = $('#toast'); t.textContent = m; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false;
    clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, 3200);
  }
  function fail(e) { console.error(e); toast((e && e.message) || 'Terjadi kesalahan', true); }
  function src(u) { return /^(https?:|data:)/.test(u || '') ? u : ((CFG.PUBLIC_URL || '').replace(/\/$/, '') + '/' + (u || '')); }
  function chk(r) { if (r.error) throw r.error; return r; }

  // ---- Boot ----
  if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY || !window.supabase) {
    document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif;max-width:560px;margin:auto"><h2>Konfigurasi belum diisi</h2><p style="margin-top:10px;line-height:1.6">Isi <code>SUPABASE_URL</code> dan <code>SUPABASE_ANON_KEY</code> di <code>config.js</code>, lalu deploy ulang. Lihat README.md.</p></div>';
    return;
  }
  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  sb.auth.onAuthStateChange(function (_e, s) { gate(s); });
  sb.auth.getSession().then(function (r) { gate(r.data.session); });

  var shown = null;
  function gate(session) {
    var id = session ? session.user.id : 'out';
    if (id === shown) return; shown = id;
    $('#login').hidden = !!session; $('#app').hidden = !session;
    if (session) { $('#who').textContent = session.user.email; $('#siteLink').href = CFG.PUBLIC_URL || '#'; buildNav(); go('home'); }
  }

  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault(); var f = e.target, b = f.querySelector('button'); b.disabled = true; $('#loginErr').textContent = '';
    sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value })
      .then(function (r) { if (r.error) $('#loginErr').textContent = 'Email atau kata sandi salah.'; })
      .catch(fail).then(function () { b.disabled = false; });
  });
  $('#logout').addEventListener('click', function () { sb.auth.signOut(); });
  $('#burger').addEventListener('click', function () { $('#side').classList.toggle('open'); });

  // ---- Navigasi ----
  function buildNav() {
    var h = '<a data-k="home">Ringkasan</a>', g = '';
    SCHEMA.forEach(function (s) {
      if (s.g !== g) { g = s.g; h += '<h4>' + esc(g) + '</h4>'; }
      h += '<a data-k="' + s.k + '">' + esc(s.t) + '<i data-c="' + s.k + '">' + (counts[s.k] == null ? '' : counts[s.k]) + '</i></a>';
    });
    $('#nav').innerHTML = h;
  }
  $('#nav').addEventListener('click', function (e) { var a = e.target.closest('a'); if (a) { go(a.dataset.k); $('#side').classList.remove('open'); } });

  function loadCounts() {
    return sb.from('konten').select('koleksi').then(chk).then(function (r) {
      counts = {}; r.data.forEach(function (x) { counts[x.koleksi] = (counts[x.koleksi] || 0) + 1; });
      document.querySelectorAll('#nav i').forEach(function (i) { i.textContent = counts[i.dataset.c] || 0; });
    });
  }
  function go(k) {
    document.querySelectorAll('#nav a').forEach(function (a) { a.classList.toggle('on', a.dataset.k === k); });
    q = ''; cur = SCHEMA.filter(function (s) { return s.k === k; })[0] || null;
    if (!cur) {
      $('#title').textContent = 'Ringkasan';
      loadCounts().then(function () {
        $('#view').innerHTML = '<div class="note">Perubahan yang disimpan di sini langsung tampil di situs publik (muat ulang halaman publik untuk melihatnya).</div><div class="grid">' +
          SCHEMA.map(function (s) { return '<div class="card stat" data-k="' + s.k + '"><b>' + (counts[s.k] || 0) + '</b><span>' + esc(s.t) + '</span></div>'; }).join('') + '</div>';
      }).catch(fail);
      return;
    }
    $('#title').textContent = cur.t; $('#view').innerHTML = '<div class="card"><div class="empty">Memuat…</div></div>';
    sb.from('konten').select('id,urutan,data').eq('koleksi', k).order('urutan').order('id').then(chk)
      .then(function (r) { rows = r.data; counts[k] = rows.length; draw(); }).catch(fail);
  }
  $('#view').addEventListener('click', function (e) {
    var c = e.target.closest('.stat'); if (c) return go(c.dataset.k);
    var b = e.target.closest('[data-a]'); if (!b) return;
    var i = +b.dataset.i, a = b.dataset.a;
    if (a === 'add') openForm(null); else if (a === 'edit') openForm(rows[i]);
    else if (a === 'del') del(rows[i]); else if (a === 'up') move(i, -1); else if (a === 'down') move(i, 1);
  });

  // ---- Daftar ----
  function summary(d) {
    return cur.f.filter(function (f, i) { return i > 0 && f.type !== 'image' && f.type !== 'icon' && d[f.k] !== '' && d[f.k] != null; })
      .map(function (f) { return '<span class="muted">' + esc(f.l) + ':</span> ' + esc(d[f.k]); }).join(' &nbsp;·&nbsp; ');
  }
  function draw() {
    var hasImg = cur.f.some(function (f) { return f.type === 'image' || f.type === 'icon'; }), t = q.toLowerCase();
    var body = rows.map(function (r, i) {
      if (t && JSON.stringify(r.data).toLowerCase().indexOf(t) < 0) return '';
      var d = r.data;
      return '<tr>' + (hasImg ? '<td>' + (d.foto ? '<img class="thumb" src="' + esc(src(d.foto)) + '" alt="">' : (cur.k === 'layanan_digital' ? '<span class="ico">' + (window.ICONS[d.ikon] || window.ICONS.i1) + '</span>' : '')) + '</td>' : '') +
        '<td><b>' + esc(d[cur.f[0].k]) + '</b></td><td>' + summary(d) + '</td><td class="act">' +
        '<button class="btn ghost sm" data-a="up" data-i="' + i + '" title="Naik">↑</button> <button class="btn ghost sm" data-a="down" data-i="' + i + '" title="Turun">↓</button> ' +
        '<button class="btn ghost sm" data-a="edit" data-i="' + i + '">Ubah</button> <button class="btn danger sm" data-a="del" data-i="' + i + '">Hapus</button></td></tr>';
    }).join('');
    $('#view').innerHTML = '<div class="card"><div class="bar"><input id="q" placeholder="Cari…" value="' + esc(q) + '"><span class="sp muted">' + rows.length + ' data</span>' +
      '<button class="btn primary" data-a="add">+ Tambah</button></div>' +
      (rows.length ? '<div class="wrap"><table><thead><tr>' + (hasImg ? '<th></th>' : '') + '<th>' + esc(cur.f[0].l) + '</th><th>Detail</th><th></th></tr></thead><tbody>' + body + '</tbody></table></div>'
        : '<div class="empty">Belum ada data. Klik “Tambah” untuk mulai.</div>') + '</div>';
    var qi = $('#q'); qi.addEventListener('input', function () { q = qi.value; var p = qi.selectionStart; draw(); var n = $('#q'); n.focus(); n.setSelectionRange(p, p); });
  }

  // ---- Form tambah/ubah ----
  function openForm(r) {
    editing = r; var d = r ? r.data : {};
    $('#dlgTitle').textContent = (r ? 'Ubah ' : 'Tambah ') + cur.t;
    $('#fields').innerHTML = cur.f.map(function (f) {
      if (f.type === 'icon') return '<div class="lbl">' + esc(f.l) + '<input type="hidden" name="' + f.k + '" value="' + esc(d[f.k] || 'i1') + '"><div class="icons" id="icons">' + Object.keys(window.ICONS).map(function (k) { return '<button type="button" data-i="' + k + '" class="' + (k === (d[f.k] || 'i1') ? 'on' : '') + '">' + window.ICONS[k] + '</button>'; }).join('') + '</div></div>';
      if (f.type === 'image') return '<label>' + esc(f.l) + '<div class="imgf"><img id="prev" alt="" src="' + esc(d[f.k] ? src(d[f.k]) : '') + '"' + (d[f.k] ? '' : ' hidden') + '><div><input type="hidden" name="' + f.k + '" value="' + esc(d[f.k] || '') + '"><input type="file" id="file" accept="image/*"><small class="muted">Foto dikompres otomatis.</small></div></div></label>';
      return '<label>' + esc(f.l) + '<input name="' + f.k + '" type="' + (f.type || 'text') + '"' + (f.type === 'number' ? ' min="0" step="1"' : '') + (f.r ? ' required' : '') + ' value="' + esc(d[f.k] == null ? '' : d[f.k]) + '"></label>';
    }).join('');
    var ic = $('#icons');
    if (ic) ic.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; $('input[name=ikon]').value = b.dataset.i; ic.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); });
    var file = $('#file');
    if (file) file.addEventListener('change', upload);
    $('#dlg').showModal();
  }
  $('#cancel').addEventListener('click', function () { $('#dlg').close(); });

  function compress(file) {
    return createImageBitmap(file).then(function (bm) {
      var s = Math.min(1, 900 / Math.max(bm.width, bm.height)), c = document.createElement('canvas');
      c.width = Math.round(bm.width * s); c.height = Math.round(bm.height * s);
      var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bm, 0, 0, c.width, c.height);
      return new Promise(function (ok) { c.toBlob(ok, 'image/jpeg', 0.85); });
    });
  }
  function upload(e) {
    var f = e.target.files[0]; if (!f) return; var sv = $('#save'); sv.disabled = true;
    compress(f).then(function (blob) {
      var path = cur.k + '/' + Date.now() + '.jpg';
      return sb.storage.from('foto').upload(path, blob, { contentType: 'image/jpeg', upsert: false }).then(chk).then(function () {
        var url = sb.storage.from('foto').getPublicUrl(path).data.publicUrl;
        $('input[name=foto]').value = url; var p = $('#prev'); p.src = url; p.hidden = false; toast('Foto terunggah');
      });
    }).catch(fail).then(function () { sv.disabled = false; });
  }
  $('#form').addEventListener('submit', function (e) {
    e.preventDefault(); var fd = new FormData(e.target), data = {}, sv = $('#save'); sv.disabled = true;
    cur.f.forEach(function (f) { var v = fd.get(f.k); v = v == null ? '' : String(v).trim(); data[f.k] = f.type === 'number' ? Number(v || 0) : v; });
    var op = editing
      ? sb.from('konten').update({ data: data, updated_at: new Date().toISOString() }).eq('id', editing.id)
      : sb.from('konten').insert({ koleksi: cur.k, urutan: rows.length ? rows[rows.length - 1].urutan + 1 : 0, data: data });
    op.then(chk).then(function () { $('#dlg').close(); toast('Tersimpan'); go(cur.k); }).catch(fail).then(function () { sv.disabled = false; });
  });

  function del(r) {
    if (!confirm('Hapus “' + r.data[cur.f[0].k] + '”? Tindakan ini tidak dapat dibatalkan.')) return;
    sb.from('konten').delete().eq('id', r.id).then(chk).then(function () { toast('Dihapus'); go(cur.k); }).catch(fail);
  }
  function move(i, d) {
    var j = i + d; if (j < 0 || j >= rows.length) return;
    var t = rows[i]; rows[i] = rows[j]; rows[j] = t;
    Promise.all(rows.map(function (r, n) { return r.urutan === n ? 0 : sb.from('konten').update({ urutan: n }).eq('id', r.id).then(chk); }))
      .then(function () { rows.forEach(function (r, n) { r.urutan = n; }); draw(); }).catch(function (e) { fail(e); go(cur.k); });
  }
})();
