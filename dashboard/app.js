// Token Radar dashboard. It renders window.RADAR (written beside dashboard/ by main.ts): the calibrated
// board, a live-token market comparison and the method with its full calibration table. No network:
// every byte shown ships in data.js, and no protocol name is special-cased by the model or the page.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var M = DATA.model;
  var app = document.getElementById('app');
  var state = { tab: 'board', q: '', category: 'all', chain: 'all', scope: 'all', sort: 'implied', dir: -1, lsort: 'mcap', ldir: -1, selected: null };
  var countEl = null;
  var boardSlot = null;

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return n === null || n === undefined ? '—' : n.toFixed(4) + 'x'; }
  function dash(v) { return v === null || v === undefined || v === '' ? '—' : String(v); }
  function catOf(r) { return r.category || 'Uncategorised'; }

  function basisText(basis, clamped) {
    var t = basis === 'category' ? 'Category median of tokenized peers'
      : basis === 'global' ? 'Global fallback: fewer than ' + M.min_category_peers + ' category peers'
      : 'Neutral ' + M.neutral_multiple.toFixed(2) + 'x: no tokenized peers on record';
    return clamped ? t + '; clamped to [' + M.multiple_floor + ', ' + M.multiple_cap + ']' : t;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var p = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (p.get('tab')) state.tab = p.get('tab');
    if (p.get('q')) state.q = p.get('q');
    if (p.get('category')) state.category = p.get('category');
    if (p.get('chain')) state.chain = p.get('chain');
    if (p.get('scope')) state.scope = p.get('scope');
    if (p.get('p')) state.selected = p.get('p');
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.tab !== 'board') p.set('tab', state.tab);
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.scope !== 'all') p.set('scope', state.scope);
    if (state.selected) p.set('p', state.selected);
    var s = p.toString();
    window.history.replaceState(null, '', s ? '#' + s : window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.scope === 'watchlist' && !r.on_watchlist) return false;
      if (state.scope === 'early' && r.on_watchlist) return false;
      if (state.category !== 'all' && catOf(r) !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (q && (r.name + ' ' + r.slug).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function sortRows(list, key, dir) {
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' + (state.tab === 'live' ? ' live' : '') }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: DATA.source }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function nav() {
    function tab(id, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === id ? 'true' : 'false', text: label, onclick: function () { state.tab = id; writeHash(); render(); } });
    }
    return el('nav', { class: 'nav', 'aria-label': 'Views' }, tab('board', 'Ranked board'), tab('live', 'Live tokens'), tab('method', 'Method & calibration'));
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by calibrated implied value' }),
        el('p', { text: 'Each category base multiple is the median market-cap/TVL of the snapshot\'s own tokenized peers, clamped and disclosed. The early radar adds ' + DATA.early_size + ' pre-token protocols below the $' + Math.round(DATA.floor_usd / 1e6) + 'M watchlist floor, picked by implied value rather than TVL alone. Implied value is a model estimate, not a price or a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live tokens set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function uniqueValues(rows, key) {
    var set = {};
    rows.forEach(function (r) {
      var v = r[key];
      if (v === null || v === undefined) return;
      if (key === 'chains') v.forEach(function (c) { set[c] = 1; });
      else set[v] = 1;
    });
    return Object.keys(set).sort();
  }

  function select(id, label, options, current, onchange) {
    var sel = el('select', { id: id, 'aria-label': label },
      el('option', { value: 'all', text: label }),
      options.map(function (v) { return el('option', { value: v, text: v, selected: v === current ? 'selected' : null }); })
    );
    sel.addEventListener('change', function () { onchange(sel.value); writeHash(); refreshBoard(); });
    return el('div', { class: 'field' }, el('label', { for: id, text: label }), sel);
  }

  function controls() {
    var search = el('input', { class: 'search', type: 'search', id: 'q', placeholder: 'Search name or slug', value: state.q, 'aria-label': 'Search name or slug' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); refreshBoard(); });
    function seg(id, options) {
      return el('div', { class: 'seg', role: 'group', 'aria-label': id }, options.map(function (o) {
        return el('button', { type: 'button', 'aria-pressed': state.scope === o.v ? 'true' : 'false', text: o.t, onclick: function () { state.scope = o.v; writeHash(); refreshBoard(); } });
      }));
    }
    var cats = uniqueValues(DATA.rows, 'category');
    if (DATA.rows.some(function (r) { return r.category === null; }) && cats.indexOf('Uncategorised') < 0) cats.push('Uncategorised');
    countEl = el('span', { class: 'count', text: filteredRows().length + ' of ' + DATA.rows.length + ' rows' });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      select('category', 'Category', cats, state.category, function (v) { state.category = v; }),
      select('chain', 'Chain', uniqueValues(DATA.rows, 'chains'), state.chain, function (v) { state.chain = v; }),
      el('div', { class: 'field' }, el('label', { text: 'Board scope' }), seg('scope', [{ v: 'all', t: 'All' }, { v: 'watchlist', t: 'Watchlist' }, { v: 'early', t: 'Early' }])),
      countEl
    );
  }

  function sortHead(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' || key === 'rank' ? 1 : -1; } refreshBoard(); } },
        label, state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardView() {
    var list = sortRows(filteredRows(), state.sort, state.dir);
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches those filters' }),
        el('p', { text: 'Clear the search or pick another category, chain or scope.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.scope = 'all'; writeHash(); render(); } })
      ));
    }
    var max = 1;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var gc = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var badge = r.on_watchlist ? el('span', { class: 'badge watch' }, el('span', { class: 'dot' }), 'watchlist') : el('span', { class: 'badge early' }, el('span', { class: 'dot' }), 'early');
      tbody.appendChild(el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false', tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: catOf(r) + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'chain unnamed') })), badge),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + gc, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })))
      ));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { class: 'sub', text: 'Pre-token protocols, strongest calibrated implied value first. Select a row for the model breakdown and six-step farm plan. Ranks are fixed by implied value; sorting the table never changes them.' }),
        el('thead', null, el('tr', null,
          sortHead('rank', 'Rank'), sortHead('name', 'Protocol'), sortHead('tvl', 'TVL'),
          sortHead('growth', '7d'), sortHead('age', 'Age'), sortHead('implied', 'Implied value'))),
        tbody)));
  }

  function refreshBoard() {
    if (countEl) countEl.textContent = filteredRows().length + ' of ' + DATA.rows.length + ' rows';
    if (boardSlot) {
      while (boardSlot.firstChild) boardSlot.removeChild(boardSlot.firstChild);
      boardSlot.appendChild(boardView());
    }
  }

  function liveSort(list) {
    var key = state.lsort, dir = state.ldir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'ratio') { av = a.mcap_tvl_ratio === null ? -Infinity : a.mcap_tvl_ratio; bv = b.mcap_tvl_ratio === null ? -Infinity : b.mcap_tvl_ratio; }
      else { av = a.mcap_usd === null ? -Infinity : a.mcap_usd; bv = b.mcap_usd === null ? -Infinity : b.mcap_usd; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function liveView() {
    var list = liveSort(DATA.live);
    var tbody = el('tbody');
    list.forEach(function (r) {
      var gc = r.change_7d === null || r.change_7d === undefined ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      tbody.appendChild(el('tr', { tabindex: '0' },
        el('td', null, el('span', { class: 'badge norank' }, el('span', { class: 'dot' }), 'NOT ranked')),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: catOf(r) + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'chain unnamed') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + gc, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: fmtMult(r.mcap_tvl_ratio) })));
    });
    function lhead(key, label) {
      return el('th', { scope: 'col' }, el('button', { type: 'button', onclick: function () { if (state.lsort === key) state.ldir = -state.ldir; else { state.lsort = key; state.ldir = key === 'name' ? 1 : -1; } render(); } },
        label, state.lsort === key ? el('span', { 'aria-hidden': 'true', text: state.ldir < 0 ? ' v' : ' ^' }) : null));
    }
    return [
      el('div', { class: 'banner', role: 'note' }, el('b', { text: 'Market comparison only' }), el('span', { text: 'These ' + DATA.live.length + ' protocols already trade, so their market cap is a fact, not a model output. They are deliberately NOT ranked and never enter the pre-token board or its implied values.' })),
      el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'The largest tokenized protocols by market cap, with the observed mcap/TVL multiple that calibrates the ranked board.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), lhead('name', 'Protocol'), lhead('tvl', 'TVL'), lhead('growth', '7d'), lhead('mcap', 'Market cap'), lhead('ratio', 'mcap / TVL'))),
          tbody)))
    ];
  }

  function kv(k, v) { return el('div', null, el('span', { text: k }), el('b', { class: 'num', text: v })); }

  function methodView() {
    var g = DATA.calibration.global;
    var topRisk = DATA.rows.filter(function (r) { return r.category === 'Risk Curators'; })[0];
    var topAlloc = DATA.rows.filter(function (r) { return r.category === 'Onchain Capital Allocator'; })[0];
    var calRows = DATA.calibration.categories.map(function (c) {
      return el('tr', null,
        el('td', null, el('b', { text: c.category })),
        el('td', { class: 'num', text: String(c.peers) }),
        el('td', { class: 'num', text: fmtMult(c.median_multiple) }),
        el('td', { class: 'num', text: fmtMult(c.applied_multiple) }),
        el('td', { class: 'sub', text: c.clamped ? basisText(c.basis, true) : basisText(c.basis, false) }));
    });
    return el('div', { class: 'method' },
      el('section', { class: 'note', role: 'note' },
        el('h2', { text: 'Read this first: the global fallback' }),
        el('p', { text: 'A category with fewer than ' + M.min_category_peers + ' tokenized peers has no median of its own, so its rows inherit the global median (' + fmtMult(g.applied_multiple) + ', from ' + g.peers + ' tokenized non-CEX peers). On this board that covers the top-ranked Risk Curators protocol, ' + (topRisk ? topRisk.name : 'the first Risk Curators row') + ', and the top-ranked Onchain Capital Allocator protocol, ' + (topAlloc ? topAlloc.name : 'the first Onchain Capital Allocator row') + ', because those two categories hold only one and two tokenized peers. Both therefore use the global multiple rather than a category median; every detail dialog repeats the basis for the protocol it shows.' })),
      el('section', { class: 'panel' },
        el('h2', { text: 'How implied value is computed' }),
        el('p', { text: 'One function scores every row from the snapshot\'s own figures; no protocol name is special-cased. Tokenized peers are protocols with both market cap and TVL positive, excluding CEXs. A category multiple is the median of its peers\' mcap/TVL ratios, clamped to the stated range.' }),
        el('div', { class: 'formula', html:
          'catMultiple = clamp( median(mcap_usd / tvl_usd) of the category\'s tokenized peers, [' + M.multiple_floor + ', ' + M.multiple_cap + '] )<br>' +
          'categories with fewer than ' + M.min_category_peers + ' peers take the global median (' + g.peers + ' global peers, median ' + fmtMult(g.median_multiple) + (g.clamped ? ', clamped' : '') + ')<br>' +
          'growthMult = 1 + ( clamp(change_7d, ' + M.growth_floor + ', ' + M.growth_cap + ') / 100 ) x ' + M.growth_weight + '<br>' +
          'maturityMult = ' + M.maturity_floor + ' + ( min(age_days, ' + M.maturity_days + ') / ' + M.maturity_days + ' ) x ' + M.maturity_range + ' &nbsp; <span class="out">unknown age uses ' + M.unknown_age_days + ' days, never an invented date</span><br>' +
          '<span class="out">implied_value_usd = max(1, round( tvl_usd x catMultiple x growthMult x maturityMult ))</span>' }),
        el('div', { class: 'kv' },
          kv('Multiple clamp', '[' + M.multiple_floor + 'x, ' + M.multiple_cap + 'x]'),
          kv('Min category peers', String(M.min_category_peers)),
          kv('Neutral fallback', M.neutral_multiple.toFixed(2) + 'x'),
          kv('Growth weight', 'x' + M.growth_weight),
          kv('Growth clamp', M.growth_floor + '% to ' + M.growth_cap + '%'),
          kv('Maturity floor', String(M.maturity_floor)),
          kv('Maturity range', String(M.maturity_range)),
          kv('Maturity horizon', M.maturity_days + ' days'),
          kv('Unknown age', M.unknown_age_days + ' days'),
          kv('Target board size', String(M.target_board_size)),
          kv('Live comparison rows', String(M.live_rows)),
          kv('Global peers', String(g.peers)),
          kv('Global median', fmtMult(g.median_multiple)),
          kv('Global applied', fmtMult(g.applied_multiple)))),
      el('section', { class: 'panel' },
        el('h2', { text: 'Category calibration table' }),
        el('p', { text: 'Every category present among the snapshot\'s tokenized protocols, with the peer count behind each median. "Applied" is the multiple actually used on that category\'s board rows; the Basis column names the global fallback wherever the category had fewer than ' + M.min_category_peers + ' peers.' }),
        el('div', { class: 'calib-wrap' }, el('table', { class: 'calib' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Peers' }), el('th', { scope: 'col', text: 'Observed median' }), el('th', { scope: 'col', text: 'Applied' }), el('th', { scope: 'col', text: 'Basis' }))),
          el('tbody', null, calRows)))),
      el('section', { class: 'panel' },
        el('h2', { text: 'Board construction and farm plans' }),
        el('p', { html: 'The board takes all <strong>' + DATA.watchlist_size + ' watchlist slugs</strong> as a floor, then adds rankable pre-token protocols below the $' + Math.round(DATA.floor_usd / 1e6) + 'M TVL floor chosen by calibrated implied value, until it reaches <strong>' + M.target_board_size + ' rows</strong>. Versioned pool names (a trailing V2, v2 or 2.0) and CEXs are excluded. Live-token protocols never enter the board. Final order is implied value, then slug tie-break, with ranks 1..N fixed in board.json.' }),
        el('div', { class: 'tier' },
          el('span', { text: 'Farm capital per position, from the protocol\'s own TVL:' }),
          el('span', { text: 'TVL >= $5B -> $250 · >= $1B -> $150 · >= $100M -> $100 · otherwise $50' }),
          el('span', { text: 'Hold window from age: under 180 days -> 60 days · under 365 days -> 45 days · otherwise 30 days; unknown age -> 30 days.' }),
          el('span', { text: 'Every row gets exactly six on-chain steps; each names the action, its gas plus capital cost and its time. The staking branch is conditional: it claims and restakes only if the app\'s own interface shows claimable rewards, and otherwise skips and leaves the position untouched. No points program, airdrop, token or launch date is claimed anywhere.' }))));
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); refreshBoard(); });

  function field(dt, dd) { return [el('dt', { text: dt }), el('dd', { text: dd })]; }

  function openDetail(slug) {
    var r = DATA.rows.filter(function (x) { return x.slug === slug; })[0];
    if (!r) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var badge = r.on_watchlist ? el('span', { class: 'badge watch' }, el('span', { class: 'dot' }), 'watchlist') : el('span', { class: 'badge early' }, el('span', { class: 'dot' }), 'early');
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('div', { style: 'display:flex;gap:8px;align-items:center' }, el('span', { class: 'badge rank', text: 'Rank ' + r.rank + ' / ' + DATA.board_size }), badge),
        el('h2', { id: 'detail-title', text: r.name, style: 'margin-top:6px' }),
        el('p', { class: 'sub', text: catOf(r) + ' on ' + (r.chains && r.chains.length ? r.chains.join(', ') : 'chain unnamed') })),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })));

    var fields = el('dl', { class: 'fields' });
    [
      field('Slug', r.slug), field('Name', r.name), field('Category', dash(r.category)), field('Chains', r.chains && r.chains.length ? r.chains.join(', ') : '—'),
      field('TVL', fmtUsd(r.tvl_usd)), field('7d change', fmtPct(r.change_7d)), field('Market cap', r.mcap_usd === null ? 'none on record' : fmtUsd(r.mcap_usd)),
      field('First listed', dash(r.listed_at)), field('Age', fmtAge(r.age_days)), field('Gecko id', dash(r.gecko_id)),
      field('Symbol', dash(r.symbol)), field('Token status', 'pre-token (no token on record)')
    ].forEach(function (pair) { fields.appendChild(pair[0]); fields.appendChild(pair[1]); });
    dialog.appendChild(el('section', { class: 'detail-section' }, el('h3', { text: 'Snapshot record' }), fields));

    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Model breakdown' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(r.tvl_usd) })),
        el('div', null, el('span', { text: 'Category base multiple' }), el('b', { class: 'num', text: fmtMult(r.base_multiple) })),
        el('div', null, el('span', { text: 'Growth (7d, clamped)' }), el('b', { class: 'num', text: fmtPct(r.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: r.growth_multiplier.toFixed(4) + 'x' })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: r.maturity_multiplier.toFixed(4) + 'x' })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(r.implied_value_usd) }))),
      el('p', { class: 'basis-note', text: basisText(r.multiple_basis, r.multiple_clamped) + '. Model ' + DATA.model_version + ': the same function scores every protocol; this is an estimate, not a price.' })));

    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Six-step farm plan' }),
      el('p', { class: 'basis-note', text: 'Derived from this protocol\'s category, first chain, TVL tier and age. Never a claim about rewards or a launch.' }),
      el('ol', { class: 'steps' }, r.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))));

    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  }

  function render() {
    app.textContent = '';
    countEl = null;
    boardSlot = null;
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(nav());
    shell.appendChild(lede());
    if (state.tab === 'board') {
      shell.appendChild(controls());
      boardSlot = el('div');
      boardSlot.appendChild(boardView());
      shell.appendChild(boardSlot);
    } else if (state.tab === 'live') { liveView().forEach(function (n) { shell.appendChild(n); }); }
    else shell.appendChild(methodView());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  if (['board', 'live', 'method'].indexOf(state.tab) < 0) state.tab = 'board';
  render();
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog.open) dialog.close(); });
  window.addEventListener('hashchange', function () { readHash(); render(); });
})();
