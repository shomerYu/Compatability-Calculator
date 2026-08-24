/*
 * app.js — חיווט הממשק
 */
(function () {
  'use strict';

  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const nf = new Intl.NumberFormat('he-IL');

  /* טקסט מספרי מוצג תמיד משמאל לימין, כדי שסימני טווח ואחוז לא יתהפכו */
  const esc = t => String(t).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
  const ltr = t => '<span dir="ltr">' + esc(t) + '</span>';
  const segState = {};

  /* ---------------- segmented controls ---------------- */
  function initSegments() {
    $$('.seg').forEach(seg => {
      const name = seg.dataset.name;
      segState[name] = ($('.seg__btn.is-on', seg) || seg.firstElementChild).dataset.value;
      seg.addEventListener('click', e => {
        const btn = e.target.closest('.seg__btn');
        if (!btn) return;
        $$('.seg__btn', seg).forEach(b => b.classList.toggle('is-on', b === btn));
        segState[name] = btn.dataset.value;
        if (name === 'sex') updateHero();
      });
    });
  }

  function updateHero() {
    $('#heroTarget').textContent = segState.sex === 'male' ? 'גברים' : 'נשים';
    $('#hero').lastChild.textContent = segState.sex === 'male'
      ? ' בישראל עומדים בסטנדרטים שלך? '
      : ' בישראל עומדות בסטנדרטים שלך? ';
  }

  /* ---------------- dual / single range sliders ---------------- */
  function initRange(el, format, onChange) {
    const min  = +el.dataset.min;
    const max  = +el.dataset.max;
    const step = +el.dataset.step || 1;
    const single = el.classList.contains('range--single');

    const track = document.createElement('div');
    track.className = 'range__track';
    const fill = document.createElement('div');
    fill.className = 'range__fill';
    track.appendChild(fill);
    el.appendChild(track);

    function mkInput(value, label) {
      const i = document.createElement('input');
      i.type = 'range';
      i.min = min; i.max = max; i.step = step; i.value = value;
      i.setAttribute('aria-label', label);
      el.appendChild(i);
      return i;
    }

    const a = mkInput(+el.dataset.from, single ? 'ערך' : 'ערך מזערי');
    const b = single ? null : mkInput(+el.dataset.to, 'ערך מרבי');

    function values() {
      if (single) return [min, +a.value];
      return [Math.min(+a.value, +b.value), Math.max(+a.value, +b.value)];
    }

    function paint() {
      const [lo, hi] = values();
      const span = max - min;
      /* הדף מוגדר RTL — הצד הימני הוא ההתחלה של הסקאלה */
      const startPct = single ? 0 : ((lo - min) / span) * 100;
      const widthPct = ((hi - min) / span) * 100 - startPct;
      fill.style.right = startPct + '%';
      fill.style.width = Math.max(0, widthPct) + '%';
      onChange(values());
    }

    a.addEventListener('input', () => {
      if (b && +a.value > +b.value) a.value = b.value;
      paint();
    });
    if (b) b.addEventListener('input', () => {
      if (+b.value < +a.value) b.value = a.value;
      paint();
    });

    paint();
    return { values, paint };
  }

  /* ---------------- chip groups (multi-select) ---------------- */
  /* כל קבוצה מתחילה ב"הכל". בחירה של ערך מכבה את "הכל", וכיבוי הערך
     האחרון מחזיר אותו — כך תמיד יש מצב מוגדר. */
  function fillChips(el, items) {
    el.innerHTML = '';
    const mk = (value, label, on) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (on ? ' is-on' : '');
      b.dataset.value = value;
      b.textContent = label;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      el.appendChild(b);
      return b;
    };
    mk('any', 'הכל', true);
    items.forEach(it => mk(it.id, it.label, false));

    el.addEventListener('click', e => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      const all = $$('.chip', el);
      const anyBtn = all[0];

      if (btn === anyBtn) {
        all.forEach(b => setChip(b, b === anyBtn));
      } else {
        setChip(btn, !btn.classList.contains('is-on'));
        const picked = all.slice(1).some(b => b.classList.contains('is-on'));
        setChip(anyBtn, !picked);
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function setChip(btn, on) {
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  /* [] פירושו "הכל" — כך גם מנוע החישוב מפרש רשימה ריקה */
  function chipValues(id) {
    const el = $('#' + id);
    const on = $$('.chip.is-on', el).map(b => b.dataset.value);
    return on.includes('any') ? [] : on;
  }

  function resetChips(id) {
    const all = $$('.chip', $('#' + id));
    all.forEach((b, i) => setChip(b, i === 0));
  }

  /* ---------------- selects ---------------- */
  function fillSelect(sel, items, anyLabel) {
    sel.innerHTML = '';
    const any = document.createElement('option');
    any.value = 'any';
    any.textContent = anyLabel || 'הכל';
    sel.appendChild(any);
    items.forEach(it => {
      const o = document.createElement('option');
      o.value = it.id;
      o.textContent = it.label;
      sel.appendChild(o);
    });
  }

  function initControls() {
    fillChips($('#group'), DATA.GROUPS);
    fillChips($('#religiosity'),
      DATA.RELIGIOSITY.order.map(id => ({ id, label: DATA.RELIGIOSITY.labels[id] })));
    fillChips($('#district'), DATA.DISTRICTS);
    fillChips($('#hair'), DATA.HAIR.options);
    fillChips($('#eyes'), DATA.EYES.options);

    /* השכלה נשארת בחירה יחידה — היא רמת סף, לא רשימה */
    fillSelect($('#education'),
      DATA.EDUCATION_LEVELS.filter(l => l.id !== 'none'), 'הכל');

    /* רמת דתיות נמדדת באוכלוסייה היהודית — מבהירים זאת בממשק */
    const relRow = $('#religiosityRow');
    const relChips = $('#religiosity');
    function syncReligiosity() {
      const groups = chipValues('group');
      const relevant = groups.length === 0 || groups.includes('jewish');
      relRow.classList.toggle('is-muted', !relevant);
      relChips.classList.toggle('is-off', !relevant);
      if (!relevant) resetChips('religiosity');
    }
    $('#group').addEventListener('change', syncReligiosity);
    syncReligiosity();
  }

  /* ---------------- ranges ---------------- */
  let ageVals = [28, 38], heightVals = [160, 180], incomeVal = 0;

  function initRanges() {
    initRange($('#ageRange'), null, v => {
      ageVals = v;
      $('#ageOut').innerHTML = ltr(v[0] + '–' + v[1]);
    });
    initRange($('#heightRange'), null, v => {
      heightVals = v;
      $('#heightOut').innerHTML = ltr(v[0] + '–' + v[1]) + ' ס״מ';
    });
    initRange($('#incomeRange'), null, v => {
      incomeVal = v[1];
      $('#incomeOut').innerHTML = ltr(nf.format(v[1])) + ' ₪';
    });
  }

  /* ---------------- criteria + run ---------------- */
  function readCriteria() {
    return {
      sex: segState.sex,
      seekerSex: segState.seekerSex,
      ageMin: ageVals[0],
      ageMax: ageVals[1],
      heightMin: heightVals[0],
      heightMax: heightVals[1],
      minIncome: incomeVal,
      groups: chipValues('group'),
      religiosity: chipValues('religiosity'),
      districts: chipValues('district'),
      education: $('#education').value,
      smokes: segState.smokes,
      drinks: segState.drinks,
      wantsKids: segState.wantsKids,
      excludeMarried: segState.excludeMarried === 'yes',
      excludeObese: segState.excludeObese === 'yes',
      bald: segState.bald,
      hair: chipValues('hair'),
      eyes: chipValues('eyes')
    };
  }

  function formatPercent(p) {
    if (p >= 10) return p.toFixed(1).replace(/\.0$/, '') + '%';
    if (p >= 1)  return p.toFixed(1) + '%';
    if (p >= 0.1) return p.toFixed(2) + '%';
    if (p >= 0.001) return p.toFixed(3) + '%';
    if (p <= 0) return '0%';
    return p.toExponential(1) + '%';
  }

  function render(res, c) {
    const noun = c.sex === 'male' ? 'גברים' : 'נשים';
    const verb = c.sex === 'male' ? 'עומדים' : 'עומדות';
    const one  = c.sex === 'male' ? 'אחד' : 'אחת';
    const verb1 = c.sex === 'male' ? 'עומד' : 'עומדת';
    $('#resultPct').innerHTML = ltr(formatPercent(res.percent));

    const count = Math.round(res.count);
    let sub;
    if (count < 1) {
      sub = `לפי הנתונים, כמעט אף ${one} מ-${ltr(nf.format(Math.round(res.totalPool)))} ה${noun}
             בגילי ${ltr('18–70')} בישראל לא ${verb1} בקריטריונים האלה.`;
    } else {
      sub = `כלומר בערך <strong>${ltr(nf.format(count))}</strong> ${noun} מתוך
             ${ltr(nf.format(Math.round(res.totalPool)))} ה${noun} בגילי ${ltr('18–70')} בישראל.`;
    }
    $('#resultSub').innerHTML = sub;

    const ul = $('#breakdown');
    ul.innerHTML = '';
    res.breakdown.forEach(row => {
      const li = document.createElement('li');
      const pct = row.share * 100;
      li.innerHTML =
        `<span class="bars__label"></span>` +
        `<span class="bars__val">${ltr(formatPercent(pct))}</span>` +
        `<span class="bars__track"><span class="bars__bar" style="width:${Math.max(1, Math.min(100, pct))}%"></span></span>`;
      li.querySelector('.bars__label').textContent = row.label;
      ul.appendChild(li);
    });

    const box = $('#result');
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function initSources() {
    const ul = $('#sourcesList');
    DATA.SOURCES.forEach(s => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = s.title;
      const span = document.createElement('span');
      span.className = 'sources__fields';
      span.textContent = s.fields;
      li.appendChild(a);
      li.appendChild(span);
      ul.appendChild(li);
    });
  }

  /* ---------------- boot ---------------- */
  document.addEventListener('DOMContentLoaded', () => {
    initSegments();
    initControls();
    initRanges();
    initSources();
    updateHero();

    $('#form').addEventListener('submit', e => {
      e.preventDefault();
      const c = readCriteria();
      render(CALC.calculate(c), c);
    });

    $('#resetBtn').addEventListener('click', () => {
      $('#result').hidden = true;
      $('#calc').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
})();
