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
→ DuckDB
→ Current / Detail / Scanner
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

שאילתה פעילה רצה במחזוריות לפי המרווח שהוגדר. שינוי טיוטה או בחירה בספרייה אינו משנה אוטומטית generation שכבר פעיל; הפעלה היא פעולה מפורשת.

אם תוצאת SQL מחזירה עמודת זהות מוכרת בשם `securityId` או `security_id`, שורת התוצאה יכולה לפתוח את אותו Detail/History של Current.

לכתיבת SQL ראה `docs/SCANNER_SQL_GUIDE.md`.

## 7. איפה הנתונים נשמרים?

בשימוש הרגיל ברירת המחדל היא:

```text
data/market-flow-us.duckdb
```

ב־Demo:

```text
.demo/market-flow-us.duckdb
```

בבדיקת Live הייעודית:

```text
data/live-verification.duckdb
```

קבצי `data/`, `.demo/`, `dist/` ומסדי DuckDB מוחרגים מ־Git.

## 8. בדיקות

לבדיקה הרגילה ב־Windows:

```text
RUN_TESTS.cmd
```

היא כוללת Fast + browser build + Chromium E2E.

בדיקת עומס מייצגת היא נפרדת:

```text
npm run test:workload
```

## 9. בדיקת Live מול הספק

הפעל `PREPARE_LIVE_VERIFICATION.cmd` או פעל ישירות לפי `docs/LIVE_VERIFICATION.md`.

ה־build מייצר:

```text
dist/live-verification/market-flow-us-live-verification.js
dist/live-verification/market-flow-us-live-verification.bookmarklet.txt
```

הבדיקה משתמשת ב־bookmarklet נפרד מה־runtime הרגיל ובמסד ייעודי. היא בודקת proof תחום של:

```text
producer session
→ universe
→ complete cycle + COMMIT
→ Current
→ Security
→ History
→ Scanner
→ producer ownership
→ clean stop
```

רק ה־gate רשאי להחזיר `overall: "PASS"`. אם תנאי חיצוני מונע הרצה, הסטטוס נשאר pending; אין להמציא PASS.

## 10. אם משהו לא עובד

בדוק לפי הסדר:

1. האם `SETUP.cmd` הושלם בהצלחה.
2. האם אין תהליך Market Flow US ישן שתופס את port `8765` או Fake Market ישן שתופס `4173`.
3. בהרצה אמיתית — האם חלון השירות עדיין פתוח.
4. האם ה־URL שהודבק ל־`START_MARKET_FLOW_US.cmd` הוא של עמוד הספק האמיתי וב־`http/https`.
5. האם Popup של ה־Viewer נחסם.

בתוך Viewer קיים כפתור:

```text
העתק אבחון / Copy Support Snapshot
```

כאשר אפשר, השתמש בו והעבר את ה־JSON המועתק לצורך troubleshooting. ה־snapshot נועד להיות מצומצם ובטוח ואינו אמור לכלול credentials, cookies, auth/session data, account identifiers או raw provider dumps.

אם השירות בכלל לא עולה, חלון ה־CLI מציג component/checkpoint/error code שמיועדים לאיתור הגבול שנכשל.

## 11. מה לא למחוק

אל תמחק ידנית את `data/market-flow-us.duckdb` אם אתה רוצה לשמור את היסטוריית העבודה שלך.

איפוס Demo צריך להתבצע דרך `RESET_DEMO.cmd`; הוא בנוי למחוק רק את מצב ה־Demo.
