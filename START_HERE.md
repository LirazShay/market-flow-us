# Market Flow US — מתחילים כאן

המטרה של הקובץ הזה היא לאפשר להפעיל את Market Flow US בלי לזכור פקודות `npm`.

> Windows: ברוב המקרים פשוט מפעילים קובץ `.cmd` בלחיצה כפולה מתוך תיקיית הפרויקט.

## פעם ראשונה בלבד

הפעל:

```text
SETUP.cmd
```

הוא בודק שקיים Node.js 24.x, מתקין את התלויות המדויקות עם `npm ci`, ומתקין את Chromium הנדרש לבדיקות הדפדפן.

אם הוא נעצר בגלל גרסת Node, התקן Node.js 24.x והפעל אותו שוב.

## רוצה רק לראות שהמוצר עובד?

הפעל:

```text
START_DEMO.cmd
```

הוא מרים את Fake Market, את שירות Market Flow US ואת DuckDB המקומי, ומנסה לפתוח אוטומטית את הדפדפן ב־`http://127.0.0.1:4173/`.

השאר את חלון הפקודה פתוח. לעצירה: `Ctrl+C`.

נתוני הדמו נשמרים רק תחת `.demo/market-flow-us.duckdb`.

## רוצה למחוק את נתוני הדמו?

קודם עצור את הדמו, ואז הפעל:

```text
RESET_DEMO.cmd
```

הפעולה מוחקת רק את מצב ה־Demo. היא אינה מוחקת את מסד הנתונים הרגיל של Market Flow US.

## מתחיל יום מסחר חדש?

מסד העבודה הרגיל `data/market-flow-us.duckdb` הוא active DB של **יום מסחר אחד**.

לפני rollover:

1. עצור את ה־producer והשירות עם `Ctrl+C`.
2. ודא שאין חלון Market Flow US ישן שממשיך להשתמש במסד.
3. הפעל:

```text
NEW_TRADING_DAY.cmd
```

הפעולה:

```text
prior active DB
→ archive under data/archive/
→ fresh schema-v3 active DB
→ saved Scanner queries preserved
```

אם קיימת session שמסומנת `running`, הפעולה נכשלת במקום להחליף מסד תוך כדי עבודה. אין למחוק ידנית את המסד כדרך רגילה להתחיל יום חדש.

## רוצה להפעיל Market Flow US מול האתר האמיתי?

1. היכנס לאתר הספק בדפדפן והשאר את העמוד המחובר פתוח.
2. הפעל:
   ```text
   START_MARKET_FLOW_US.cmd
   ```
3. כאשר הקובץ מבקש URL, העתק את כתובת העמוד מה־Address Bar והדבק אותה. אפשר להדביק URL מלא; הקובץ מצמצם אותו אוטומטית ל־Origin המדויק.
4. הקובץ בונה את ה־bookmarklet העדכני `dist/browser/market-flow-us.bookmarklet.txt`, מעתיק אותו ל־Clipboard וגם פותח אותו ב־Notepad.
5. הפעל את ה־bookmarklet כ־Bookmark בדפדפן מתוך העמוד המחובר.
6. השאר את חלון השירות פתוח בזמן העבודה. לעצירה: `Ctrl+C`.

נתוני העבודה נשמרים כברירת מחדל ב־`data/market-flow-us.duckdb` של יום המסחר הפעיל.

## רוצה להריץ את הבדיקות הרגילות?

הפעל:

```text
RUN_TESTS.cmd
```

הוא מריץ:

```text
Fast unit + real-service tests
→ browser build
→ Chromium end-to-end tests
```

בדיקת ה־CI workload המוגבלת נשארת פעולה נפרדת:

```text
npm run test:workload
```

## רוצה להריץ Local Fake Leumi acceptance?

הפעל:

```text
RUN_LOCAL_ACCEPTANCE.cmd
```

זו בדיקה דטרמיניסטית ללא authentication. היא מוכיחה static responses, moving values, membership changes, provider failure/recovery ו־restart דרך ה־runtime/service/DuckDB הרגילים.

לפרופילי מחשב היעד:

```text
RUN_LOCAL_ACCEPTANCE.cmd isolated
RUN_LOCAL_ACCEPTANCE.cmd target
```

ה־`target` הוא פרופיל `4096 × 180`; הוא מיועד לקבלת ביצועים על מחשב היעד, לא ל־GitHub-hosted CI.

פרטים: `docs/LOCAL_FAKE_ACCEPTANCE.md`.

## רוצה לבצע authenticated provider verification?

הפעל:

```text
PREPARE_LIVE_VERIFICATION.cmd
```

הקובץ מכין SHA-bound gate, משתמש במסד ייעודי `data/live-verification.duckdb`, מייצר את `dist/live-verification/market-flow-us-live-verification.bookmarklet.txt`, מעתיק אותו ומרים את השירות המקומי. את ה־bookmarklet עצמו מפעילים ידנית בעמוד הספק המחובר.

ה־gate מוכיח sustained acquisition/commit/read/Scanner/ownership/clean-stop. בשוק סגור/סטטי ערכים זהים ברצף הם מצב חוקי ואינם כשלעצמם כשל.

**חשוב:** PASS של ה־gate אינו כשלעצמו הוכחת market-open movement. ההשלמה הסופית דורשת גם run בשוק פעיל שבו נצפה שינוי אמיתי ב־provider market/freshness והוא משתקף ב־Current/History. אם לא נצפה שינוי, תוצאת movement נשארת pending/inconclusive.

החוזה המדויק נמצא ב־`docs/LIVE_VERIFICATION.md`. אין לסמן PASS ידנית.

## מה רואים בתוך Market Flow US?

החלון הראשי כולל שלושה אזורים עיקריים:

- **Current** — המצב העדכני של ניירות הערך.
- **Detail / History** — לחיצה על נייר פותחת את הפרטים וההיסטוריה שלו.
- **Scanner** — הרצת SQL מחזורי, כולל ספריית שאילתות שמורות.

יש גם **Copy Support Snapshot**. אם משהו נכשל, זו בדרך כלל הדרך הטובה ביותר להעתיק אבחון בטוח לצורך תיקון.

למדריך שימוש מפורט יותר: `docs/USER_GUIDE.md`.
