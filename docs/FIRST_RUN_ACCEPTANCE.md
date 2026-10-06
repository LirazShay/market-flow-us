# Market Flow US — First-Run Acceptance

זהו מסלול הקבלה הסדרתי למחשב Windows שמריץ את Market Flow US בפעם הראשונה.

הכלל החשוב ביותר: **מבצעים checkpoint אחד בכל פעם ועוצרים ב־FAIL הראשון.** אחרי תיקון חוזרים מה־checkpoint הירוק האחרון שה־fix לא ביטל.

אין להעתיק או לשמור בדוחות credentials, cookies, caller tokens, authorization/session data, account identifiers, raw authenticated responses או private browser state.

## FR-0 — Freeze exact post-order-service candidate

לפני כל בדיקה במחשב היעד, קרא fresh `main` וודא ש־TREE `8.4` נסגר וש־TREE `7.4` הוא השלב הנוכחי.

ה־product candidate שנקבע על ידי branch-8 deterministic reclosure הוא:

```text
28e950afc1c4bfe4322d0593f483d05d92553e2d
```

זהו SHA של המוצר אחרי מימוש ה־IBKR order-service. commits מאוחרים יותר שהם planning/docs/metadata בלבד אינם מחליפים אותו אוטומטית כמוצר שנבדק.

PASS:

- `.planning/EXECUTOR_HANDOFF.md` מצמיד את אותו SHA;
- `STATUS.yaml` / `.planning/STATUS.yaml` מאשרים TREE `7.4`;
- אין PR מוצר/release פתוח שמחליף את ה־candidate.

FAIL: זהות ה־candidate אינה חד־משמעית או `8.4` עדיין לא סגור.

## FR-1 — Host prerequisite preflight

בדוק:

```text
node --version
npm --version
git --version
powershell -NoProfile -Command "$PSVersionTable.PSVersion.ToString()"
```

נדרש:

- Node.js `24.x`;
- npm דרך אותה התקנת Node;
- Git ו־PowerShell תקינים;
- disk write תקין;
- loopback מקומי זמין;
- ports `8765` ו־`8770` אינם תפוסים על ידי process מתחרה;
- Chromium-family browser למסלול ה־market-data;
- Client Portal Gateway זמין בהמשך אם מבצעים את FR-11B.

אל תריץ `npm ci` לפני ש־FR-1 ירוק.

## FR-2 — Repository acquisition/update

אם זו התקנה ראשונה, clone את `LirazShay/market-flow-us`. אם הריפו כבר קיים, עצור אם `git status --short` אינו ריק.

לאחר fetch, pin את ה־checkout ל־candidate המדויק:

```text
git fetch origin
git status --short
git switch --detach 28e950afc1c4bfe4322d0593f483d05d92553e2d
git status --short
git rev-parse HEAD
```

PASS: ה־working tree נקי ו־`HEAD` הוא בדיוק ה־SHA לעיל.

## FR-3 — Deterministic dependency install

הרץ:

```text
SETUP.cmd
```

Expected:

```text
Node 24 preflight
→ npm ci
→ pinned Playwright Chromium install
→ setup complete
```

## FR-4 — Fast local correctness + order-service deterministic proof

הרץ בנפרד:

```text
npm run test:unit
npm run test:service
npm run test:acceptance:order
```

PASS: שלושתם ירוקים.

`test:acceptance:order` משתמש רק ב־synthetic provider/account data ומוכיח את מסלול ה־IBKR order-service ללא הרשאת מסחר אמיתית. הוא אינו נחשב real-order evidence.

## FR-5 — Browser build + Chromium E2E

```text
npm run build:browser
npm run test:e2e
```

PASS: browser artifacts נבנים תחת `dist`, וכל Chromium E2E ירוק ללא retry/timeout שמסתיר defect.

## FR-6 — Local demo/UI smoke

```text
START_DEMO.cmd
```

בדוק ידנית:

- runtime מגיע ל־running;
- Current מציג synthetic U.S. rows;
- Detail/History נפתח משורה;
- Scanner מריץ built-in בטוח;
- Demo Buy זמין ומציג progressive outcomes;
- targeted `Refresh observation` עובד;
- `Investigate with AI` זמין ואינו שולח דבר אוטומטית החוצה;
- Generate/Regenerate מחזירים רק product-relative pack metadata ויש clipboard fallback;
- Support Snapshot זמין;
- `Ctrl+C` עוצר נקי;
- restart לא משחית את `.demo/market-flow-us.duckdb`.

## FR-7 — Local Fake Leumi static acceptance

```text
RUN_LOCAL_ACCEPTANCE.cmd static
```

PASS: responses זהים מקבלים durable ACK, History גדל לכל cycle, Current רשאי להישאר זהה כי המקור זהה, universe/reads/ownership תקינים, clean stop, והדו״ח sanitized ו־SHA-bound.

אין דרישת movement.

## FR-8 — Local Fake dynamic/recovery/restart + Demo Buy/AI closure

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

אפשר גם:

```text
RUN_LOCAL_ACCEPTANCE.cmd feature
RUN_LOCAL_ACCEPTANCE.cmd all
```

PASS כולל movement ל־Current/History, membership revision ACK, fail-closed provider recovery, restart authority, Demo Buy provenance/outcomes, ו־AI Pack sharing-safety ללא operational/session leakage.

## FR-9 — Target-machine load acceptance

מהצר לרחב:

```text
RUN_LOCAL_ACCEPTANCE.cmd isolated
RUN_LOCAL_ACCEPTANCE.cmd target
```

ה־target profile הוא:

```text
4096 securities × 180 completed end-to-end cycles = 737280 history rows
```

ה־end-to-end ceiling הוא חמש דקות במחשב היעד. שמור רק sanitized reports ו־candidate SHA.

## FR-10 — Daily DB lifecycle

עם active-day data, Demo Buy capture/item ו־saved Scanner query קיימים:

1. עצור producer/service.
2. ודא שאין process שמחזיק את ה־DB.
3. הרץ:

```text
NEW_TRADING_DAY.cmd
```

PASS:

- source schema v3/v4 תקין מתקבל;
- archive אופציונלי שומר prior-day source ללא שינוי;
- fresh active DB הוא schema v4;
- market + Demo Buy state נקיים ליום החדש;
- saved Scanner queries נשמרים;
- running session מונע rollover.

ה־IBKR execution DuckDB נפרד ואינו חלק מ־New Trading Day.

## FR-11A — Market-data provider deployment smoke

1. התחבר רגיל לעמוד ספק ה־market-data והשאר אותו פתוח.
2. הרץ:

```text
START_MARKET_FLOW_US.cmd
```

3. הדבק את כתובת העמוד כאשר ה־launcher מבקש URL.
4. הפעל ידנית את ה־bookmarklet שנוצר.

PASS: runtime/service מגיעים ל־running או לשגיאת provider יציבה ומאובחנת ללא העתקת authentication material.

אם יש provider error — עצור ותקן לפני FR-12.

## FR-11B — IBKR CPGW + standalone order-service compatibility

זהו boundary נפרד ממסלול ה־market-data.

Prerequisite: Client Portal Gateway כבר רץ והמשתמש כבר authenticated אליו ידנית. המוצר אינו מבצע credential login אוטומטי.

### 11B-1 — deterministic standalone proof

הרץ:

```text
RUN_IBKR_ORDER_ACCEPTANCE.cmd
```

PASS: דו״ח sanitized עם `providerEvidence=SYNTHETIC_ONLY` ו־`realOrderSubmitted=false`, שמוכיח:

- local caller auth + browser-origin rejection;
- BUY/SELL preview;
- DRY_RUN ללא provider submit;
- requestId idempotency + restart token rotation;
- explicit fake-LIVE reply confirmation;
- partial fill / cancellation / full fill;
- `ACKNOWLEDGEMENT_UNKNOWN` reconciliation ללא blind resubmit;
- no-short-opening SELL guard;
- clean stop.

### 11B-2 — real CPGW session compatibility

הרץ:

```text
CHECK_IBKR_SESSION.cmd
```

אם ה־localhost certificate אינו trusted ונדרש fallback מתועד ומצומצם ל־CPGW בלבד:

```text
CHECK_IBKR_SESSION.cmd INSECURE_LOCALHOST_TLS
```

PASS: מתקבל sanitized session-compatibility result דרך ה־protected local order-service path. הבדיקה אינה שולחת order ואינה שומרת/מדפיסה caller token, provider account ID, credentials או raw authenticated body.

### 11B-3 — external trading permission

אם הרשאת המסחר האמיתית אינה זמינה, רשום בדיוק:

```text
PENDING_EXTERNAL_PERMISSION
```

זה מצב תקין של external evidence ואינו מוחלף ב־synthetic success.

אם permission כן קיימת, כל real-order verification חייב להיות user-initiated, bounded, SHA-bound ו־provider-compliant.

## FR-12 — Authenticated closed/static-market acceptance

```text
PREPARE_LIVE_VERIFICATION.cmd
```

הפעל את ה־bookmarklet בעמוד ה־market-data המאומת.

PASS של ה־base gate דורש לפחות 20 complete committed provider cycles ולפחות 60 שניות, יחד עם validation, universe handling, Current/Security/History, bounded Scanner, ownership/status ו־clean stop.

נדרש:

```text
overall = "PASS"
```

בשוק סגור/סטטי תוצאה חוקית יכולה להיות:

```text
overall = "PASS"
movement.status = "PENDING"
movement.code = "NO_MARKET_MOVEMENT_OBSERVED"
```

שוק סטטי חוקי רק אם cycles חדשים ממשיכים לקבל COMMIT ACK ו־History ממשיך לגדול.

### PRE-MARKET READINESS

אם FR-0..FR-12 ירוקים, כולל FR-11A/FR-11B, רשום:

```text
PRE-MARKET READINESS = PASS
FR-13 = PENDING MARKET MOVEMENT
```

`PENDING_EXTERNAL_PERMISSION` עבור real-order placement אופציונלי אינו מבטל את PRE-MARKET READINESS כאשר deterministic order acceptance ו־real CPGW session compatibility ירוקים.

אם רק נפתח המסחר ולא השתנו candidate/runtime/dependencies/machine configuration רלוונטיים — ממשיכים ישירות ל־FR-13.

## FR-13 — Authenticated market-open acceptance

על אותו accepted candidate, בזמן שוק פעיל, הרץ שוב את אותו SHA-bound market-data gate.

PASS דורש:

```text
overall = "PASS"
movement.status = "PASS"
movement.observed = true
movement.currentReflected = true
movement.historyReflected = true
```

וכן לפחות 20 consecutive complete provider cycles לאורך 60 שניות לפחות, market/freshness movement אמיתי, committed Current/History reflection, bounded Scanner, ownership/status תקינים ו־clean stop.

אם לא נצפה provider-field change אמיתי, movement נשאר `PENDING`. אם change נצפה אבל Current/History reflection לא הוכח, movement הוא `FAIL` ויש לתקן לפני FR-14.

## FR-14 — Final evidence and operational handoff

רשום בקיצור:

- accepted post-order-service SHA: `28e950afc1c4bfe4322d0593f483d05d92553e2d`;
- סטטוס FR-0..FR-13, כולל FR-8A..FR-8H ו־FR-11A/FR-11B;
- deterministic IBKR order-service acceptance status;
- real CPGW session compatibility status;
- real-order evidence: `PASS` רק אם בוצע בפועל עם permission וביוזמת המשתמש; אחרת בדיוק `PENDING_EXTERNAL_PERMISSION`;
- FR-12/FR-13 reports על אותו accepted SHA אם נעשה two-pass;
- sanitized local report paths;
- active market DB: `data/market-flow-us.duckdb`;
- separate order execution DB לפי `docs/IBKR_ORDER_SERVICE_OPERATOR.md`;
- daily stop/archive/new-day procedure;
- normal start/stop commands לשני התהליכים;
- Demo Buy/AI Investigation recovery path;
- Support Snapshot path;
- אין blocking defect;
- required CI/main green אחרי כל fix שנדרש.

רק לאחר שכל success evidence של TREE `7.4` ירוק וה־PR/merge/main-green/open-PR closure הושלם, מותר להכריז על completion כולל של המוצר.

## Troubleshooting routing

```text
FR-0..FR-2   repository/release state
FR-3         toolchain/install
FR-4         unit/service/order deterministic correctness
FR-5         build/Chromium E2E
FR-6         local UI/runtime
FR-7..FR-8  Local Fake / Demo Buy / AI
FR-9         target-machine persistence/read/full-load performance
FR-10        DB lifecycle/new-day
FR-11A       market-data deployment/provider startup
FR-11B       IBKR order-service / CPGW compatibility
FR-12        authenticated static market-data compatibility
FR-13        real market movement/reflection
FR-14        final evidence/operational closure
```

מסמכים משלימים:

- `docs/IBKR_ORDER_SERVICE_OPERATOR.md` — startup, token handling, CPGW ו־order acceptance;
- `docs/LOCAL_FAKE_ACCEPTANCE.md` — Local Fake/workload profiles;
- `docs/LIVE_VERIFICATION.md` — authenticated market-data static + movement gate;
- `docs/USER_GUIDE.md` — שימוש שוטף;
- `START_HERE.md` — כניסה קצרה להפעלה היומיומית.
