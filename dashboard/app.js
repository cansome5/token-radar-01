'use strict';

// Calibrated Launch Radar - a static page with no network use. data.js, written by main.ts from
// the same board, arrives as window.RADAR_V3; this file only shapes and filters it.

(function () {
  var DATA = window.RADAR_V3 || null;
  if (DATA === null) {
    document.getElementById('app').appendChild(el('div', { class: 'empty' },
      el('strong', null, 'No radar data was loaded'),
      'data.js sits beside the page and is written by main.ts. Rebuild the output folder, then reload.'
    ));
    return;
  }

  var state = {
    view: 'board',
    sort: 'rank',
    dir: 'asc',
    q: '',
    category: 'all',
    chain: 'all',
    scope: 'all',
    focusSearch: false,
  };

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key.indexOf('on') === 0 && typeof value === 'function') node.addEventListener(key.slice(2), value);
        else if (value === true) node.setAttribute(key, '');
        else if (value !== false && value !== null && value !== undefined) node.setAttribute(key, value);
      });
    }
    for (var i = 2; i < arguments.length; i++) add(node, arguments[i]);
    return node;
  }

  function add(node, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) {
      child.forEach(function (item) { add(node, item); });
    } else if (child instanceof Node) {
      node.appendChild(child);
    } else {
      node.appendChild(document.createTextNode(String(child)));
    }
  }

  function usd(value) {
    if (!Number.isFinite(value)) return 'n/a';
    var sign = value < 0 ? '-' : '';
    var abs = Math.abs(value);
    if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return sign + '$' + Math.round(abs / 1e3) + 'K';
    return sign + '$' + Math.round(abs);
  }

  function fullUsd(value) {
    return '$' + Math.round(value).toLocaleString('en-US');
  }

  function delta(value) {
    if (value === null || !Number.isFinite(value)) return el('span', { class: 'delta flat' }, 'n/a');
    var split = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2);
    return el('span', { class: 'delta ' + (value > 0 ? 'up' : value < 0 ? 'down' : 'flat') },
      (value > 0 ? '+' : '') + split + '%');
  }

  function multiple(value, digits) {
    if (!Number.isFinite(value)) return 'n/a';
    return value.toFixed(digits || 6) + 'x';
  }

  function ageShort(row) {
    if (!row.model.age_known) return 'unknown';
    var years = row.model.age_days / 365;
    return years >= 1 ? years.toFixed(1) + ' y' : row.model.age_days + ' d';
  }

  function ageLong(row) {
    return row.model.age_known
      ? row.model.age_days.toLocaleString('en-US') + ' days (' + (row.model.age_days / 365).toFixed(1) + ' years)'
      : 'not recorded - the 365-day fallback is used';
  }

  function categoryLabel(row) { return row.category || 'Uncategorised'; }

  function basisChip(basis) {
    return el('span', { class: 'chip ' + (basis === 'category' ? 'category' : basis === 'global' ? 'global' : '') },
      basis === 'category' ? 'category median' : basis === 'global' ? 'global fallback' : 'neutral');
  }

  function scopeChip(scope) {
    return el('span', { class: 'chip ' + (scope === 'watchlist' ? 'watch' : 'early') },
      scope === 'watchlist' ? 'watchlist' : 'early');
  }

  function headerBlock() {
    var watchRows = DATA.rows.filter(function (row) { return row.scope === 'watchlist'; }).length;
    var categoryBasis = DATA.rows.filter(function (row) { return row.model.basis === 'category'; }).length;
    return el('header', { class: 'site-header' },
      el('div', { class: 'brandline' },
        el('div', null,
          el('span', { class: 'eyebrow' }, 'token-radar-01 / entry v3'),
          el('h1', null, 'Calibrated Launch Radar'),
          el('p', { class: 'subtitle' }, 'Pre-token protocols ranked by what the snapshot says comparable tokenized protocols are worth, before growth and age are applied.')
        ),
        el('div', { class: 'header-note' },
          el('div', null, 'snapshot ', el('strong', null, DATA.as_of)),
          el('div', null, DATA.protocol_count + ' protocols above ', fullUsd(DATA.floor_usd)),
          el('div', null, 'model ', el('strong', null, DATA.model))
        )
      ),
      el('div', { class: 'stats' },
        stat('Ranked rows', String(DATA.board_size), DATA.early_size + ' early'),
        stat('Watchlist floor', watchRows + '/' + DATA.watchlist_count, 'all present'),
        stat('Global median', multiple(DATA.global.applied), DATA.global.peer_count + ' tokenized peers'),
        stat('Category-basis rows', String(categoryBasis), (DATA.board_size - categoryBasis) + ' use global fallback'),
        stat('Live tokens set aside', String(DATA.live.length), 'not ranked')
      )
    );
  }

  function stat(label, value, note) {
    return el('div', { class: 'stat' },
      el('span', { class: 'k' }, label),
      el('span', { class: 'v' }, value, note ? el('small', null, note) : null)
    );
  }

  function navRow() {
    return el('div', { class: 'nav-row' },
      el('nav', { class: 'tabs' },
        tab('board', 'Board', DATA.board_size),
        tab('live', 'Live tokens', DATA.live.length),
        tab('method', 'Method & calibration', null)
      ),
      el('span', { class: 'nav-note' }, 'click a row for the model breakdown and farm plan')
    );
  }

  function tab(view, label, count) {
    return el('button', {
      class: 'tab' + (state.view === view ? ' active' : ''),
      type: 'button',
      onclick: function () { state.view = view; render(); },
    }, label, count === null ? null : el('span', { class: 'count' }, count));
  }

  function categories() {
    var seen = {};
    DATA.rows.forEach(function (row) { seen[categoryLabel(row)] = true; });
    return Object.keys(seen).sort();
  }

  function chains() {
    var seen = {};
    DATA.rows.forEach(function (row) { seen[row.chain] = true; });
    return Object.keys(seen).sort();
  }

  function boardView() {
    return el('div', null,
      toolbar(),
      el('main', { class: 'main' },
        el('div', { class: 'tablewrap' }, table()),
        el('div', { class: 'legend' },
          el('span', null, 'TVL is whole US dollars from the snapshot.'),
          el('span', null, '7d is the TVL change, not a price change.'),
          el('span', null, 'Implied value is a model claim, not a prediction.'),
          el('span', null, 'Watchlist rows are the floor; early rows are pre-token protocols under the floor.')
        )
      )
    );
  }

  function toolbar() {
    var shown = filteredRows().length;
    var search = el('input', {
      id: 'search',
      class: 'search',
      type: 'search',
      placeholder: 'Filter by protocol, slug or category',
      value: state.q,
      oninput: function (event) { state.q = event.target.value; state.focusSearch = true; render(); },
    });
    var category = el('select', {
      id: 'category-filter',
      onchange: function (event) { state.category = event.target.value; render(); },
    }, el('option', { value: 'all' }, 'All categories'),
      categories().map(function (name) {
        return el('option', { value: name, selected: state.category === name ? true : null }, name);
      }));
    var chain = el('select', {
      id: 'chain-filter',
      onchange: function (event) { state.chain = event.target.value; render(); },
    }, el('option', { value: 'all' }, 'All chains'),
      chains().map(function (name) {
        return el('option', { value: name, selected: state.chain === name ? true : null }, name);
      }));
    var scope = el('select', {
      id: 'scope-filter',
      onchange: function (event) { state.scope = event.target.value; render(); },
    }, el('option', { value: 'all', selected: state.scope === 'all' ? true : null }, 'All scopes'),
      el('option', { value: 'watchlist', selected: state.scope === 'watchlist' ? true : null }, 'Watchlist only'),
      el('option', { value: 'early', selected: state.scope === 'early' ? true : null }, 'Early only'));

    return el('div', { class: 'toolbar' },
      search,
      el('div', { class: 'field' }, el('label', { for: 'category-filter' }, 'Category'), category),
      el('div', { class: 'field' }, el('label', { for: 'chain-filter' }, 'Chain'), chain),
      el('div', { class: 'field' }, el('label', { for: 'scope-filter' }, 'Scope'), scope),
      el('div', { class: 'resultline' }, el('strong', null, shown), ' of ' + DATA.board_size + ' rows')
    );
  }

  function filteredRows() {
    var query = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (row) {
      if (state.scope !== 'all' && row.scope !== state.scope) return false;
      if (state.category !== 'all' && categoryLabel(row) !== state.category) return false;
      if (state.chain !== 'all' && row.chain !== state.chain) return false;
      if (query !== '') {
        var hay = (row.name + ' ' + row.slug + ' ' + categoryLabel(row) + ' ' + row.chain).toLowerCase();
        if (hay.indexOf(query) === -1) return false;
      }
      return true;
    });
  }

  function sortValue(row, key) {
    if (key === 'name') return row.name.toLowerCase();
    if (key === 'rank') return row.rank;
    if (key === 'tvl') return row.tvl_usd;
    if (key === 'change') return row.change_7d === null ? -1e9 : row.change_7d;
    if (key === 'age') return row.model.age_known ? row.model.age_days : -1;
    if (key === 'multiple') return row.model.base_multiple;
    return row.implied_value_usd;
  }

  function orderedRows() {
    var rows = filteredRows().slice();
    var direction = state.dir === 'asc' ? 1 : -1;
    rows.sort(function (a, b) {
      // Missing snapshot values sort last in either direction, never above a known value.
      if (state.sort === 'change' && (a.change_7d === null || b.change_7d === null)) {
        if (a.change_7d === null && b.change_7d === null) return a.rank - b.rank;
        return a.change_7d === null ? 1 : -1;
      }
      if (state.sort === 'age' && (!a.model.age_known || !b.model.age_known)) {
        if (!a.model.age_known && !b.model.age_known) return a.rank - b.rank;
        return !a.model.age_known ? 1 : -1;
      }
      var left = sortValue(a, state.sort);
      var right = sortValue(b, state.sort);
      var compared = left < right ? -1 : left > right ? 1 : 0;
      return compared * direction || a.rank - b.rank;
    });
    return rows;
  }

  function setSort(key) {
    if (state.sort === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
    else {
      state.sort = key;
      state.dir = key === 'name' || key === 'rank' ? 'asc' : 'desc';
    }
    render();
  }

  function headCell(label, key, numeric) {
    return el('th', {
      class: (numeric ? 'num ' : '') + (key ? 'sortable ' : '') + 'c-' + (key || 'x'),
      onclick: key ? function () { setSort(key); } : null,
    }, label, key && state.sort === key ? el('span', { class: 'arrow' }, state.dir === 'asc' ? '^' : 'v') : null);
  }

  function table() {
    var rows = orderedRows();
    if (rows.length === 0) {
      return el('div', { class: 'empty' },
        el('strong', null, 'No rows match these filters'),
        'Clear the search, category, chain or scope filter to see the board again.');
    }
    return el('table', { class: 'board' },
      el('thead', null, el('tr', null,
        headCell('#', 'rank', true),
        headCell('Protocol', 'name', false),
        headCell('TVL', 'tvl', true),
        headCell('7-day TVL change', 'change', true),
        headCell('Age', 'age', true),
        headCell('Base multiple', 'multiple', true),
        headCell('Implied value', 'implied', true)
      )),
      el('tbody', null, rows.map(rowLine))
    );
  }

  function rowLine(row) {
    return el('tr', {
      class: 'row',
      tabindex: '0',
      'data-slug': row.slug,
      onclick: function () { openDetail(row.slug); },
      onkeydown: function (event) {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDetail(row.slug); }
      },
    },
      el('td', { class: 'rank' }, '#' + row.rank),
      el('td', { class: 'namecell' },
        el('div', { class: 'proto-name' }, row.name, scopeChip(row.scope)),
        el('div', { class: 'proto-meta' }, categoryLabel(row) + ' / ' + row.chain)
      ),
      el('td', { class: 'num' }, el('span', { class: 'money' }, usd(row.tvl_usd))),
      el('td', { class: 'num' }, delta(row.change_7d)),
      el('td', { class: 'num' }, ageShort(row)),
      el('td', { class: 'num' }, el('span', { class: 'mult' }, multiple(row.model.base_multiple, 4)),
        ' ', el('span', { class: 'chip ' + row.model.basis },
          row.model.basis === 'category' ? 'cat' : row.model.basis === 'global' ? 'global' : 'neutral')),
      el('td', { class: 'num' }, el('span', { class: 'implied', title: fullUsd(row.implied_value_usd) }, usd(row.implied_value_usd)))
    );
  }
  function render() {
    var app = document.getElementById('app');
    var focus = state.focusSearch;
    app.replaceChildren(
      headerBlock(),
      navRow(),
      state.view === 'live' ? liveView() : state.view === 'method' ? methodView() : boardView(),
      footerBlock()
    );
    state.focusSearch = false;
    if (focus) {
      var search = document.getElementById('search');
      if (search) {
        search.focus();
        search.setSelectionRange(search.value.length, search.value.length);
      }
    }
  }

  function footerBlock() {
    return el('div', { class: 'footer' },
      el('span', null, 'Snapshot ' + DATA.as_of + ' - ' + DATA.protocol_count + ' protocols. Values are whole-dollar model claims.'),
      el('span', null, 'Rank 1 has the highest implied value. The page makes no network calls.')
    );
  }

  // ---------------------------------------------------------------- detail

  function kv(key, value) {
    return [el('span', { class: 'k' }, key), el('span', { class: 'v' }, value)];
  }

  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (candidate) { if (candidate.slug === slug) row = candidate; });
    if (row === null) return;
    var old = document.querySelector('dialog.detail');
    if (old !== null) old.remove();

    var dlg = el('dialog', { class: 'detail' },
      el('div', { class: 'dialog-head' },
        el('div', { class: 'topline' },
          el('div', null,
            el('h2', null, row.name),
            el('div', { class: 'meta' }, 'Rank ' + row.rank + ' of ' + DATA.board_size + ' / ' +
              categoryLabel(row) + ' / ' + row.chains.join(', '))
          ),
          el('div', { class: 'head-side' },
            el('div', { class: 'big-value' },
              el('div', { class: 'label' }, 'Implied value'),
              el('div', { class: 'value' }, fullUsd(row.implied_value_usd))
            ),
            el('button', { class: 'close', type: 'button', onclick: function () { dlg.close(); } }, 'Close')
          )
        )
      ),
      el('div', { class: 'dialog-body' },
        el('div', { class: 'dialog-grid' },
          el('div', null, snapshotPanel(row), modelPanel(row)),
          el('div', null, farmPanel(row))
        )
      )
    );

    dlg.addEventListener('click', function (event) {
      if (event.target === dlg) dlg.close();
    });
    document.body.appendChild(dlg);
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  function snapshotPanel(row) {
    var tokenRecord = row.mcap_usd === null && row.gecko_id === null && row.symbol === null
      ? 'no token recorded in the snapshot'
      : [row.symbol ? 'symbol ' + row.symbol : null, row.gecko_id ? 'gecko id ' + row.gecko_id : null]
        .filter(Boolean).join(', ') || 'partial market record';
    return el('div', { class: 'panel' },
      el('h3', null, 'Snapshot record'),
      el('div', { class: 'kv' },
        kv('TVL', fullUsd(row.tvl_usd)),
        kv('7-day TVL change', delta(row.change_7d)),
        kv('Market cap', row.mcap_usd === null ? 'not recorded' : fullUsd(row.mcap_usd)),
        kv('Listed', row.listed_at || 'not recorded'),
        kv('Age', ageLong(row)),
        kv('Chain', row.chains.length > 0 ? row.chains.join(', ') : row.chain),
        kv('Scope', scopeChip(row.scope)),
        kv('Token record', tokenRecord)
      )
    );
  }

  function modelPanel(row) {
    var model = row.model;
    var calibration = null;
    DATA.calibration.forEach(function (entry) { if (entry.category === categoryLabel(row)) calibration = entry; });
    var observed = model.observed_median === null ? 'no peers in this category' : multiple(model.observed_median, 4) + ' (' + peerText(model.peers) + ')';
    var basisLine = model.basis === 'category'
      ? 'Category median over ' + peerText(model.peers) + ' (at least three, so it is applied directly).'
      : 'Fewer than three tokenized peers, so the global median is applied.';
    return el('div', { class: 'panel', style: 'margin-top:14px' },
      el('h3', null, 'Model breakdown'),
      el('div', { class: 'kv' },
        kv('Base multiple', el('span', null, multiple(model.base_multiple, 6) + ' ', basisChip(model.basis))),
        kv('Category peers', String(model.peers)),
        kv('Observed category median', observed),
        kv('Growth multiplier', multiple(model.growth_multiple, 4) + ' from ' +
          (row.change_7d === null ? 'a missing 7-day change (neutral)' : row.change_7d.toFixed(2) + '% clamped to [-60, +120]')),
        kv('Maturity multiplier', multiple(model.maturity_multiple, 4) + ' from ' + ageShort(row)),
        kv('Implied value', el('strong', null, fullUsd(row.implied_value_usd)))
      ),
      el('div', { class: 'formula' },
        'TVL ' + fullUsd(row.tvl_usd) + '\n' +
        '  x base ' + multiple(model.base_multiple, 6) + '\n' +
        '  x growth ' + multiple(model.growth_multiple, 6) + '\n' +
        '  x maturity ' + multiple(model.maturity_multiple, 6) + '\n' +
        '  = ' + fullUsd(row.implied_value_usd)
      ),
      el('p', { class: 'note-small' }, basisLine),
      model.clamped ? el('p', { class: 'callout' }, 'The raw category median ' + multiple(model.observed_median, 4) + ' fell outside [0.02, 1.50], so the applied multiple is clamped.') : null,
      model.basis !== 'category' ? el('p', { class: 'callout' }, DATA.fallback_note) : null,
      calibration !== null && calibration.rows_on_board > 0
        ? el('p', { class: 'note-small' }, calibration.rows_on_board + ' board row' + (calibration.rows_on_board === 1 ? '' : 's') + ' share this category multiple.')
        : null
    );
  }

  function peerText(count) {
    return count === 1 ? '1 tokenized peer' : count + ' tokenized peers';
  }

  function farmPanel(row) {
    return el('div', { class: 'panel' },
      el('h3', null, 'Six-step farm plan'),
      el('p', { class: 'note-small' }, 'Capital band, chain and age come from the snapshot. Costs and times are listed inside each step.'),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (step, index) {
        return el('li', { class: 'step' },
          el('span', { class: 'n' }, index + 1),
          el('span', null, step)
        );
      })),
      el('p', { class: 'note-small' }, 'Step 6 is conditional: act only when the protocol\'s own app shows a claimable staking or rewards balance. No campaign, points scheme or issuance date is asserted anywhere in this plan.')
    );
  }

  // ---------------------------------------------------------------- live

  function liveView() {
    return el('div', null,
      el('div', { class: 'main' },
        el('div', { class: 'section-head' },
          el('h2', null, 'Live tokens ', el('span', { class: 'live-badge' }, 'not ranked')),
          el('p', null, 'Protocols that already record a market cap in the snapshot. They are reference points for the category calibration and are deliberately kept out of the board ranking.')
        ),
        el('div', { class: 'tablewrap', style: 'margin-top:14px' },
          el('table', { class: 'board' },
            el('thead', null, el('tr', null,
              el('th', { class: 'c-live-rank' }, '#'),
              el('th', { class: 'c-live-name' }, 'Protocol'),
              el('th', { class: 'c-live-cat' }, 'Category'),
              el('th', { class: 'c-live-chain' }, 'Chain'),
              el('th', { class: 'num c-live-mcap' }, 'Market cap'),
              el('th', { class: 'num c-live-tvl' }, 'TVL'),
              el('th', { class: 'num c-live-ratio' }, 'Mcap / TVL')
            )),
            el('tbody', null, DATA.live.map(function (row, index) {
              return el('tr', null,
                el('td', { class: 'rank' }, '#' + (index + 1)),
                el('td', null, el('div', { class: 'proto-name' }, row.name, el('span', { class: 'live-badge' }, 'live')),
                  el('div', { class: 'proto-meta' }, row.slug)),
                el('td', null, row.category || 'Uncategorised'),
                el('td', null, row.chain),
                el('td', { class: 'num' }, fullUsd(row.mcap_usd)),
                el('td', { class: 'num' }, usd(row.tvl_usd)),
                el('td', { class: 'num' }, row.mcap_to_tvl.toFixed(2) + 'x')
              );
            }))
          )
        ),
        el('div', { class: 'legend' },
          el('span', null, 'Sorted by market cap, not by implied value.'),
          el('span', null, 'Their mcap/TVL ratios are what the calibration medians are built from.')
        )
      )
    );
  }

  // ---------------------------------------------------------------- method

  function methodView() {
    var constants = [
      ['multiple_floor', 'Multiple floor'],
      ['multiple_cap', 'Multiple cap'],
      ['min_category_peers', 'Minimum category peers'],
      ['growth_weight', 'Growth weight'],
      ['growth_floor', '7-day clamp floor'],
      ['growth_cap', '7-day clamp cap'],
      ['maturity_floor', 'Maturity floor'],
      ['maturity_range', 'Maturity range'],
      ['maturity_days', 'Age saturates at (days)'],
      ['unknown_age_days', 'Unknown-age fallback (days)'],
    ];
    return el('div', null,
      el('div', { class: 'main method' },
        el('div', { class: 'section-head' },
          el('h2', null, 'Method and calibration'),
          el('p', null, 'The model is a ratio model, not a price forecast. It asks what a token would be worth if the protocol\'s record stayed where the snapshot recorded it.')
        ),
        el('div', { class: 'method-grid' },
          el('div', null,
            el('div', { class: 'panel' },
              el('h3', null, 'The formula'),
              el('div', { class: 'formula' },
                'peers = non-CEX protocols with market cap > 0 and TVL > 0\n' +
                'base = median(market cap / TVL) of the same category\n' +
                '       clamped to [0.02, 1.50]\n' +
                '       fewer than 3 peers -> global median ' + multiple(DATA.global.applied, 6) + '\n' +
                'growth = 1 + clamp(change_7d, -60, +120) / 100 * 0.5\n' +
                'maturity = 0.60 + min(age_days, 1095) / 1095 * 0.40\n' +
                'implied = max(1, round(TVL * base * growth * maturity))'
              ),
              el('p', { class: 'callout big', style: 'margin-top:12px' }, DATA.fallback_note)
            ),
            el('div', { class: 'panel', style: 'margin-top:16px' },
              el('h3', null, 'Board construction'),
              el('p', null, 'All ' + DATA.watchlist_count + ' watchlist slugs enter the board first. The remaining ' + DATA.early_size +
                ' places go to pre-token protocols below the ' + fullUsd(DATA.floor_usd) + ' floor, chosen by calibrated implied value rather than by TVL. CEX venues and versioned pool instances are excluded from the early pool.'),
              el('p', null, 'Every row is then ordered by implied value, highest first, with a slug tie-break. Ranks are 1 to ' + DATA.board_size + ' once each.'),
              el('p', null, 'A protocol records no token; the snapshot is not proof that none exists, and the board never claims otherwise.')
            ),
            el('div', { class: 'panel', style: 'margin-top:16px' },
              el('h3', null, 'Farm plans'),
              el('p', null, 'Each row has six steps. Five are fixed: fund the wallet, enter the category\'s real on-chain position, maintain it, run a weekly risk check, and plan the exit. The sixth is the staking and rewards check; it is acted on only when the protocol\'s own app shows a claimable balance, and is skipped when the app shows none.'),
              el('p', null, 'Capital comes from the protocol\'s TVL band: $50, $100, $150 or $250. The hold period comes from age: 30, 45 or 60 days. Each step states its own capital, time and gas cost. No campaign, points scheme or issuance date is asserted.')
            ),
            el('div', { class: 'panel', style: 'margin-top:16px' },
              el('h3', null, 'Constants'),
              el('div', { class: 'constants' }, constants.map(function (item) {
                return el('div', { class: 'row' }, el('span', null, item[1]), el('span', null, String(DATA.constants[item[0]])));
              }))
            )
          ),
          el('div', null,
            el('div', { class: 'panel' },
              el('h3', null, 'Category calibration from the snapshot'),
              el('p', { class: 'note-small', style: 'margin-top:0;margin-bottom:8px' },
                DATA.global.peer_count + ' tokenized non-CEX peers set the global median at ' + multiple(DATA.global.applied, 6) +
                '. Categories with at least three peers use their own median; the rest show the global fallback.'),
              el('div', { class: 'calibwrap' },
                el('table', { class: 'calib' },
                  el('thead', null, el('tr', null,
                    el('th', null, 'Category'),
                    el('th', { class: 'num' }, 'Peers'),
                    el('th', { class: 'num' }, 'Observed'),
                    el('th', { class: 'num' }, 'Applied'),
                    el('th', null, 'Basis'),
                    el('th', { class: 'num' }, 'Rows')
                  )),
                  el('tbody', null, DATA.calibration.map(function (entry) {
                    return el('tr', null,
                      el('td', null, entry.category),
                      el('td', { class: 'num' }, String(entry.peers)),
                      el('td', { class: 'num' }, entry.observed_median === null ? '-' : multiple(entry.observed_median, 4)),
                      el('td', { class: 'num fallback' }, multiple(entry.applied_multiple, 6)),
                      el('td', null, entry.basis === 'category' ? el('span', { class: 'chip category' }, 'category') :
                        el('span', { class: 'chip global' }, entry.basis === 'neutral' ? 'neutral' : 'global')),
                      el('td', { class: 'num' }, String(entry.rows_on_board))
                    );
                  }))
                )
              )
            ),
            el('div', { class: 'panel', style: 'margin-top:16px' },
              el('h3', null, 'What this is not'),
              el('p', null, 'The board does not say whether or when a protocol issues a token. It does not claim that a tokenized peer\'s market cap will repeat. It does not know a token\'s supply, float or unlock schedule. It compares records that exist in the sealed snapshot and marks every row as a model claim.'),
              el('p', null, 'A missing 7-day change is neutral (1.00x). A missing listing date uses the explicit 365-day fallback; the detail view says so rather than inventing an age.')
            )
          )
        )
      )
    );
  }

  // ---------------------------------------------------------------- routing and boot

  function route() {
    var params = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (params.get('view') === 'live' || params.get('view') === 'method' || params.get('view') === 'board') {
      state.view = params.get('view');
    }
    if (params.get('category')) state.category = params.get('category');
    if (params.get('scope')) state.scope = params.get('scope');
    if (params.get('q')) state.q = params.get('q');
    render();
    var slug = params.get('p');
    if (slug) openDetail(slug);
  }

  window.addEventListener('hashchange', route);
  route();
})();
