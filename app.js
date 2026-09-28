(function () {
  'use strict';

  // Misma clave que la versión móvil: ambas comparten los datos en el mismo navegador.
  var KEY = 'control100dias';

  // Opciones de la URL: ?dias=120&grafico=0
  var params = new URLSearchParams(location.search);
  var N = clampInt(params.get('dias'), 7, 365, 100);
  var VER_GRAFICO = params.get('grafico') !== '0';

  var saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  saved = saved && typeof saved === 'object' ? saved : {};

  var state = {
    kcalKg: pick('kcalKg', 7700),
    peso0: pick('peso0', 130),
    tB: pick('tB', 2100),
    rows: norm(saved.rows, N)
  };
  // Días guardados por encima de N (si se abrió con más días) se conservan al guardar.
  var extraRows = Array.isArray(saved.rows) ? saved.rows.slice(N) : [];

  function pick(k, d) { return saved[k] != null ? saved[k] : d; }

  function clampInt(v, min, max, d) {
    var x = parseInt(v, 10);
    return isFinite(x) ? Math.min(max, Math.max(min, x)) : d;
  }

  function norm(rows, n) {
    var out = [];
    for (var i = 0; i < n; i++) {
      var r = (rows && rows[i]) || {};
      out.push({ c: r.c == null ? '' : r.c, e: r.e == null ? '' : r.e, b: r.b == null ? '' : r.b });
    }
    return out;
  }

  function save() {
    // Se fusiona con lo guardado para no perder campos de la versión móvil (autoBasal, altura, etc.).
    var data = Object.assign({}, saved, {
      kcalKg: state.kcalKg,
      peso0: state.peso0,
      tB: state.tB,
      rows: state.rows.concat(extraRows)
    });
    saved = data;
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }

  function num(v) { var x = parseFloat(v); return isFinite(x) ? x : null; }

  function fmt(x, d) {
    return x.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function compute() {
    var kk = num(state.kcalKg) || 7700;
    var tB = num(state.tB);
    var peso = num(state.peso0) || 0;
    var out = [];
    var deficitTotal = 0, registrados = 0;
    for (var i = 0; i < state.rows.length; i++) {
      var r = state.rows[i];
      var c = num(r.c), e = num(r.e) || 0, b = num(r.b) != null ? num(r.b) : tB;
      var activo = c != null && b != null;
      var gramos = null;
      var pesoDia = peso;
      if (activo) {
        var deficit = b + e - c;
        gramos = deficit / kk * 1000;
        peso = peso - gramos / 1000;
        deficitTotal += deficit;
        registrados++;
      }
      out.push({ i: i, activo: activo, gramos: gramos, pesoDia: pesoDia, pesoFinal: peso });
    }
    return {
      rows: out,
      pesoFinal: peso,
      registrados: registrados,
      deficitMedio: registrados ? deficitTotal / registrados : 0
    };
  }

  // Ancho exacto de la casilla para que la unidad quede pegada al número.
  var ctx = document.createElement('canvas').getContext('2d');
  function width(v) {
    var t = String(v == null || v === '' ? '—' : v).replace(/[0-9]/g, '0');
    ctx.font = '400 26px Manrope, sans-serif';
    return Math.ceil(ctx.measureText(t).width + 7) + 'px';
  }

  // ---------- DOM ----------

  function $(id) { return document.getElementById(id); }

  function bind(name, value) {
    var els = document.querySelectorAll('[data-bind="' + name + '"]');
    for (var i = 0; i < els.length; i++) els[i].textContent = value;
  }

  var body = $('filas');
  var rowEls = [];

  function inputCell(i, key) {
    var label = document.createElement('label');
    label.className = 'cell-in';
    var input = document.createElement('input');
    input.type = 'number';
    input.value = state.rows[i][key];
    input.placeholder = key === 'b' ? String(state.tB) : '—';
    var unit = document.createElement('span');
    unit.className = 'cell-unit';
    input.addEventListener('input', function () {
      state.rows[i][key] = input.value;
      updateInput(i, key);
      save();
      update();
    });
    label.appendChild(input);
    label.appendChild(unit);
    return { label: label, input: input, unit: unit };
  }

  function outputCell(cls) {
    var div = document.createElement('div');
    div.className = 'cell-out ' + cls;
    var val = document.createElement('span');
    var unit = document.createElement('span');
    unit.className = 'cell-unit';
    div.appendChild(val);
    div.appendChild(unit);
    return { div: div, val: val, unit: unit };
  }

  function buildRows() {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < N; i++) {
      var row = document.createElement('div');
      row.className = 'row';
      var dia = document.createElement('div');
      dia.className = 'cell-dia';
      dia.textContent = i + 1;
      var el = {
        row: row,
        c: inputCell(i, 'c'),
        e: inputCell(i, 'e'),
        b: inputCell(i, 'b'),
        g: outputCell('cell-gramos'),
        p: outputCell('cell-peso')
      };
      row.appendChild(dia);
      row.appendChild(el.c.label);
      row.appendChild(el.e.label);
      row.appendChild(el.b.label);
      row.appendChild(el.g.div);
      row.appendChild(el.p.div);
      frag.appendChild(row);
      rowEls.push(el);
    }
    body.appendChild(frag);
    updateAllInputs();
  }

  // "cal" solo aparece cuando la celda tiene un número escrito.
  function updateInput(i, key) {
    var v = state.rows[i][key];
    var cell = rowEls[i][key];
    cell.unit.textContent = v === '' ? '' : 'cal';
    cell.input.style.width = width(key === 'b' ? (v || state.tB) : v);
  }

  function updateAllInputs() {
    for (var i = 0; i < N; i++) {
      updateInput(i, 'c');
      updateInput(i, 'e');
      updateInput(i, 'b');
    }
  }

  function update() {
    var cc = compute();

    for (var i = 0; i < cc.rows.length; i++) {
      var r = cc.rows[i], el = rowEls[i];
      el.row.classList.toggle('activo', r.activo);
      el.g.val.textContent = r.gramos == null ? '' : fmt(r.gramos, 2);
      el.g.unit.textContent = r.gramos == null ? '' : 'gr';
      el.p.val.textContent = r.activo ? fmt(r.pesoFinal, 3) : '';
      el.p.unit.textContent = r.activo ? 'kg' : '';
    }

    var dif = (num(state.peso0) || 0) - cc.pesoFinal;
    bind('pesoActual', fmt(cc.pesoFinal, 3));
    bind('diferencia', (dif >= 0 ? '−' : '+') + fmt(Math.abs(dif), 3));
    bind('deficitMedio', fmt(Math.round(cc.deficitMedio), 0));
    bind('registrados', cc.registrados);
    $('progreso').style.width = (cc.registrados / N * 100).toFixed(1) + '%';

    if (VER_GRAFICO) drawChart(cc);
  }

  function drawChart(cc) {
    var pts = [];
    for (var i = 0; i < cc.rows.length; i++) if (cc.rows[i].activo) pts.push(cc.rows[i].pesoDia);
    pts.push(cc.pesoFinal);
    var linePath = '', areaPath = '', rango = 'Sin datos';
    if (pts.length > 1) {
      var min = Math.min.apply(null, pts), max = Math.max.apply(null, pts);
      var span = (max - min) || 1;
      linePath = pts.map(function (p, i) {
        var x = i / (pts.length - 1) * 1000;
        var y = 200 - (p - min) / span * 180;
        return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
      }).join(' ');
      areaPath = linePath + ' L1000 220 L0 220 Z';
      rango = fmt(max, 2) + ' → ' + fmt(min, 2) + ' kg';
    }
    $('linePath').setAttribute('d', linePath);
    $('areaPath').setAttribute('d', areaPath);
    $('rangoGrafico').textContent = rango;
  }

  function bindConfig(id, key, onChange) {
    var input = $(id);
    input.value = state[key];
    input.addEventListener('input', function () {
      state[key] = input.value;
      if (onChange) onChange();
      save();
      update();
    });
  }

  function exportar() {
    var cc = compute();
    var head = 'Dia,Consumidas,Ejercicio,Basal,GramosQuemados,PesoFinal\n';
    var lines = cc.rows.map(function (r) {
      var s = state.rows[r.i];
      return [r.i + 1, s.c, s.e, s.b,
        r.gramos == null ? '' : r.gramos.toFixed(2),
        r.activo ? r.pesoFinal.toFixed(3) : ''].join(',');
    });
    var url = URL.createObjectURL(new Blob([head + lines.join('\n')], { type: 'text/csv' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = 'control-100-dias.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function reiniciar() {
    if (!confirm('¿Borrar todos los días registrados?')) return;
    state.rows = norm(null, N);
    extraRows = [];
    for (var i = 0; i < N; i++) {
      rowEls[i].c.input.value = '';
      rowEls[i].e.input.value = '';
      rowEls[i].b.input.value = '';
    }
    updateAllInputs();
    save();
    update();
  }

  // ---------- Inicio ----------

  bind('n', N);
  $('grafico').hidden = !VER_GRAFICO;

  bindConfig('kcalKg', 'kcalKg');
  bindConfig('peso0', 'peso0');
  bindConfig('tB', 'tB', function () {
    for (var i = 0; i < N; i++) {
      rowEls[i].b.input.placeholder = String(state.tB);
      updateInput(i, 'b');
    }
  });

  $('exportar').addEventListener('click', exportar);
  $('reiniciar').addEventListener('click', reiniciar);

  buildRows();
  update();

  // Al cargar Manrope cambian las medidas: se recalcula el ancho de las casillas.
  if (document.fonts && document.fonts.load) {
    document.fonts.load('400 26px Manrope').then(updateAllInputs, function () {});
  }
})();
