# Market Flow US

Market Flow US הוא מוצר ניתוח שוק מקומי לשוק האמריקאי, המבוסס על מנגנוני MarketScope שהוכחו ונשמרו היכן שלא נדרש שינוי עבור חוזה הנתונים האמריקאי.

## זרימת המוצר

```text
authenticated Bank Leumi U.S. market page
→ full ScreenerHulPaging3 snapshot
→ exact snapshot validation
→ browser Recorder / Producer Bridge
→ loopback WebSocket
→ localhost Node.js service
→ native DuckDB schema v4
→ Current / Security Detail / History / Dynamic SQL Scanner
→ Demo Buy / AI Investigation
```

Market Recording + Replay הוא מסלול opt-in נפרד שמשתמש ב־recordings שנבנו מ־validated provider snapshots ומזרים אותם חזרה דרך מסלול ה־producer/service הרגיל בלי להפוך את השרת ל־Replay-aware.

IBKR order execution נשאר boundary מקומי נפרד. קיימת גם אינטגרציית BUY מצומצמת מ־current Detail דרך launcher ייעודי, immutable ticket ו־trusted local confirmation. ה־normal launch, Scanner, Demo Buy, AI Investigation ו־Replay אינם הופכים למנוע מסחר אוטומטי.

אין backend ענן ואין מסד production בבעלות הדפדפן. ה־DuckDB המקומי הוא מקור הסמכות של market analysis לאחר commit תקין.

## התחלה מהירה

למשתמש Windows המסלול הקצר הוא:

```text
SETUP.cmd
→ START_DEMO.cmd
```

להפעלה מול הספק האמיתי:

```text
START_MARKET_FLOW_US.cmd
```

למדריך קצר ראה `START_HERE.md`. למדריך שימוש מלא ראה `docs/USER_GUIDE.md`.

## מסד פעיל של יום מסחר אחד

מסד העבודה הרגיל הוא:

```text
data/market-flow-us.duckdb
```

הוא מייצג **יום מסחר פעיל אחד**. הוא אינו מיועד לצבור ללא גבול היסטוריה של ימים קודמים.

בסוף יום/לפני תחילת יום חדש:

1. עצור את ה־producer והשירות (`Ctrl+C`).
2. ודא שאין תהליך Market Flow US שעדיין משתמש במסד.
3. הפעל:

```text
NEW_TRADING_DAY.cmd
```

או:

```text
npm run db:new-day
```

ברירת המחדל מקבלת active DB תקין ב־schema v3 או v4, מעבירה את מסד היום הקודם ל־`data/archive/`, יוצרת active DB חדש ב־schema v4 ומשמרת את `scanner_saved_queries`. Market/Demo Buy evidence אינו מועתק ליום החדש. הפעולה מסרבת להתקדם אם קיימת session שמסומנת `running`, ובכשל בזמן החלפת הקבצים היא מנסה להחזיר את המסד הקודם למקומו.

אין למחוק ידנית את `data/market-flow-us.duckdb` כחלק מ־rollover רגיל.

## שכבות acceptance

### 1. Deterministic local proof

```text
RUN_TESTS.cmd
RUN_LOCAL_ACCEPTANCE.cmd
RUN_IBKR_ORDER_ACCEPTANCE.cmd
```

הבדיקות מוכיחות את ה־runtime/service/DuckDB הרגילים, Demo Buy + AI Investigation, Replay/order paths הרלוונטיים ו־sanitized failure/recovery behavior ללא תלות ב־provider permission אמיתי. לפרטי המסלול הסדרתי המלא ראה `docs/FIRST_RUN_ACCEPTANCE.md`.

### 2. Authenticated closed/static provider compatibility

```text
PREPARE_LIVE_VERIFICATION.cmd
```

ה־gate משתמש בעמוד ספק שכבר authenticated בדפדפן ומוכיח sustained acquisition/commit/read/Scanner/ownership/clean-stop. תגובות שוק זהות ברצף הן חוקיות בשוק סגור או סטטי ואינן כשלעצמן כשל.

Base compatibility PASS מסומן על ידי:

```text
overall = "PASS"
```

לפרטים: `docs/LIVE_VERIFICATION.md`.

### 3. Market-open movement acceptance

אותו SHA-bound live gate מפיק גם classification נפרד לתנועת שוק אמיתית מתוך ה־cycles שהוא עצמו commit-תה. הוא מחפש שינוי רק בשדות provider שמורים, לא בזמן האיסוף המקומי, ומוכיח את ה־witness דרך Current ו־History.

השלמת FR-13 דורשת:

```text
overall = "PASS"
movement.status = "PASS"
```

אם ה־base boundary עובר אבל לא נצפה שינוי אמיתי:

```text
movement.status = "PENDING"
```

ואין להמיר זאת ידנית ל־market-open PASS.

## גבול release

ה־release מתקדם דרך deterministic repository proof, target-machine Local Fake/Demo Buy/AI/Replay/order compatibility, daily DB lifecycle, authenticated static compatibility ולבסוף market-open movement evidence על **אותו exact runtime candidate**.

מקורות האמת תחת ST Planner 2.0 הם:

```text
.planning/PLAN.md      = planning / S&T truth
.planning/EXECUTION.md = task / owner / status / dependency / result-evidence truth
.planning/DECISIONS.md = durable supporting decisions
STATUS.yaml            = non-authoritative navigation projection only
```

ה־exact final-acceptance runtime candidate וה־checkpoint ledger נמצאים ב־`.planning/FINAL_ACCEPTANCE_RUNBOOK.md` וב־`.planning/FINAL_ACCEPTANCE_EXECUTION.md`. Planning/docs commits מאוחרים יותר אינם מחליפים candidate אוטומטית.

## החלטות מוצר מרכזיות

- לשמר את ארכיטקטורת MarketScope המוכחת במקום rewrite.
- להשתמש ב־ScreenerHulPaging3 כגבול acquisition האמריקאי.
- לשמור append-only history בתוך יום המסחר הפעיל + `latest` סמכותי.
- לשמור את Scanner כמשטח strategy/analysis, כולל saved queries.
- ה־staged candidate הוא SQL רגיל וניתן לעריכה, לא Strategy Engine חדש.
- Demo Buy הוא validation evidence, לא simulated execution.
- AI Investigation הוא export מקומי sharing-safe ו־anti-hindsight, בלי cloud/API dependency אוטומטי.
- Replay נשאר opt-in ומחוץ ל־normal live authority.
- IBKR execution נשאר sidecar נפרד עם DRY_RUN כברירת מחדל ו־LIVE gates בלתי תלויים; Basic BUY הוא explicit Detail-only integration ולא strategy execution engine.
- performance authority כבד שייך למחשב היעד, לא ל־GitHub-hosted CI.

## מסמכי אמת עיקריים

- `AGENTS.md`
- `.planning/PLAN.md`
- `.planning/EXECUTION.md`
- `.planning/DECISIONS.md`
- `STATUS.yaml` — projection בלבד
- `.planning/FINAL_ACCEPTANCE_RUNBOOK.md`
- `.planning/FINAL_ACCEPTANCE_EXECUTION.md`
- `docs/PRODUCT_REQUIREMENTS.md`
- `docs/PRODUCT_SPEC.md`
- `docs/DATA_CONTRACT.md`
- `docs/TECHNICAL_SPEC.md`
- `docs/SCANNER_SQL_GUIDE.md`
- `docs/TEST_STRATEGY.md`
- `docs/MARKET_REPLAY.md`
- `docs/IBKR_ORDER_SERVICE.md`
- `docs/BASIC_BUY_INTEGRATION.md`
- `docs/LOCAL_FAKE_ACCEPTANCE.md`
- `docs/LIVE_VERIFICATION.md`

GitHub `main` הוא מקור האמת בין צ׳אטים. תהליך development/release מוגדר ב־`AGENTS.md`.