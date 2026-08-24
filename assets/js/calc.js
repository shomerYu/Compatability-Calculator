/*
 * calc.js — מנוע החישוב
 * ------------------------------------------------------------------
 * המודל: סכימה על פני כל שנות הגיל בטווח שנבחר. לכל שנת גיל נלקח
 * גודל האוכלוסייה בפועל, ומוכפל בהסתברויות המותנות של שאר התנאים.
 * ההנחה היא אי-תלות מותנית בגיל ובמין בין התנאים השונים
 * (למעט אזור המגורים והאלכוהול, המותנים גם בקבוצת האוכלוסייה).
 */

const CALC = (() => {
  'use strict';

  const D = typeof DATA !== 'undefined' ? DATA : require('./data.js');

  /* פונקציית ההתפלגות המצטברת הנורמלית — קירוב Abramowitz & Stegun */
  function normalCdf(x, mean, sd) {
    const z = (x - mean) / (sd * Math.SQRT2);
    return 0.5 * (1 + erf(z));
  }

  function erf(x) {
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
          a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
  }

  /* ההסתברות שערך לוג-נורמלי גדול או שווה ל-x */
  function logNormalTail(x, median, mean) {
    if (x <= 0) return 1;
    const ratio = mean / median;
    const sigma = Math.sqrt(2 * Math.log(ratio));
    const mu = Math.log(median);
    return 1 - normalCdf(Math.log(x), mu, sigma);
  }

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  /* ---- הסתברויות מותנות בודדות ---- */

  function pHeight(sex, minCm, maxCm) {
    const h = D.HEIGHT[sex];
    return clamp01(normalCdf(maxCm + 0.5, h.mean, h.sd) - normalCdf(minCm - 0.5, h.mean, h.sd));
  }

  function groupShares(age) {
    return D.pickBand(D.GROUP_BANDS, age).shares;
  }

  /* ההסתברות להשתייך לקבוצות הנבחרות, בגיל נתון */
  function pGroup(age, selectedGroups) {
    const shares = groupShares(age);
    if (!selectedGroups || selectedGroups.length === 0) return 1;
    let s = 0;
    for (const g of selectedGroups) s += (shares[g] || 0);
    return clamp01(s / 100);
  }

  /* התפלגות מנורמלת של קבוצות אוכלוסייה בתוך הבחירה — לצורך התניות */
  function groupMix(age, selectedGroups) {
    const shares = groupShares(age);
    const keys = (selectedGroups && selectedGroups.length)
      ? selectedGroups
      : D.GROUPS.map(g => g.id);
    let total = 0;
    const mix = {};
    for (const g of keys) { mix[g] = shares[g] || 0; total += mix[g]; }
    if (total === 0) return {};
    for (const g of keys) mix[g] /= total;
    return mix;
  }

  function pReligiosity(mix, selectedLevels) {
    if (!selectedLevels || selectedLevels.length === 0) return 1;
    /* מידת הדתיות נמדדת בסקר החברתי באוכלוסייה היהודית בלבד.
       עבור קבוצות אחרות המסנן אינו חל ולכן אינו מפחית אותן. */
    let p = 0;
    for (const [g, w] of Object.entries(mix)) {
      if (g === 'jewish') {
        let s = 0;
        for (const lvl of selectedLevels) s += D.RELIGIOSITY.jewish[lvl] || 0;
        p += w * s;
      } else {
        p += w * 1;
      }
    }
    return clamp01(p);
  }

  function pDistrict(mix, selectedDistricts) {
    if (!selectedDistricts || selectedDistricts.length === 0) return 1;
    let p = 0;
    for (const [g, w] of Object.entries(mix)) {
      const dist = D.DISTRICT_BY_GROUP[g] || D.DISTRICT_BY_GROUP.jewish;
      let s = 0;
      for (const d of selectedDistricts) s += dist[d] || 0;
      p += w * s;
    }
    return clamp01(p);
  }

  function pEducationAtLeast(sex, age, minLevelId) {
    if (!minLevelId || minLevelId === 'any') return 1;
    const band = D.pickBand(D.EDUCATION_BANDS, age);
    const dist = band[sex];
    const idx = D.EDUCATION_LEVELS.findIndex(l => l.id === minLevelId);
    if (idx < 0) return 1;
    let s = 0;
    for (let i = idx; i < dist.length; i++) s += dist[i];
    return clamp01(s);
  }

  function pIncomeAtLeast(sex, age, minIncome, eduFactor) {
    if (!minIncome || minIncome <= 0) return 1;
    const inc = D.INCOME[sex];
    const ageF = D.pickBand(D.INCOME.ageFactorBands, age).f;
    const empBand = D.pickBand(D.INCOME.employmentBands, age);
    const employed = empBand[sex];
    const f = ageF * (eduFactor || 1);
    return clamp01(employed * logNormalTail(minIncome, inc.median * f, inc.mean * f));
  }

  /* השכלה והכנסה מחושבות יחד ולא כשני תנאים בלתי תלויים: מי שיש לו תואר
     משתכר יותר, ולכן הכפלה נפרדת של שני הסינונים מורידה את התוצאה הרבה
     מתחת למציאות. הסכימה עוברת על רמות ההשכלה שעומדות בתנאי, ולכל אחת
     מחשבת את ההכנסה בהינתן אותה רמה.
     המקדמים מנורמלים לממוצע 1 לפי התפלגות ההשכלה באותו גיל ומין, כך
     שרמת ההכנסה הכללית — שכוילה מהממוצע והחציון — אינה זזה. */
  function eduIncomeFactors(sex, age) {
    const dist = D.pickBand(D.EDUCATION_BANDS, age)[sex];
    const raw = D.INCOME.byEducation;
    let base = 0;
    for (let i = 0; i < dist.length; i++) base += dist[i] * raw[i];
    return { dist: dist, factor: i => (base > 0 ? raw[i] / base : 1) };
  }

  function pEducationAndIncome(sex, age, minLevelId, minIncome) {
    const { dist, factor } = eduIncomeFactors(sex, age);
    let from = 0;
    if (minLevelId && minLevelId !== 'any') {
      from = D.EDUCATION_LEVELS.findIndex(l => l.id === minLevelId);
      if (from < 0) from = 0;
    }
    let p = 0;
    for (let i = from; i < dist.length; i++) {
      if (dist[i] <= 0) continue;
      p += dist[i] * pIncomeAtLeast(sex, age, minIncome, factor(i));
    }
    return clamp01(p);
  }

  /* צבע עיניים מותנה בצבע שיער — ראו EYES_BY_HAIR ב-data.js */
  function pHairAndEyes(hairSel, eyeSel) {
    const hairs = (hairSel && hairSel.length)
      ? D.HAIR.options.filter(o => hairSel.indexOf(o.id) !== -1)
      : D.HAIR.options;
    let p = 0;
    for (const h of hairs) {
      const row = D.EYES_BY_HAIR[h.id];
      if (!row) { p += h.p; continue; }
      if (!eyeSel || !eyeSel.length) { p += h.p; continue; }
      let inner = 0;
      for (const e of eyeSel) inner += row[e] || 0;
      p += h.p * inner;
    }
    return clamp01(p);
  }

  function pSmokes(sex, age) {
    const base = D.SMOKING[sex];
    const f = D.pickBand(D.SMOKING.ageFactorBands, age).f;
    return clamp01(base * f);
  }

  function pDrinks(sex, mix) {
    const base = D.DRINKING[sex];
    let factor = 0;
    let total = 0;
    for (const [g, w] of Object.entries(mix)) {
      factor += w * (D.DRINKING.groupFactor[g] ?? 1);
      total += w;
    }
    if (total > 0) factor /= total;
    return clamp01(base * factor);
  }

  function pObese(sex, age) {
    const base = D.OBESITY[sex];
    const f = D.pickBand(D.OBESITY.ageFactorBands, age).f;
    return clamp01(base * f);
  }

  /* ההסתברות שאדם מהמין המבוקש נמשך למין של המחפש/ת.
     ביסקסואלים נספרים בשני הכיוונים. אומדן — ראו ORIENTATION ב-data.js. */
  function pOrientation(targetSex, seekerSex, age) {
    const o = D.ORIENTATION[targetSex];
    if (!o || !seekerSex) return 1;
    const f = D.pickBand(D.ORIENTATION.ageFactorBands, age).f;
    const bi = Math.min(1, o.bi * f);
    const homo = Math.min(1, o.homo * f);
    const straight = Math.max(0, 1 - bi - homo - o.none);
    return clamp01(targetSex === seekerSex ? homo + bi : straight + bi);
  }

  /* קרחת נראית לעין. אומדן — ראו BALDNESS_BANDS ב-data.js. */
  function pBald(sex, age) {
    return clamp01(D.pickBand(D.BALDNESS_BANDS, age)[sex]);
  }

  function pUnmarried(sex, age) {
    return clamp01(D.pickBand(D.UNMARRIED_BANDS, age)[sex]);
  }

  function pWantsKids(age) {
    return clamp01(D.pickBand(D.WANTS_KIDS_BANDS, age).p);
  }

  /* ---------------------------------------------------------------
   * החישוב המרכזי
   * criteria = {
   *   sex: 'female' | 'male',
   *   ageMin, ageMax, heightMin, heightMax, minIncome,
   *   groups: [], religiosity: [], districts: [],
   *   education: 'any' | levelId,
   *   smokes: 'any'|'yes'|'no', drinks: 'any'|'yes'|'no',
   *   wantsKids: 'any'|'yes'|'no',
   *   excludeMarried: bool, excludeObese: bool,
   *   hair: [], eyes: []
   * }
   * ------------------------------------------------------------- */
  function calculate(c) {
    const sex = c.sex;
    let denominator = 0;
    for (let a = D.AGE_MIN; a <= D.AGE_MAX; a++) denominator += D.AGE_TABLE[a][sex];

    let ageOnly = 0;   /* האוכלוסייה בטווח הגיל בלבד */
    let matched = 0;

    const ageMin = Math.max(D.AGE_MIN, c.ageMin);
    const ageMax = Math.min(D.AGE_MAX, c.ageMax);

    const pH = pHeight(sex, c.heightMin, c.heightMax);
    const pLooks = pHairAndEyes(c.hair, c.eyes);

    for (let a = ageMin; a <= ageMax; a++) {
      const base = D.AGE_TABLE[a][sex];
      ageOnly += base;

      const mix = groupMix(a, c.groups);
      let p = 1;
      p *= pH;
      p *= pOrientation(sex, c.seekerSex, a);
      p *= pGroup(a, c.groups);
      p *= pReligiosity(mix, c.religiosity);
      p *= pDistrict(mix, c.districts);
      p *= pEducationAndIncome(sex, a, c.education, c.minIncome);

      if (c.smokes === 'yes') p *= pSmokes(sex, a);
      else if (c.smokes === 'no') p *= (1 - pSmokes(sex, a));

      if (c.drinks === 'yes') p *= pDrinks(sex, mix);
      else if (c.drinks === 'no') p *= (1 - pDrinks(sex, mix));

      if (c.wantsKids === 'yes') p *= pWantsKids(a);
      else if (c.wantsKids === 'no') p *= (1 - pWantsKids(a));

      if (c.excludeMarried) p *= pUnmarried(sex, a);
      if (c.excludeObese) p *= (1 - pObese(sex, a));

      if (c.bald === 'yes') p *= pBald(sex, a);
      else if (c.bald === 'no') p *= (1 - pBald(sex, a));

      p *= pLooks;

      matched += base * p;
    }

    return {
      percent: denominator > 0 ? (matched / denominator) * 100 : 0,
      count: matched,
      totalPool: denominator,
      ageRangePool: ageOnly,
      breakdown: buildBreakdown(c, sex, ageMin, ageMax, denominator, pH, pLooks)
    };
  }

  /* פירוט השפעת כל תנאי בנפרד — כל שורה היא שיעור השורדים מהתנאי */
  function buildBreakdown(c, sex, ageMin, ageMax, denominator, pH, pLooks) {
    const rows = [];
    const m = sex === 'male';
    const T = {
      smokes: m ? 'מעשן' : 'מעשנת',
      noSmokes: m ? 'לא מעשן' : 'לא מעשנת',
      drinks: m ? 'שותה אלכוהול' : 'שותה אלכוהול',
      noDrinks: m ? 'לא שותה אלכוהול' : 'לא שותה אלכוהול',
      wants: m ? 'רוצה ילדים' : 'רוצה ילדים',
      noWants: m ? 'לא רוצה ילדים' : 'לא רוצה ילדים',
      single: m ? 'לא נשוי' : 'לא נשואה',
      bald: m ? 'קירח' : 'קירחת',
      noBald: m ? 'לא קירח' : 'לא קירחת'
    };
    /* ממוצע משוקלל של הסתברות תנאי על פני טווח הגיל */
    function weightedAvg(fn) {
      let num = 0, den = 0;
      for (let a = ageMin; a <= ageMax; a++) {
        const w = D.AGE_TABLE[a][sex];
        num += w * fn(a);
        den += w;
      }
      return den > 0 ? num / den : 1;
    }

    let poolAge = 0;
    for (let a = ageMin; a <= ageMax; a++) poolAge += D.AGE_TABLE[a][sex];
    rows.push({ label: `גיל \u2066${ageMin}\u2013${ageMax}\u2069`, share: denominator ? poolAge / denominator : 0 });

    rows.push({ label: `גובה \u2066${c.heightMin}\u2013${c.heightMax}\u2069 ס"מ`, share: pH });

    if (c.seekerSex) {
      const verb = m ? 'נמשכים' : 'נמשכות';
      const toward = c.seekerSex === 'male' ? 'לגברים' : 'לנשים';
      rows.push({
        label: `${verb} ${toward} (אומדן)`,
        share: weightedAvg(a => pOrientation(sex, c.seekerSex, a))
      });
    }

    if (c.groups && c.groups.length) {
      const labels = c.groups.map(g => (D.GROUPS.find(x => x.id === g) || {}).label).join(', ');
      rows.push({ label: labels, share: weightedAvg(a => pGroup(a, c.groups)) });
    }
    if (c.religiosity && c.religiosity.length) {
      const labels = c.religiosity.map(r => D.RELIGIOSITY.labels[r]).join(', ');
      rows.push({ label: labels, share: weightedAvg(a => pReligiosity(groupMix(a, c.groups), c.religiosity)) });
    }
    if (c.districts && c.districts.length) {
      const labels = c.districts.map(d => (D.DISTRICTS.find(x => x.id === d) || {}).label).join(', ');
      rows.push({ label: labels, share: weightedAvg(a => pDistrict(groupMix(a, c.groups), c.districts)) });
    }
    if (c.education && c.education !== 'any') {
      const lvl = D.EDUCATION_LEVELS.find(l => l.id === c.education);
      /* "תואר שני ומעלה" כבר מסתיים ב"ומעלה" — לא מוסיפים פעמיים */
      const name = lvl ? lvl.label : '';
      const suffix = /ומעלה$/.test(name) ? '' : ' ומעלה';
      rows.push({ label: `השכלה: ${name}${suffix}`, share: weightedAvg(a => pEducationAtLeast(sex, a, c.education)) });
    }
    if (c.minIncome > 0) {
      /* השורה מותנית בהשכלה שכבר נחתכה למעלה, כך שמכפלת שתי השורות היא
         ההסתברות המשותפת הנכונה ולא מכפלה של שני תנאים בלתי תלויים */
      const joint = weightedAvg(a => pEducationAndIncome(sex, a, c.education, c.minIncome));
      const edu = weightedAvg(a => pEducationAtLeast(sex, a, c.education));
      rows.push({
        label: `הכנסה מ-\u2066${c.minIncome.toLocaleString('he-IL')}\u2069 ש"ח`,
        share: edu > 0 ? clamp01(joint / edu) : 0
      });
    }
    if (c.smokes !== 'any') {
      rows.push({ label: c.smokes === 'yes' ? T.smokes : T.noSmokes,
        share: weightedAvg(a => c.smokes === 'yes' ? pSmokes(sex, a) : 1 - pSmokes(sex, a)) });
    }
    if (c.drinks !== 'any') {
      rows.push({ label: c.drinks === 'yes' ? T.drinks : T.noDrinks,
        share: weightedAvg(a => { const m = groupMix(a, c.groups); return c.drinks === 'yes' ? pDrinks(sex, m) : 1 - pDrinks(sex, m); }) });
    }
    if (c.wantsKids !== 'any') {
      rows.push({ label: c.wantsKids === 'yes' ? T.wants : T.noWants,
        share: weightedAvg(a => c.wantsKids === 'yes' ? pWantsKids(a) : 1 - pWantsKids(a)) });
    }
    if (c.excludeMarried) {
      rows.push({ label: T.single, share: weightedAvg(a => pUnmarried(sex, a)) });
    }
    if (c.excludeObese) {
      rows.push({ label: 'ללא השמנה (BMI מתחת ל-30)', share: weightedAvg(a => 1 - pObese(sex, a)) });
    }
    if (c.bald && c.bald !== 'any') {
      rows.push({
        label: (c.bald === 'yes' ? T.bald : T.noBald) + ' (אומדן)',
        share: weightedAvg(a => c.bald === 'yes' ? pBald(sex, a) : 1 - pBald(sex, a))
      });
    }
    if ((c.hair && c.hair.length) || (c.eyes && c.eyes.length)) {
      const both = (c.hair && c.hair.length) && (c.eyes && c.eyes.length);
      rows.push({
        label: (both ? 'צבע שיער ועיניים' : (c.hair && c.hair.length) ? 'צבע שיער' : 'צבע עיניים')
               + ' (אומדן)',
        share: pLooks
      });
    }
    return rows;
  }

  return { calculate, normalCdf, logNormalTail, pHeight, pIncomeAtLeast, pOrientation, pBald,
           pEducationAndIncome, pHairAndEyes };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CALC;
