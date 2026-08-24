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

    /* קביעת ערך מבחוץ — משמש לשחזור מצב מקישור משותף */
    function set(lo, hi) {
      const fit = v => Math.min(max, Math.max(min, Math.round(v / step) * step));
      if (single) {
        a.value = fit(hi);
      } else {
        const l = fit(Math.min(lo, hi)), h = fit(Math.max(lo, hi));
        a.value = l; b.value = h;
      }
      paint();
    }

    paint();
    return { values, paint, set };
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

  const ranges = {};

  function initRanges() {
    ranges.age = initRange($('#ageRange'), null, v => {
      ageVals = v;
      $('#ageOut').innerHTML = ltr(v[0] + '–' + v[1]);
    });
    ranges.height = initRange($('#heightRange'), null, v => {
      heightVals = v;
      $('#heightOut').innerHTML = ltr(v[0] + '–' + v[1]) + ' ס״מ';
    });
    ranges.income = initRange($('#incomeRange'), null, v => {
      incomeVal = v[1];
      $('#incomeOut').innerHTML = ltr(nf.format(v[1])) + ' ₪';
    });
  }

  /* ---------------- state setters (used to restore a shared link) ---------------- */
  function setSeg(name, value) {
    const seg = document.querySelector('.seg[data-name="' + name + '"]');
    if (!seg) return;
    const btn = seg.querySelector('.seg__btn[data-value="' + value + '"]');
    if (!btn) return;                      /* ערך לא מוכר מהקישור — מתעלמים */
    $$('.seg__btn', seg).forEach(b => b.classList.toggle('is-on', b === btn));
    segState[name] = btn.dataset.value;
  }

  function setChips(id, values) {
    const el = $('#' + id);
    if (!el) return;
    const all = $$('.chip', el);
    if (!all.length) return;
    if (!values.length) {
      all.forEach((b, i) => setChip(b, i === 0));
      return;
    }
    all.forEach(b => setChip(b, values.indexOf(b.dataset.value) !== -1));
    setChip(all[0], false);
    if (!$$('.chip.is-on', el).length) setChip(all[0], true);  /* שום ערך לא הוכר */
  }

  /* ---------------- share link ---------------- */
  const SEX = { male: 'm', female: 'f' };
  const SEX_BACK = { m: 'male', f: 'female' };

  function buildShareUrl(c) {
    const p = new URLSearchParams();
    p.set('me', SEX[c.seekerSex]);
    p.set('for', SEX[c.sex]);
    p.set('age', c.ageMin + '-' + c.ageMax);
    p.set('h', c.heightMin + '-' + c.heightMax);
    if (c.minIncome) p.set('inc', c.minIncome);
    if (c.groups.length) p.set('g', c.groups.join(','));
    if (c.religiosity.length) p.set('rel', c.religiosity.join(','));
    if (c.districts.length) p.set('d', c.districts.join(','));
    if (c.education !== 'any') p.set('edu', c.education);
    if (c.smokes !== 'any') p.set('smk', c.smokes);
    if (c.drinks !== 'any') p.set('drk', c.drinks);
    if (c.bald !== 'any') p.set('bald', c.bald);
    if (c.wantsKids !== 'any') p.set('kids', c.wantsKids);
    /* לשני אלה יש ברירת מחדל שאינה "הכל", ולכן הם נכתבים תמיד */
    p.set('single', c.excludeMarried ? '1' : '0');
    p.set('nofat', c.excludeObese ? '1' : '0');
    if (c.hair.length) p.set('hair', c.hair.join(','));
    if (c.eyes.length) p.set('eyes', c.eyes.join(','));
    return location.origin + location.pathname + '?' + p.toString();
  }

  /* ערכים מקישור הם קלט לא מהימן — כל אחד נבדק מול הערכים המוכרים */
  function applyShareUrl() {
    const p = new URLSearchParams(location.search);
    if (!Array.from(p.keys()).length) return false;

    if (p.has('me')) setSeg('seekerSex', SEX_BACK[p.get('me')]);
    if (p.has('for')) setSeg('sex', SEX_BACK[p.get('for')]);

    const pair = (key, ctl) => {
      if (!p.has(key) || !ctl) return;
      const parts = p.get(key).split('-').map(Number);
      if (parts.length === 2 && parts.every(Number.isFinite)) ctl.set(parts[0], parts[1]);
    };
    pair('age', ranges.age);
    pair('h', ranges.height);
    if (p.has('inc') && ranges.income) {
      const v = Number(p.get('inc'));
      if (Number.isFinite(v)) ranges.income.set(0, v);
    }

    /* שלושת גווני החום אוחדו לערך אחד; קישורים ישנים ממשיכים לעבוד */
    const ALIAS = { hair: { dark_brown: 'brown', light_brown: 'brown' } };
    const chips = (key, id) => {
      if (!p.has(key)) return;
      const map = ALIAS[id] || {};
      const seen = [];
      p.get(key).split(',').filter(Boolean).forEach(v => {
        const mapped = map[v] || v;
        if (seen.indexOf(mapped) === -1) seen.push(mapped);
      });
      setChips(id, seen);
    };
    chips('g', 'group');
    chips('rel', 'religiosity');
    chips('d', 'district');
    chips('hair', 'hair');
    chips('eyes', 'eyes');

    if (p.has('edu')) {
      const sel = $('#education');
      const wanted = p.get('edu');
      if (Array.from(sel.options).some(o => o.value === wanted)) sel.value = wanted;
    }

    ['smk:smokes', 'drk:drinks', 'bald:bald', 'kids:wantsKids'].forEach(pairing => {
      const [key, name] = pairing.split(':');
      if (p.has(key)) setSeg(name, p.get(key));
    });
    if (p.has('single')) setSeg('excludeMarried', p.get('single') === '1' ? 'yes' : 'no');
    if (p.has('nofat')) setSeg('excludeObese', p.get('nofat') === '1' ? 'yes' : 'no');

    updateHero();
    $('#group').dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  async function copyLink(url) {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch (e) { /* חסום בהקשרים מסוימים — ננסה דרך אחרת */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }

  function flash(btn, msg) {
    const original = btn.dataset.label || btn.textContent;
    btn.dataset.label = original;
    btn.textContent = msg;
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { btn.textContent = btn.dataset.label; }, 2400);
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

  /* אף פעם לא בכתיב מדעי: "1.6e-7%" אינו מספר שאפשר לקרוא.
     toFixed לעולם אינו מייצר מעריך, בשונה מ-toExponential ומ-toPrecision. */
  function formatPercent(p) {
    if (!(p > 0)) return '0%';
    if (p >= 10) return p.toFixed(1).replace(/\.0$/, '') + '%';
    if (p >= 1) return p.toFixed(1) + '%';
    if (p >= 0.1) return p.toFixed(2) + '%';
    if (p >= 0.01) return p.toFixed(3) + '%';
    if (p >= 0.001) return p.toFixed(4) + '%';
    const s = p.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
    return (Number(s) === 0 ? '0' : s) + '%';
  }

  let lastShare = null;

  function render(res, c) {
    const noun = c.sex === 'male' ? 'גברים' : 'נשים';
    const verb = c.sex === 'male' ? 'עומדים' : 'עומדות';
    const one  = c.sex === 'male' ? 'אחד' : 'אחת';
    const verb1 = c.sex === 'male' ? 'עומד' : 'עומדת';

    /* מתחת לאדם אחד אין מה להציג: אחוז כמו 0.00000016% מתאר שבריר של אדם,
       ולכן הכותרת מראה 0 והמשפט מתאר שאין כאלה. שתי השורות נגזרות מאותה
       החלטה אחת ולכן אינן יכולות לסתור זו את זו. */
    const count = Math.round(res.count);
    const shownPercent = count < 1 ? 0 : res.percent;

    $('#resultPct').innerHTML = ltr(formatPercent(shownPercent));

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

    /* הקישור משקף את התוצאה שעל המסך, וגם נכנס לשורת הכתובת */
    const url = buildShareUrl(c);
    const pctText = $('#resultPct').textContent.trim();
    lastShare = {
      url: url,
      text: `${pctText} ${c.sex === 'male' ? 'מהגברים' : 'מהנשים'} בישראל ` +
            `${c.sex === 'male' ? 'עומדים' : 'עומדות'} בסטנדרטים שלי`
    };
    try { history.replaceState(null, '', url); } catch (e) { /* לא קריטי */ }
    $('#shareFallback').hidden = true;

    const box = $('#result');
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* מספר הכוכבים במאגר. נקודת קצה ציבורית ללא אימות; אם היא חסומה או
     מוגבלת בקצב, פשוט לא מציגים מספר — הקישור עצמו עובד בכל מקרה. */
  function initStarCount() {
    const link = $('#starBtn');
    const out = $('#starCount');
    if (!link || !out) return;
    const m = link.href.match(/github\.com\/([^/]+)\/([^/?#]+)/);
    if (!m) return;
    fetch(`https://api.github.com/repos/${m[1]}/${m[2]}`, { headers: { Accept: 'application/vnd.github+json' } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d || typeof d.stargazers_count !== 'number') return;
        out.textContent = nf.format(d.stargazers_count);
        out.hidden = false;
      })
      .catch(() => { /* אין מספר — לא נורא */ });
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
    initStarCount();
    updateHero();

    function run() {
      const c = readCriteria();
      render(CALC.calculate(c), c);
    }

    $('#form').addEventListener('submit', e => {
      e.preventDefault();
      run();
    });

    $('#shareBtn').addEventListener('click', async () => {
      if (!lastShare) return;
      const btn = $('#shareBtn');
      if (navigator.share) {
        try {
          await navigator.share({ title: 'מתאים?', text: lastShare.text, url: lastShare.url });
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') return;   /* המשתמש ביטל */
        }
      }
      if (await copyLink(lastShare.url)) {
        flash(btn, 'הקישור הועתק');
      } else {
        const box = $('#shareFallback');
        $('#shareUrl').value = lastShare.url;
        box.hidden = false;
        $('#shareUrl').select();
        flash(btn, 'העתיקו ידנית');
      }
    });

    /* קישור משותף — משחזרים את הבחירות ומריצים מיד */
    if (applyShareUrl()) run();

    $('#resetBtn').addEventListener('click', () => {
      $('#result').hidden = true;
      lastShare = null;
      try { history.replaceState(null, '', location.pathname); } catch (e) { /* לא קריטי */ }
      $('#calc').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
})();
