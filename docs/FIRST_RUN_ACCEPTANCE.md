# Market Flow US — First-Run Acceptance

זהו מסלול הקבלה הסדרתי למחשב Windows שמריץ את Market Flow US בפעם הראשונה.

הכלל החשוב ביותר: **מבצעים checkpoint אחד בכל פעם ועוצרים ב־FAIL הראשון.** אין לדלג קדימה כדי לאסוף רעש נוסף. אחרי תיקון חוזרים מה־checkpoint הירוק האחרון, אלא אם התיקון ביטל evidence קודם.

אין להעתיק או לשמור בדוחות credentials, cookies, tokens, authorization/session data, account identifiers, full authenticated responses או private browser state.

## FR-0 — Freeze exact candidate

זהו checkpoint של release/GitHub truth, לא פעולה על מחשב היעד. לפני שמבקשים מהמשתמש להתקין או לבדוק משהו, המאמת קורא fresh `main` ומוודא:

- `STATUS.yaml` ו־`.planning/STATUS.yaml` עדיין מצביעים על TREE `7.4`;
- `.planning/EXECUTOR_HANDOFF.md` עדיין מצמיד את ה־product candidate המדויק:

```text
f2789a4ec43e0878688aa9ea29c647e40a1154b6
```

- commits מאוחרים יותר ב־`main` הם planning/docs/metadata בלבד ואינם מחליפים את ה־candidate;
- אין PR release פתוח או product work לא ממוזג שמחליף את ה־candidate.

PASS: ה־candidate לעיל מוקפא כ־accepted product SHA להמשך המסלול. אין דרישת checkout מקומי ב־FR-0.

FAIL: זהות ה־candidate אינה חד־משמעית, ה־status כבר לא מאשר `7.4`, או קיים product/release work שמחליף אותו. עצור לפני FR-1.

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

אם זו התקנה ראשונה, clone את `LirazShay/market-flow-us`. אם הריפו כבר קיים, השתמש בו רק אם ה־working tree נקי. לאחר מכן pin את ה־checkout ל־accepted SHA שהוקפא ב־FR-0; אין דרישה שה־branch יהיה `main`, ו־`main` מאוחר יותר עם metadata בלבד אינו ה־product candidate.

בריפו קיים:

```text
git fetch origin
git status --short
git switch --detach f2789a4ec43e0878688aa9ea29c647e40a1154b6
git status --short
git rev-parse HEAD
```

אם `git status --short` הראשון אינו ריק — עצור לפני `git switch` ואל תדרוס שינוי מקומי.

PASS:

- `git status --short` ריק לפני ואחרי החלפת ה־candidate;
- `HEAD` הוא בדיוק `f2789a4ec43e0878688aa9ea29c647e40a1154b6`;
- detached checkout תקין ומועדף ל־acceptance; אין צורך להיות על branch `main`;
- אין substitution שקט ל־SHA מאוחר יותר של metadata בלבד.

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
- Demo Buy זמין מה־Scanner ומסך Demo Buy נפתח;
- progressive outcomes מוצגים ו־targeted `Refresh observation` עובד;
- `Investigate with AI` זמין עבור observation קיים ואינו שולח דבר אוטומטית החוצה;
- Generate/Regenerate מציגים נתיב pack יחסי בלבד וה־clipboard כולל fallback ידני;
- Support Snapshot זמין;
- `Ctrl+C` עוצר נקי;
- restart לא משחית את `.demo/market-flow-us.duckdb`.

## FR-7 — Local Fake Leumi static acceptance

```text
RUN_LOCAL_ACCEPTANCE.cmd static
```

PASS: כמה responses זהים מושלמים מקבלים durable ACK; History גדל לכל cycle; Latest נשאר זהה; universe revision נשמר; Current/Security/History ו־ownership תקינים; clean stop; report sanitized ומכיל candidate/profile.

אין דרישת movement בשלב הזה.

## FR-8 — Local Fake Leumi dynamic/recovery/restart + post-feature closure

הרץ כל תת־שלב בנפרד:

```text
RUN_LOCAL_ACCEPTANCE.cmd moving
RUN_LOCAL_ACCEPTANCE.cmd membership
RUN_LOCAL_ACCEPTANCE.cmd provider-recovery
RUN_LOCAL_ACCEPTANCE.cmd restart
RUN_LOCAL_ACCEPTANCE.cmd demo-buy-runtime
RUN_LOCAL_ACCEPTANCE.cmd demo-buy-outcomes
RUN_LOCAL_ACCEPTANCE.cmd ai-investigation-ui
RUN_LOCAL_ACCEPTANCE.cmd ai-pack-safety
```

אפשר להריץ רק את ארבעת תתי־השלבים החדשים יחד:

```text
RUN_LOCAL_ACCEPTANCE.cmd feature
```

או את כל FR-7/FR-8 הדטרמיניסטי יחד:

```text
RUN_LOCAL_ACCEPTANCE.cmd all
```

PASS כולל:

- `FR-8A` moving values מגיעים ל־Current ונשמרים ב־History;
- `FR-8B` add/remove membership מקבל revision ACK לפני commit של אותה response;
- `FR-8C` provider failure נכשל fail-closed ואז recovery חוזר ל־commit תקין, ו־Scanner רואה את התנועה הדטרמיניסטית;
- `FR-8D` restart משמר authority שנשמרה;
- `FR-8E` Scanner generation יוצר Demo Buy capture אמיתי דרך Browser → Service → DuckDB עם provenance/baseline תקינים;
- `FR-8F` Demo Buy מציג progressive outcomes, `Refresh latest` ו־targeted `Refresh observation` בלי לאבד paging/state;
- `FR-8G` Investigate with AI מוכיח position/context semantics, generate/regenerate ו־clipboard/fallback דרך ה־UI;
- `FR-8H` AI Investigation Pack נוצר דרך השירות האמיתי, מתקדם מ־`PARTIAL_OUTCOME` ל־`COMPLETE_OUTCOME` לאחר evidence נוסף, regeneration אינו דורס pack קודם, ואין leakage של operational/session canaries לקבצים/תגובה/diagnostics.

ה־`feature` וה־`all` אינם כוללים את workload הכבד של FR-9.

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

עם active-day data, Demo Buy captures ו־saved Scanner query קיימים:

1. עצור producer/service עם `Ctrl+C`.
2. ודא שאין process שמחזיק את ה־DB.
3. הפעל:

```text
NEW_TRADING_DAY.cmd
```

PASS:

- source DB תקין ב־schema v3 או v4 מתקבל לפי חוזה ה־migration/rollover;
- prior-day DB archived ללא שינוי תחת `data/archive/`;
- fresh active DB נוצר כ־schema v4;
- active market tables מתחילים נקיים;
- Demo Buy capture/item tables מתחילות נקיות ליום החדש;
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

PASS של ה־base gate מחמיר יותר מהמינימום של TREE: הוא דורש לפחות 20 complete committed provider cycles ולפחות 60 שניות, ובשוק סגור/סטטי ערכים זהים ברצף חוקיים. בנוסף נדרשים validation, universe revision handling, Current/Security/History, bounded Scanner, ownership/status ו־clean stop, עם sanitized SHA-bound report.

ל־FR-12 נדרש:

```text
overall = "PASS"
```

אין דרישת movement בשלב הזה. בשוק סטטי/לפני המסחר התוצאה הצפויה והתקינה יכולה להיות:

```text
overall = "PASS"
movement.status = "PENDING"
movement.code = "NO_MARKET_MOVEMENT_OBSERVED"
```

זה **FR-12 PASS**: החיבור האמיתי וה־authority path הוכחו, ורק הוכחת תנועה אמיתית נשארה ל־FR-13.

כדי להבדיל שוק סטטי מ־collector תקוע, חייבים לראות cycles חדשים: כל response מלאה, COMMIT ACK חדש לכל cycle, History גדל, ו־Current נשאר זהה רק משום שערכי המקור זהים.

### PRE-MARKET READINESS checkpoint

אם FR-0..FR-12 ירוקים, רשום:

```text
PRE-MARKET READINESS = PASS
FR-13 = PENDING MARKET MOVEMENT
```

שמור את ה־sanitized FR-12 report ואת ה־accepted candidate SHA.

אם לאחר מכן רק נפתח המסחר, ובינתיים **לא** השתנו candidate SHA, code/runtime, dependencies או machine configuration רלוונטי, אין צורך לחזור על FR-0..FR-12. ממשיכים ישירות ל־FR-13 על אותו candidate.

אם התגלה defect ותוקן, חוזרים ל־checkpoint הירוק האחרון שה־fix לא ביטל. שינוי candidate או שינוי runtime שמערער evidence קודם מחייב חזרה לנקודה המוקדמת ביותר שהושפעה.

## FR-13 — Authenticated market-open acceptance

על אותו accepted candidate, בזמן שוק פעיל, הפעל שוב את אותו SHA-bound gate.

ה־gate מפיק evidence מכני נפרד לתנועה מתוך **טווח ה־cycles של הריצה הנוכחית בלבד**. הוא אינו משתמש ב־`collectedAtMs` כדי להמציא תנועה; הוא מחפש שינוי בשדות provider שמורים (`Price`, `ChangePercent`, `BidRate`, `AskRate`, `DailyVolume`, `TradeDateTime`) ומוכיח את ה־witness דרך Current ו־History סמכותיים.

PASS של FR-13 דורש יחד:

```text
overall = "PASS"
movement.status = "PASS"
movement.observed = true
movement.currentReflected = true
movement.historyReflected = true
```

ובכך מתקיימים גם:

```text
at least 20 consecutive complete ScreenerHulPaging3 cycles
spanning at least 60 seconds
+ observable provider market/freshness change
+ committed Current/History reflection
+ bounded Scanner
+ correct ownership/status
+ clean stop
```

אם ה־base gate עובר אבל לא נצפה שינוי provider אמיתי:

```text
movement.status = "PENDING"
```

FR-13 נשאר `pending/inconclusive` ויש להריץ שוב מאוחר יותר. אסור להחליש את ה־gate או לסמן PASS ידנית.

אם נצפה שינוי אבל Current/History reflection לא הוכח:

```text
movement.status = "FAIL"
```

עוצרים ומתקנים לפני FR-14.

## FR-14 — Final evidence and operational handoff

רשום בקיצור:

- accepted SHA;
- סטטוס FR-0..FR-13, כולל FR-8A..FR-8H;
- אם נעשה two-pass run: FR-12 pre-market report + FR-13 market-open report על אותו accepted SHA;
- שמות/מיקומי sanitized reports שנשמרו מקומית;
- active DB path: `data/market-flow-us.duckdb`;
- daily stop/archive/new-day procedure עבר בפועל ויצר fresh schema v4;
- normal start/stop commands ידועים;
- Demo Buy/AI Investigation recovery path ידוע;
- Support Snapshot recovery path ידוע;
- אין blocking defect פתוח;
- `main` CI ירוק אחרי כל fix שנדרש במהלך acceptance.

רק לאחר שכל success evidence של TREE `7.4` ירוק וה־PR/merge/main-green closure הושלם, מותר להכריז על completion של המוצר.

## Troubleshooting routing

בעת כשל, החזר רק את ה־checkpoint הנוכחי ואת ה־sanitized error/report שלו. אין צורך לשלוח credentials, cookies, session data או full provider responses.

מסמכים משלימים:

- `docs/LOCAL_FAKE_ACCEPTANCE.md` — פרופילי Fake Leumi/workload, כולל Demo Buy/AI;
- `docs/LIVE_VERIFICATION.md` — authenticated SHA-bound gate;
- `docs/USER_GUIDE.md` — שימוש שוטף במוצר;
- `START_HERE.md` — כניסה קצרה להפעלה היומיומית.
