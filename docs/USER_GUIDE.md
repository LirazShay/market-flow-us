# Market Flow US — מדריך משתמש

המדריך הזה מיועד להפעלה ושימוש במוצר. הוא אינו מסמך ארכיטקטורה או מסמך פיתוח.

למסלול הקצר ביותר ראה קודם את `START_HERE.md`.

## 1. דרישות

- Windows להפעלה באמצעות קבצי ה־`.cmd` המצורפים.
- Node.js 24.x.
- npm.
- להרצה מול הספק האמיתי: עמוד ספק מתאים שכבר מחובר בדפדפן.

בהתקנה הראשונה הפעל `SETUP.cmd`. אין צורך להריץ `npm ci` ידנית לאחר מכן אלא אם התלויות השתנו או שאתה עובד על checkout חדש.

## 2. Demo מקומי

הפעל `START_DEMO.cmd`.

ה־Demo משתמש בדיוק ברכיבי ה־Browser/Service/Database הרגילים של Market Flow US, אבל במקום אתר אמיתי הוא משתמש ב־Fake Market מקומי ודטרמיניסטי.

הזרימה היא:

```text
Fake Market
→ Market Flow US browser runtime
→ loopback WebSocket
→ local Node.js service
→ DuckDB schema v4
→ Current / Detail / Scanner / Demo Buy / AI Investigation
```

הדפדפן אמור להיפתח אוטומטית. אם לא, פתח ידנית:

```text
http://127.0.0.1:4173/
```

השאר את חלון `START_DEMO.cmd` פתוח. `Ctrl+C` עוצר את הדמו.

### איפוס Demo

עצור את הדמו והפעל `RESET_DEMO.cmd`.

האיפוס מוגבל ל־`.demo/`; הוא אינו אמור לגעת בנתוני השימוש הרגילים.

## 3. הפעלה מול הספק האמיתי

### שלב א — עמוד הספק

התחבר לספק בדפדפן והשאר את העמוד המתאים פתוח.

Market Flow US משתמש בסשן הקיים בתוך אותו דפדפן. אין להעביר cookie, token, Authorization header, מזהה חשבון או dump של הדפדפן לשורת פקודה או לריפו.

### שלב ב — הפעלת השירות

הפעל:

```text
START_MARKET_FLOW_US.cmd
```

כאשר תתבקש, הדבק את כתובת העמוד מה־Address Bar. אפשר להדביק כתובת מלאה, לדוגמה עם path; ה־helper מפיק ממנה רק את ה־Origin המדויק הדרוש לשירות המקומי.

לאחר מכן ה־helper:

1. מריץ `npm run build:browser`.
2. יוצר את `dist/browser/market-flow-us.bookmarklet.txt`.
3. מעתיק את ה־bookmarklet ל־Clipboard.
4. פותח את הקובץ גם ב־Notepad.
5. מרים את שירות Market Flow US על loopback בלבד.

### שלב ג — הפעלת ה־bookmarklet

צור/עדכן Bookmark בדפדפן כך ששדה ה־URL שלו מכיל את כל השורה מ־`market-flow-us.bookmarklet.txt`.

בעמוד הספק המחובר לחץ על ה־Bookmark.

Market Flow US יפתח Viewer נפרד. אם הדפדפן חוסם Popup, אפשר Popup עבור ההפעלה הזו ונסה שוב.

השאר את חלון השירות פתוח. בסיום העבודה לחץ `Ctrl+C` בחלון השירות.

## 4. Current

הכפתור **Current** מציג את תמונת המצב העדכנית שקיימת במסד המקומי.

שורות ניירות הערך ניתנות לפתיחה לפרטי הנייר. התצוגה מתרעננת דרך השירות המקומי, ולא קוראת ישירות ממסד הנתונים מתוך הדפדפן.

## 5. Detail / History

פתיחת נייר מתוך Current או מתוך תוצאת Scanner מוכרת מציגה את אותו מסך Detail.

המסך כולל את המצב הנבחר ואת ההיסטוריה שלו. בחזרה ל־Current נשמרת ככל האפשר נקודת החזרה של התצוגה.

כאשר קיימת היסטוריה נוספת ניתן לטעון המשך דרך מנגנון ה־History של המוצר.

## 6. Scanner

לחץ **Scanner**.

במסך קיימים:

- SQL.
- מרווח הרצה בשניות.
- כפתור **הפעל**.
- ספריית שאילתות.
- פעולות חדש / שמור בשם חדש / שמור / שנה שם / מחק.
- בקרי Demo Buy עבור התוצאה המוצגת.

שאילתה פעילה רצה במחזוריות לפי המרווח שהוגדר. שינוי טיוטה או בחירה בספרייה אינו משנה אוטומטית generation שכבר פעיל; הפעלה היא פעולה מפורשת.

אם תוצאת SQL מחזירה עמודת זהות מוכרת בשם `securityId` או `security_id`, שורת התוצאה יכולה לפתוח את אותו Detail/History של Current וגם להשתתף ב־Demo Buy.

לכתיבת SQL ראה `docs/SCANNER_SQL_GUIDE.md`.

## 7. Demo Buy

Demo Buy אינו שולח פקודת מסחר. הוא שומר תצפית מקומית על מועמדי Scanner כדי לבדוק מה קרה להם לאחר נקודת הבחירה.

מתוך generation מוצג של Scanner אפשר לבצע:

- **Selected** — רק השורות שסומנו;
- **All** — כל השורות התקינות של אותה תוצאה;
- **Top X** — X השורות הראשונות של אותה תוצאה;
- **Auto** — יצירת Demo Buy רק מ־generations עתידיים לפי All או Top X.

המיקום שנשמר הוא `Scanner returned position` המקורי. מיקום `1` אינו אומר אוטומטית “הכי טוב”; משמעות דירוג חזקה קיימת רק אם ה־SQL עצמו מגדיר `ORDER BY` דטרמיניסטי מתאים.

הכפתור **Demo Buy** פותח מסך תוצאות מקובצות לפי capture. לכל פריט מוצגים baseline וה־horizons הקבועים:

```text
10s, 20s, 30s, 45s, 60s, 90s, 120s, 3m, 5m, 10m
```

תוצאות יכולות להתקדם בהדרגה מ־Pending ל־UP / DOWN / FLAT או למצב unavailable מוסבר. **Refresh latest** טוען מחדש את ראש הרשימה; **Load more** ממשיך paging; וב־Observation details אפשר לבצע **Refresh observation** לפריט ישן בלי לאפס את הרשימה.

`Auto Demo Buy` ממשיך לפעול גם אם עוברים למסך אחר כל עוד Scanner החוזר פעיל. **Turn off** מכבה captures אוטומטיים עתידיים. עצירת הסריקה החוזרת עוצרת generations עתידיים אך אינה מוחקת את הגדרת Auto.

## 8. Investigate with AI

במסך Demo Buy ניתן לפתוח **Investigate with AI** עבור observation.

לפני יצירת pack המוצר מרענן את observation הספציפי מול authority המקומי. לאחר מכן **Generate AI Investigation Pack** יוצר תיקייה מקומית, דטרמיניסטית ו־collision-safe תחת:

```text
exports/ai-investigations/
```

ה־pack מכיל בדיוק את ה־SQL המקורי, baseline, prediction-time evidence, post-capture evidence, outcome, Scanner context sharing-safe, manifest, field guide, README ו־prompt. הוא אינו מתקשר אוטומטית לשירות AI חיצוני ואינו מפעיל SQL חדש.

המצב יכול להיות:

```text
PARTIAL_OUTCOME
COMPLETE_OUTCOME
```

כאשר מצטבר evidence נוסף אפשר להשתמש ב־**Regenerate**; pack קיים אינו נדרס אלא נוצרת תיקייה חדשה. **Copy AI Prompt** ו־**Copy folder path** מעתיקים ל־Clipboard, ובדפדפן שחוסם Clipboard מופיע fallback ידני לבחירה/העתקה.

חשוב: `QUERY.sql` הוא SQL שכתב המשתמש ונשמר verbatim. ה־export מסנן operational/session metadata ומצמצם Scanner text שאינו שדה שוק בטוח, אבל לפני העלאה חיצונית יש לעבור על כל הקבצים שנוצרו.

## 9. איפה הנתונים נשמרים?

בשימוש הרגיל ברירת המחדל היא:

```text
data/market-flow-us.duckdb
```

זהו **active DB של יום מסחר אחד**. הטבלאות `sessions`, `universe`, `cycles`, `history` ו־`latest` מיועדות לסמכות של יום העבודה הפעיל, לא לצבירה אוטומטית של חודשים או שנים. schema v4 מוסיף את `demo_buy_captures` ו־`demo_buy_items`; outcomes של horizons אינם נשמרים כטבלת authority אלא מחושבים מה־History בעת קריאה.

ב־Demo:

```text
.demo/market-flow-us.duckdb
```

בבדיקת Live הייעודית:

```text
data/live-verification.duckdb
```

קבצי `data/`, `.demo/`, `dist/`, `exports/` ומסדי DuckDB מוחרגים מ־Git.

### מעבר ליום מסחר חדש

לפני תחילת יום חדש:

1. עצור את ה־producer והשירות בצורה נקייה עם `Ctrl+C`.
2. ודא שאין תהליך Market Flow US שעדיין מחזיק את המסד.
3. הפעל:

```text
NEW_TRADING_DAY.cmd
```

או:

```text
npm run db:new-day
```

ברירת המחדל:

```text
stop service
→ validate source DB is a valid stopped Market Flow US v3 or v4 DB
→ preserve scanner_saved_queries
→ move prior DB to data/archive/
→ create fresh schema-v4 data/market-flow-us.duckdb
→ restore saved queries into the fresh DB
→ start with empty Demo Buy tables
```

ה־archive הוא retention אופציונלי של היום הקודם; הוא אינו מסד analytics פתוח שהמוצר ממשיך לצבור אליו.

הפעולה מסרבת להתקדם כאשר קיימת session שמסומנת `running`. אם החלפת הקבצים נכשלת לאחר שהמסד הישן כבר הוזז, המנגנון מנסה להחזיר את המסד הקודם למקומו במקום להשאיר את המשתמש בלי active DB.

אין למחוק ידנית את `data/market-flow-us.duckdb` כחלק מה־rollover הרגיל, משום שמחיקה ידנית גם עוקפת את שימור ספריית השאילתות.

## 10. בדיקות ו־Local Fake Leumi acceptance

לבדיקה הרגילה ב־Windows:

```text
RUN_TESTS.cmd
```

היא כוללת Fast + browser build + Chromium E2E.

בדיקת workload מוגבלת ל־CI:

```text
npm run test:workload
```

ל־Local Fake Leumi acceptance המלא והתחום:

```text
RUN_LOCAL_ACCEPTANCE.cmd
```

הבדיקה אינה דורשת authentication ומוכיחה דרך ה־runtime/service/DuckDB הרגילים:

- repeated identical/static responses;
- moving values;
- add/remove membership;
- provider failure/recovery;
- service restart;
- Demo Buy capture דרך ה־runtime הרגיל;
- progressive outcomes + targeted observation refresh;
- ordered/unordered Scanner returned-position semantics ב־AI Investigation;
- PARTIAL → COMPLETE generation/regeneration;
- sharing-safe AI pack ללא operational/session canary leakage.

כדי להריץ רק את ארבעת ה־post-feature checks:

```text
RUN_LOCAL_ACCEPTANCE.cmd feature
```

לפרופילי target-machine:

```text
RUN_LOCAL_ACCEPTANCE.cmd isolated
RUN_LOCAL_ACCEPTANCE.cmd target
```

`isolated` מפעיל פרופילי persistence/read/Scanner/Demo Buy/AI יום־מסחר תחומים. `target` הוא פרופיל end-to-end של `4096 × 180`. מדידות target-machine אינן מוחלפות על ידי timing של GitHub-hosted CI.

לפרטים ראה `docs/LOCAL_FAKE_ACCEPTANCE.md`.

## 11. Authenticated provider verification

הפעל `PREPARE_LIVE_VERIFICATION.cmd` או פעל ישירות לפי `docs/LIVE_VERIFICATION.md`.

ה־build מייצר:

```text
dist/live-verification/market-flow-us-live-verification.js
dist/live-verification/market-flow-us-live-verification.bookmarklet.txt
```

הבדיקה משתמשת ב־bookmarklet נפרד מה־runtime הרגיל ובמסד ייעודי. היא בודקת proof תחום של:

```text
producer session
→ repeated complete ScreenerHulPaging3 responses
→ universe
→ complete cycle + COMMIT
→ sustained run
→ Current
→ Security
→ History
→ Scanner
→ producer ownership
→ clean stop
```

ה־gate דורש לפחות `20` complete committed cycles ולפחות `60` שניות.

### Closed/static authenticated market

שוק סגור או סטטי רשאי להחזיר ערכים זהים ברצף. ערכים זהים אינם כשל אם התגובה המלאה תקינה, נרשמת ומגיעה ל־Current/History כנדרש.

Base compatibility PASS מזוהה על ידי:

```text
overall = "PASS"
```

כאשר לא נצפה שינוי provider אמיתי, אותו report יכול להציג:

```text
movement.status = "PENDING"
```

וזה עדיין base/static PASS תקין.

### Market-open movement

אותו live gate מפיק בעצמו evidence נפרד לשינוי provider אמיתי מתוך טווח ה־cycles שהריצה עצמה commit-תה. הוא אינו משתמש ב־`collectedAtMs` כדי להמציא movement; הוא מחפש שינוי בשדות `Price`, `ChangePercent`, `BidRate`, `AskRate`, `DailyVolume` או `TradeDateTime` ומוכיח את ה־witness דרך Current ו־History המחויבים.

ל־market-open FR-13 נדרש:

```text
overall = "PASS"
movement.status = "PASS"
movement.observed = true
movement.currentReflected = true
movement.historyReflected = true
```

אם אין שינוי אמיתי, movement נשאר `PENDING`; אם שינוי נצפה אך reflection לא הוכח, movement הוא `FAIL`. אין להמציא PASS ואין להחליש את התנאי.

רק ה־gate רשאי להחזיר את classifications לגבי הגבולות שהוא באמת בודק.

## 12. אם משהו לא עובד

בדוק לפי הסדר:

1. האם `SETUP.cmd` הושלם בהצלחה.
2. האם אין תהליך Market Flow US ישן שתופס את port `8765` או Fake Market ישן שתופס `4173`.
3. בהרצה אמיתית — האם חלון השירות עדיין פתוח.
4. האם ה־URL שהודבק ל־`START_MARKET_FLOW_US.cmd` הוא של עמוד הספק האמיתי וב־`http/https`.
5. האם Popup של ה־Viewer נחסם.
6. לפני `NEW_TRADING_DAY.cmd` — האם השירות וה־producer נעצרו באמת.

בתוך Viewer קיים כפתור:

```text
העתק אבחון / Copy Support Snapshot
```

כאשר אפשר, השתמש בו והעבר את ה־JSON המועתק לצורך troubleshooting. ה־snapshot נועד להיות מצומצם ובטוח ואינו אמור לכלול credentials, cookies, auth/session data, account identifiers או raw provider dumps.

אם השירות בכלל לא עולה, חלון ה־CLI מציג component/checkpoint/error code שמיועדים לאיתור הגבול שנכשל.

## 13. מה לא למחוק

- אל תמחק ידנית את `data/market-flow-us.duckdb` כדי להתחיל יום חדש; השתמש ב־`NEW_TRADING_DAY.cmd` כדי לשמר saved queries ולבצע rollover בטוח.
- אל תמחק archive של יום קודם אם אתה עדיין רוצה לשמור אותו לצורכי retention ידני.
- איפוס Demo צריך להתבצע דרך `RESET_DEMO.cmd`; הוא בנוי למחוק רק את מצב ה־Demo.
- אל תעתיק לריפו credentials, cookies, session data, account identifiers או raw authenticated provider dumps.
