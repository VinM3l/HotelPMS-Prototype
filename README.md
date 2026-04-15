# 🏨 Hotel PMS — Setup Guide

## Default Login Credentials

| Username | Password   | Role          | Access                                      |
|----------|-----------|---------------|---------------------------------------------|
| admin    | admin123  | Administrator | Everything — rooms, prices, analytics, Excel |
| staff    | staff123  | Front Desk    | Dashboard + Bookings only                   |

**Change passwords after first login:** Log in as admin, then use the
Change Password option (open it via the browser console or add a button —
see `auth.js` → `ACCOUNTS` to edit passwords directly in the file).

---

## How to Launch

### Windows (Recommended)
Double-click **`HotelPMS.bat`**

- If Python is installed, it starts a local server and opens your browser automatically.
- If Python is not installed, it opens the HTML file directly (most features still work).

### macOS / Linux
1. Open Terminal
2. Run: `bash HotelPMS.sh`  
   Or make it executable first: `chmod +x HotelPMS.sh` then double-click it.

### Any computer with Python
Run in Terminal / Command Prompt:
```
python launch_server.py
```
Then open `http://localhost:8765` in your browser.

---

## Files

| File                | Purpose                                      |
|---------------------|----------------------------------------------|
| `index.html`        | Main app HTML                                |
| `style.css`         | All styling                                  |
| `app.js`            | Main app logic                               |
| `auth.js`           | Login, roles, and access control             |
| `import-export.js`  | Excel import / export                        |
| `launch_server.py`  | Python local web server                      |
| `HotelPMS.bat`      | Windows double-click launcher                |
| `HotelPMS.sh`       | macOS/Linux launcher                         |

---

## Changing Passwords

Open `auth.js` in any text editor and find the `ACCOUNTS` object near the top:

```js
const ACCOUNTS = {
  admin: { password: 'admin123', role: 'admin', label: 'Administrator' },
  staff: { password: 'staff123', role: 'user',  label: 'Front Desk'    },
};
```

Change the `password` values to whatever you want and save the file.

---

## Notes

- All data is saved in your browser's **localStorage** — it persists between sessions
  on the same computer and browser.
- The Excel import/export feature requires an internet connection to load the
  SheetJS library from CDN on first use.
- This is an internal local tool — passwords in `auth.js` are visible to anyone
  with access to the files. For internet-facing deployment, a proper backend is needed.
