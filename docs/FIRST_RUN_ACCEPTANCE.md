# Market Flow US — First-Run Acceptance

זהו מסלול הקבלה הסדרתי למחשב Windows שמריץ את Market Flow US בפעם הראשונה.

הכלל החשוב ביותר: **מבצעים checkpoint אחד בכל פעם ועוצרים ב־FAIL הראשון.** אין לדלג קדימה כדי לאסוף רעש נוסף. אחרי תיקון חוזרים מה־checkpoint הירוק האחרון, אלא אם התיקון ביטל evidence קודם.

אין להעתיק או לשמור בדוחות credentials, cookies, tokens, authorization/session data, account identifiers, full authenticated responses או private browser state.

## FR-0 — Freeze exact candidate

לפני התקנה או בדיקה, מתוך תיקיית הריפו:

```text
git fetch origin
git checkout main
git pull --ff-only
git status --short
git rev-parse HEAD
```

PASS:

- `git status --short` ריק;
- branch הוא `main`;
- `HEAD` הוא ה־candidate שאושר לבדיקה;
- אין PR release פתוח או שינוי לא ממוזג שמחליף את ה־candidate.

שמור את ה־SHA. כל evidence כבד/authenticated בהמשך חייב להיות משויך אליו.

## FR-1 — Host prerequisite preflight

בדוק:

```text
node --version
npm --version
git --version
powershell -NoProfile -Command "$PSVersionTable.PSVersion.ToString()"
```

נדרש Node.js `24.x`, npm דרך אותה התקנת Node, Git ו־PowerShell תקינים, disk write תקין ו־loopback מקומי זמין.

אל תריץ `npm ci` לפני ש־FR-1 ירוק.

## FR-2 — Repository acquisition/update

אם זו התקנה ראשונה, clone את `LirazShay/market-flow-us`. אם הריפו כבר קיים, עדכן אותו ל־accepted `main` SHA.

PASS: `HEAD` תואם ל־FR-0 וה־working tree נקי לפני outputs/tests.

## FR-3 — Deterministic dependency install

הפעל:

```text
SETUP.cmd
```

הוא מבצע Node 24 preflight, `npm ci` ו־Playwright Chromium install.

PASS: setup יוצא בהצלחה; `node_modules` קיים; Chromium המוצמד הותקן.

## FR-4 — Fast local correctness

הרץ בנפרד:

```text
npm run test:unit
npm run test:service
```

PASS: שתי הסוויטות ירוקות. שמור wall-clock timing לצורכי אבחון בלבד.

## FR-5 — Browser build + Chromium E2E

```text
npm run build:browser
npm run test:e2e
```

PASS: browser artifacts נבנו תחת `dist`, וכל E2E ירוק ללא retry/timeout שמסתיר defect.

## FR-6 — Local demo/UI smoke

```text
START_DEMO.cmd
```

בדוק ידנית:

- demo נפתח;
- runtime מגיע ל־running;
- Current מציג synthetic U.S. rows;
- Detail/History נפתח משורה;
- Scanner מריץ built-in בטוח;
- Support Snapshot זמין;
- `Ctrl+C` עוצר נקי;
- restart לא משחית את `.demo/market-flow-us.duckdb`.

## FR-7 — Local Fake Leumi static acceptance

```text
RUN_LOCAL_ACCEPTANCE.cmd static
```

PASS: כמה responses זהים מושלמים מקבלים durable ACK; History גדל לכל cycle; Latest נשאר זהה; universe revision נשמר; Current/Security/History ו־ownership תקינים; clean stop; report sanitized ומכיל candidate/profile.

אין דרישת movement בשלב הזה.

## FR-8 — Local Fake Leumi dynamic/recovery/restart

הרץ כל תת־שלב בנפרד:

```text
RUN_LOCAL_ACCEPTANCE.cmd moving
RUN_LOCAL_ACCEPTANCE.cmd membership
RUN_LOCAL_ACCEPTANCE.cmd provider-recovery
RUN_LOCAL_ACCEPTANCE.cmd restart
```

PASS כולל:

- moving values מגיעים ל־Current ונשמרים ב־History;
- add/remove membership מקבל revision ACK לפני commit של אותה response;
- provider failure נכשל fail-closed ואז recovery חוזר ל־commit תקין;
- restart משמר authority שנשמרה;
- Scanner רואה את התנועה הדטרמיניסטית.

## FR-9 — Target-machine load acceptance

מהצר לרחב:

```text
RUN_LOCAL_ACCEPTANCE.cmd isolated
RUN_LOCAL_ACCEPTANCE.cmd target
```

`isolated` חייב לכלול persistence וגם one-trading-day read/Scanner probes בלי שכבות browser/HTTP לא רלוונטיות.

`target` הוא הפרופיל המייצג:

```text
4096 securities × 180 completed end-to-end cycles = 737280 history rows
```

ה־target-machine acceptance ceiling לפרופיל end-to-end הוא חמש דקות. שמור את ה־sanitized reports ואת ה־candidate SHA.

## FR-10 — Daily DB lifecycle

עם active-day data ו־saved Scanner query קיימים:

1. עצור producer/service עם `Ctrl+C`.
2. ודא שאין process שמחזיק את ה־DB.
3. הפעל:

```text
NEW_TRADING_DAY.cmd
```

PASS:

- prior-day DB archived תחת `data/archive/`;
- active market tables מתחילים נקיים;
- saved Scanner queries נשמרים;
- אין rollover בזמן session פעילה.

## FR-11 — Real-provider deployment smoke

1. התחבר רגיל לעמוד הספק בדפדפן והשאר אותו פתוח.
2. הפעל:

```text
START_MARKET_FLOW_US.cmd
```

3. כאשר מתבקש URL, הדבק את כתובת העמוד מה־Address Bar. ה־launcher מצמצם אותה ל־Origin המאושר.
4. הוסף/עדכן Bookmark מה־bookmarklet שנוצר תחת `dist/browser/`.
5. הפעל את ה־bookmarklet ידנית בעמוד המחובר.

PASS: runtime/service מתחברים ומגיעים ל־running או לשגיאת provider יציבה ומאובחנת, בלי להעתיק authentication material.

אם יש provider error — עצור ותקן לפני FR-12.

## FR-12 — Authenticated closed/static-market acceptance

הכן את ה־SHA-bound live gate:

```text
PREPARE_LIVE_VERIFICATION.cmd
```

הפעל את ה־bookmarklet שנוצר בעמוד הספק המחובר.

PASS של ה־gate הנוכחי הוא מחמיר יותר מהמינימום של TREE: הוא דורש לפחות 20 complete committed provider cycles ולפחות 60 שניות, ובשוק סגור/סטטי ערכים זהים ברצף חוקיים. בנוסף נדרשים validation, universe revision handling, Current/Security/History, bounded Scanner, ownership/status ו־clean stop, עם sanitized SHA-bound report.

אין דרישת movement בשלב הזה.

## FR-13 — Authenticated market-open acceptance

על אותו accepted candidate, בזמן שוק פעיל, הפעל שוב את ה־SHA-bound gate.

PASS דורש:

```text
at least 20 consecutive complete ScreenerHulPaging3 cycles
spanning at least 60 seconds
+ observable provider market/freshness change
+ committed Current/History reflection
+ bounded Scanner
+ correct ownership/status
+ clean stop
```

ה־live gate הרגיל מוכיח את provider/commit/read boundary אך אינו מסמן movement-specific PASS בעצמו; לכן יש לאמת בנוסף שינוי provider market/freshness אמיתי והשתקפותו ב־Current/History. אם לא נצפה שינוי אמיתי, תוצאת movement נשארת `pending/inconclusive`; אסור להחליש את ה־gate או לסמן PASS ידנית.

## FR-14 — Final evidence and operational handoff

רשום בקיצור:

- accepted SHA;
- סטטוס FR-0..FR-13;
- שמות/מיקומי sanitized reports שנשמרו מקומית;
- active DB path: `data/market-flow-us.duckdb`;
- daily stop/archive/new-day procedure עבר בפועל;
- normal start/stop commands ידועים;
- Support Snapshot recovery path ידוע;
- אין blocking defect פתוח;
- `main` CI ירוק אחרי כל fix שנדרש במהלך acceptance.

רק לאחר שכל success evidence של TREE `7.4` ירוק וה־PR/merge/main-green closure הושלם, מותר להכריז על completion של המוצר.

## Troubleshooting routing

בעת כשל, החזר רק את ה־checkpoint הנוכחי ואת ה־sanitized error/report שלו. אין צורך לשלוח credentials, cookies, session data או full provider responses.

מסמכים משלימים:

- `docs/LOCAL_FAKE_ACCEPTANCE.md` — פרופילי Fake Leumi/workload;
- `docs/LIVE_VERIFICATION.md` — authenticated SHA-bound gate;
- `docs/USER_GUIDE.md` — שימוש שוטף במוצר;
- `START_HERE.md` — כניסה קצרה להפעלה היומיומית.
