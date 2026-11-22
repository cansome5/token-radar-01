(function () {
  'use strict';
  var R = window.RADAR;
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var money = function (n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    var a = Math.abs(n);
    if (a >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n).toLocaleString('en-US');
  };
  var full = function (n) { return n === null || n === undefined ? '—' : '$' + Math.round(n).toLocaleString('en-US'); };
  var pct = function (n, digits) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(digits === undefined ? 1 : digits) + '%';
  };
  var mult = function (n, digits) { return n === null || n === undefined ? '—' : '×' + n.toFixed(digits === undefined ? 2 : digits); };
  var verdict = function (v) { return '<span class="verdict ' + esc(v) + '">' + esc(v) + '</span>'; };

  if (!R) {
    document.body.innerHTML = '<p style="padding:30px;font:14px monospace;color:#ef6a6a">data.js did not load: serve the output directory (out/) so dashboard/index.html can read ../data.js.</p>';
    return;
  }

  // ------------------------------------------------------------ cover: KPI + integrity
  var r4 = R.ladder.filter(function (x) { return x.key === '4'; })[0] || R.ladder[R.ladder.length - 1];
  var kpi = [
    { k: 'Ranked rows', v: String(R.kpi.rows), s: R.counts.protocols + ' protocols read', accent: true },
    { k: 'Watchlist covered', v: R.kpi.watchlist_covered + '/' + R.counts.watchlist, s: 'the house floor, never the ceiling' },
    { k: 'R4 holdout error', v: R.kpi.loo_median_error.toFixed(2) + 'x', s: 'leave-one-out median; 3x hit ' + (r4.loo.hit3 * 100).toFixed(0) + '%' },
    { k: 'Farm calls', v: R.kpi.farm + ' / ' + R.kpi.thin + ' / ' + R.kpi.skip, s: 'FARM / THIN / SKIP' },
    { k: 'Total implied value', v: money(R.kpi.total_implied_usd), s: 'sum of the R4 claims' },
  ];
  $('#kpi').innerHTML = kpi.map(function (x) {
    return '<div class="kpi' + (x.accent ? ' accent' : '') + '"><span class="k">' + esc(x.k) + '</span><span class="v">' + esc(x.v) + '</span><span class="s">' + esc(x.s) + '</span></div>';
  }).join('');
  $('#integrity').innerHTML = R.integrity.map(function (c) {
    return '<span class="check' + (c.ok ? '' : ' fail') + '" title="' + esc(c.detail) + '"><span class="mark">' + (c.ok ? '✓' : '✗') + '</span>' + esc(c.label) + '</span>';
  }).join('') + '<span class="check" title="the page reads the same board.json the model wrote"><span class="mark">✓</span>' + R.rows.length + ' rows in page data</span>';
  var cov = R.coverage;
  $('#coverage-strip').innerHTML = 'Interval coverage (true market cap inside [low, high]): ' +
    '<b>leave-one-out ' + cov.loo.inside + '/' + cov.loo.n + ' (' + (cov.loo.share * 100).toFixed(1) + '%)</b>' +
    '<span class="sep">·</span><b>older-to-newer ' + cov.oot.inside + '/' + cov.oot.n + ' (' + (cov.oot.share * 100).toFixed(1) + '%)</b>' +
    '<span class="sep">·</span>spread ' + cov.loo.spread_young.toFixed(2) + 'x young / ' + cov.loo.spread_older.toFixed(2) + 'x older';

  // ------------------------------------------------------------ state and filters
  var watch = {};
  R.watchlist_slugs.forEach(function (s) { watch[s] = true; });
  var state = { q: '', cat: '', chain: '', scope: '', key: 'rank', dir: 1 };
  var cats = {};
  var chains = {};
  R.rows.forEach(function (r) {
    cats[r.category || 'Uncategorised'] = true;
    r.chains.forEach(function (c) { chains[c] = true; });
  });
  var catNames = Object.keys(cats).sort();
  var chainNames = Object.keys(chains).sort();
  catNames.forEach(function (c) { $('#cat').insertAdjacentHTML('beforeend', '<option value="' + esc(c) + '">' + esc(c) + '</option>'); });
  chainNames.forEach(function (c) { $('#chain').insertAdjacentHTML('beforeend', '<option value="' + esc(c) + '">' + esc(c) + '</option>'); });

  function filtered() {
    var q = state.q.toLowerCase();
    return R.rows.filter(function (r) {
      if (state.cat && (r.category || 'Uncategorised') !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (state.scope === 'watch' && !watch[r.slug]) return false;
      if (state.scope === 'early' && watch[r.slug]) return false;
      if (!q) return true;
      return (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase().indexOf(q) >= 0;
    });
  }

  function sortRows(rows) {
    var key = state.key;
    var dir = state.dir;
    return rows.slice().sort(function (a, b) {
      var x = a[key], y = b[key];
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      if (typeof x === 'string') return x.localeCompare(y) * dir;
      return (x - y) * dir;
    });
  }

  function delta(n) {
    if (n === null || n === undefined) return '<span class="delta flat">—</span>';
    var cls = n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
    return '<span class="delta ' + cls + '">' + esc(pct(n)) + '</span>';
  }

  function renderBoard() {
    var rows = sortRows(filtered());
    $('#shown').textContent = rows.length + ' of ' + R.rows.length + ' rows';
    $('#rows').innerHTML = rows.map(function (r) {
      var top = r.chains.slice(0, 3).map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('');
      var extra = r.chains.length > 3 ? '<span class="chip">+' + (r.chains.length - 3) + '</span>' : '';
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="rank num">' + r.rank + '</td>' +
        '<td class="proto"><strong>' + esc(r.name) + '</strong><span>' + esc(r.slug) + (r.kin_discount < 1 ? ' · kin' : '') + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td><div class="chips">' + top + extra + '</div></td>' +
        '<td class="money num">' + money(r.tvl_usd) + '</td>' +
        '<td class="money num">' + money(r.implied_value_usd) + '</td>' +
        '<td class="range num">' + money(r.implied_low_usd) + ' – ' + money(r.implied_high_usd) + '</td>' +
        '<td class="num">' + delta(r.change_7d) + '</td>' +
        '<td>' + verdict(r.verdict) + '</td>' +
      '</tr>';
    }).join('');
    Array.prototype.forEach.call($('#rows').querySelectorAll('tr'), function (tr) {
      var open = function () { openDetail(tr.getAttribute('data-slug')); };
      tr.tabIndex = 0;
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });
    var active = document.querySelector('#board th.sortable.on');
    if (active) active.setAttribute('aria-sort', state.dir === 1 ? 'ascending' : 'descending');
  }
  var firstHeader = document.querySelector('#board th.sortable');
  if (firstHeader) firstHeader.classList.add('on');

  $('#q').addEventListener('input', function (e) { state.q = e.target.value.trim(); renderBoard(); });
  $('#cat').addEventListener('change', function (e) { state.cat = e.target.value; renderBoard(); });
  $('#chain').addEventListener('change', function (e) { state.chain = e.target.value; renderBoard(); });
  $('#scope').addEventListener('change', function (e) { state.scope = e.target.value; renderBoard(); });
  Array.prototype.forEach.call(document.querySelectorAll('#board th.sortable'), function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-key');
      if (state.key === key) state.dir = -state.dir;
      else { state.key = key; state.dir = key === 'rank' || key === 'name' || key === 'category' ? 1 : -1; }
      Array.prototype.forEach.call(document.querySelectorAll('#board th.sortable'), function (x) {
        x.classList.remove('on');
        x.removeAttribute('aria-sort');
      });
      th.classList.add('on');
      renderBoard();
    });
  });

  // ------------------------------------------------------------ detail dialog
  var bySlug = {};
  R.rows.forEach(function (r) { bySlug[r.slug] = r; });

  function openDetail(slug) {
    var r = bySlug[slug];
    if (!r) return;
    $('#detail-eyebrow').textContent = 'Rank ' + r.rank + ' · ' + (r.category || 'Uncategorised') + ' · ' + r.playbook + ' playbook';
    $('#detail-name').textContent = r.name;
    var facts = [
      ['TVL', money(r.tvl_usd)],
      ['7d TVL change', r.change_7d === null ? 'not reported' : pct(r.change_7d)],
      ['Age', r.age_known ? r.age_days + ' days' : 'unknown'],
      ['Cheapest chain', r.gas_chain],
      ['Sector factor', mult(r.sector_mult)],
      ['Growth factor', mult(r.growth_mult)],
      ['Age factor', mult(r.age_mult)],
      ['Kin discount', r.kin_discount < 1 ? '0.25' : 'none'],
    ].map(function (f) {
      return '<div class="fact"><div class="k">' + esc(f[0]) + '</div><div class="v">' + esc(f[1]) + '</div></div>';
    }).join('');
    var econRows = [
      ['Plan capital', full(r.capital_usd)],
      ['Holding window', r.holding_days + ' days'],
      ['Reader note dollar-days', money(r.capital_usd * r.holding_days)],
      ['Eligible dollar-days (TVL × ' + r.holding_days + 'd)', money(r.tvl_usd * r.holding_days)],
      ['Airdrop slice at 10%', full(r.slice_usd) + ' (' + full(r.slice_low_usd) + '–' + full(r.slice_high_usd) + ' at the holdout bounds)'],
      ['Total fees, eight steps', full(r.fees_usd)],
      ['Foregone 4% yield', full(r.foregone_usd)],
    ];
    var netCls = r.net_usd > 0 ? 'var(--green)' : r.net_usd < 0 ? 'var(--red)' : 'var(--mute)';
    var body = '' +
      '<div class="bigval"><span class="v">' + full(r.implied_value_usd) + '</span>' +
      '<span class="r">holdout range ' + full(r.implied_low_usd) + ' – ' + full(r.implied_high_usd) + ' · R4 fit on the snapshot\'s tokenized peers</span></div>' +
      '<div class="facts">' + facts + '</div>' +
      '<div class="econ"><div class="econhead">' + verdict(r.verdict) +
      '<span class="net" style="color:' + netCls + '">net ' + (r.net_usd > 0 ? '+' : '') + full(r.net_usd) + '</span>' +
      '<span style="color:var(--mute);font:11px/1.3 var(--mono)">' + r.minutes + ' plan minutes · ' + full(r.per_hour_usd) + '/hour · break-even note ' + (r.break_even_usd === null ? 'not reachable' : full(r.break_even_usd)) + '</span></div>' +
      '<table class="econ-line">' + econRows.map(function (e) { return '<tr><td>' + esc(e[0]) + '</td><td class="num">' + esc(e[1]) + '</td></tr>'; }).join('') +
      '<tr class="total"><td>Net = slice − fees − foregone yield</td><td class="num" style="color:' + netCls + '">' + (r.net_usd > 0 ? '+' : '') + full(r.net_usd) + '</td></tr>' +
      '<tr><td>Net at the range bounds</td><td class="num">' + full(r.net_low_usd) + ' – ' + full(r.net_high_usd) + '</td></tr>' +
      '</table></div>' +
      (r.kin_discount < 1 ? '<p class="kinnote">Kin discount applied: this name shares a stem with a tokenized family, so its modelled value is multiplied by 0.25.</p>' : '') +
      '<div class="cardtitle" style="margin-top:16px">Eight costed steps</div>' +
      '<ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    $('#detail-body').innerHTML = body;
    var d = $('#detail');
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
  }
  var closeDetail = function () { var d = $('#detail'); if (d.open && typeof d.close === 'function') d.close(); };
  $('#detail-close').addEventListener('click', closeDetail);
  $('#detail').addEventListener('click', function (e) { if (e.target === $('#detail')) closeDetail(); });

  // ------------------------------------------------------------ live view
  $('#live-rows').innerHTML = R.live.map(function (t, i) {
    return '<tr>' +
      '<td class="rank num">' + (i + 1) + '</td>' +
      '<td class="proto"><strong>' + esc(t.name) + '</strong><span>' + esc(t.slug) + '</span></td>' +
      '<td>' + esc(t.category || '—') + '</td>' +
      '<td class="money num">' + money(t.mcap_usd) + '</td>' +
      '<td class="money num">' + money(t.tvl_usd) + '</td>' +
      '<td class="money num">' + (t.multiple > 0 ? t.multiple.toFixed(2) + 'x' : '—') + '</td>' +
      '<td class="num">' + delta(t.change_7d) + '</td>' +
      '<td>' + esc(t.listed_at || 'not recorded') + '</td>' +
    '</tr>';
  }).join('');

  // ------------------------------------------------------------ ledger
  $('#ledger').innerHTML = R.ledger.groups.map(function (g) {
    return '<div class="led"><div class="n">' + g.count + '</div><div class="t">' + esc(g.label) + '</div><div class="r">' + esc(g.reason) + '</div><div class="s">' + esc(g.samples.join(', ')) + (g.count > g.samples.length ? ' …' : '') + '</div></div>';
  }).join('') + '<div class="led"><div class="n">' + R.ledger.total + '</div><div class="t">All protocols</div><div class="r">Each of the snapshot\'s protocols is in exactly one group above.</div><div class="s">ranked + kin rows are the board</div></div>';

  // ------------------------------------------------------------ method
  var bestLoo = Math.min.apply(null, R.ladder.map(function (x) { return x.loo.median_error; }));
  $('#ladder').innerHTML = '<table class="math"><thead><tr><th>Rung</th><th class="num">LOO err</th><th class="num">LOO 3x</th><th class="num">OOT err</th><th class="num">OOT 3x</th><th class="num">n</th></tr></thead><tbody>' +
    R.ladder.map(function (x) {
      return '<tr class="' + (x.loo.median_error === bestLoo ? 'best' : '') + '"><td>' + esc(x.label) + '</td><td class="num">' + x.loo.median_error.toFixed(2) + 'x</td><td class="num">' + (x.loo.hit3 * 100).toFixed(0) + '%</td><td class="num">' + x.oot.median_error.toFixed(2) + 'x</td><td class="num">' + (x.oot.hit3 * 100).toFixed(0) + '%</td><td class="num">' + x.loo.n + '/' + x.oot.n + '</td></tr>';
    }).join('') + '</tbody></table>';
  var covm = R.coverage;
  $('#coverage').innerHTML = '<table class="math"><tbody>' +
    '<tr><td>Leave-one-out</td><td class="num">' + covm.loo.inside + '/' + covm.loo.n + ' (' + (covm.loo.share * 100).toFixed(0) + '%)</td></tr>' +
    '<tr><td>Older-to-newer</td><td class="num">' + covm.oot.inside + '/' + covm.oot.n + ' (' + (covm.oot.share * 100).toFixed(0) + '%)</td></tr>' +
    '<tr><td>Spread, young (&lt;540d)</td><td class="num">' + covm.loo.spread_young.toFixed(2) + 'x</td></tr>' +
    '<tr><td>Spread, older (≥540d)</td><td class="num">' + covm.loo.spread_older.toFixed(2) + 'x</td></tr>' +
    '<tr><td>Interval</td><td class="num">implied ÷ spread … implied × spread</td></tr>' +
    '</tbody></table>';
  $('#constants').innerHTML = '<table class="math"><tbody>' +
    '<tr><td>Fit slope b</td><td class="num">' + R.model.slope.toFixed(4) + '</td></tr>' +
    '<tr><td>Intercept a</td><td class="num">' + R.model.intercept.toFixed(4) + '</td></tr>' +
    '<tr><td>Flat multiple</td><td class="num">' + R.model.multiple.toFixed(4) + 'x</td></tr>' +
    '<tr><td>Fitted peers</td><td class="num">' + R.counts.peers + ' of ' + R.counts.tokenized + ' tokenized</td></tr>' +
    '<tr><td>Families / certificates</td><td class="num">' + R.counts.families + ' / ' + R.counts.certificates_excluded + '</td></tr>' +
    '<tr><td>Growth median</td><td class="num">' + (R.model.growth_median === null ? '—' : pct(R.model.growth_median, 2)) + '</td></tr>' +
    '<tr><td>Age slope (¼)</td><td class="num">' + R.model.age_slope.toFixed(4) + '</td></tr>' +
    '<tr><td>Sector categories</td><td class="num">' + R.model.sector_n + '</td></tr>' +
    '</tbody></table>';
  $('#assumptions').innerHTML = R.assumptions.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('');
  $('#gas').innerHTML = R.gas.map(function (g) { return '<span class="gaschip">' + esc(g.chain) + ' <b>$' + g.usd_per_tx.toFixed(2) + '</b></span>'; }).join('');

  // ------------------------------------------------------------ tabs and footer
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (btn) {
    btn.addEventListener('click', function () {
      var view = btn.getAttribute('data-view');
      Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (x) { x.classList.toggle('on', x === btn); });
      Array.prototype.forEach.call(document.querySelectorAll('.view'), function (v) { v.hidden = v.id !== 'view-' + view; });
    });
  });
  $('#foot').textContent = 'Snapshot ' + R.as_of + ' · floor ' + money(R.floor_usd) + ' · board is the R4 model, never a prediction of issuance';

  renderBoard();
})();
