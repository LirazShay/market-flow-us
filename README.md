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
→ native DuckDB schema v3
→ Current / Security Detail / History / Dynamic SQL Scanner
```

אין backend ענן ואין מסד production בבעלות הדפדפן. ה־DuckDB המקומי הוא מקור הסמכות של המוצר לאחר commit תקין.

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

ברירת המחדל מעבירה את מסד היום הקודם ל־`data/archive/`, יוצרת active DB חדש ב־schema v3 ומשמרת את `scanner_saved_queries`. הפעולה מסרבת להתקדם אם קיימת session שמסומנת `running`, ובכשל בזמן החלפת הקבצים היא מנסה להחזיר את המסד הקודם למקומו.

אין למחוק ידנית את `data/market-flow-us.duckdb` כחלק מ־rollover רגיל.

## שכבות acceptance

### 1. Local Fake Leumi — ללא authentication

```text
RUN_LOCAL_ACCEPTANCE.cmd
```

מוכיח דטרמיניסטית static responses, moving values, membership change, provider failure/recovery ו־restart דרך ה־runtime/service/DuckDB הרגילים. לפרטים: `docs/LOCAL_FAKE_ACCEPTANCE.md`.

### 2. Authenticated closed/static provider compatibility

```text
PREPARE_LIVE_VERIFICATION.cmd
```

ה־gate משתמש בעמוד ספק שכבר authenticated בדפדפן ומוכיח sustained acquisition/commit/read/Scanner/ownership/clean-stop. תגובות שוק זהות ברצף הן חוקיות בשוק סגור או סטטי ואינן כשלעצמן כשל.

לפרטים: `docs/LIVE_VERIFICATION.md`.

### 3. Market-open movement acceptance

השלמת המוצר דורשת בנוסף הוכחה בשוק פעיל שלפחות שינוי אמיתי אחד ב־provider market/freshness מגיע ל־Current/History. ה־live gate הקיים לבדו אינו טוען שהוא מוכיח movement; ה־movement-specific result נשאר חלק מה־final target-machine acceptance (`TREE 7.4`).

אין להמיר static PASS ל־market-open PASS כאשר לא נצפה שינוי אמיתי.

## גבול release

ה־release מתקדם דרך deterministic offline proof, Local Fake Leumi acceptance, cleanup תפעולי ולבסוף target-machine acceptance. השלמה כוללת דורשת את חבילת `TREE 7.4`: daily-bounded target-machine performance, new-day lifecycle proof, authenticated static compatibility ו־market-open movement proof.

`STATUS.yaml` ו־`.planning/EXECUTION.yaml` הם מקור האמת היחיד ל־execution pointer ולמצב העדכני.

## החלטות מוצר מרכזיות

- לשמר את ארכיטקטורת MarketScope המוכחת במקום rewrite.
- להשתמש ב־ScreenerHulPaging3 כגבול acquisition האמריקאי.
- לשמור append-only history בתוך יום המסחר הפעיל + `latest` סמכותי.
- לשמור את Scanner כמשטח strategy/analysis, כולל saved queries.
- ה־staged candidate הוא SQL רגיל וניתן לעריכה, לא Strategy Engine חדש.
- Automated order execution / IBKR מחוץ להיקף migration זה.
- performance authority כבד שייך למחשב היעד, לא ל־GitHub-hosted CI.

## מסמכי אמת עיקריים

- `AGENTS.md`
- `STATUS.yaml`
- `.planning/STATUS.yaml`
- `.planning/EXECUTION.yaml`
- `.planning/TREE.yaml`
- `docs/PRODUCT_REQUIREMENTS.md`
- `docs/PRODUCT_SPEC.md`
- `docs/DATA_CONTRACT.md`
- `docs/TECHNICAL_SPEC.md`
- `docs/SCANNER_SQL_GUIDE.md`
- `docs/TEST_STRATEGY.md`
- `docs/LOCAL_FAKE_ACCEPTANCE.md`
- `docs/LIVE_VERIFICATION.md`

GitHub `main` הוא מקור האמת בין צ׳אטים. תהליך development/release מוגדר ב־`AGENTS.md`.
