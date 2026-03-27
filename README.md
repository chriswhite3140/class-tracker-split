# ClassTracker

ClassTracker is a browser-based classroom assessment tracker for Australian Curriculum learning areas (P–6).

It helps teachers:

- keep a class list and student profiles
- record curriculum code progress and mastery
- log what was taught in each session
- track achievement standards judgments
- place students on literacy and numeracy progression levels
- review dashboards, class overviews, and coverage gaps

The app is a static front end (`index.html`, `styles.css`, `app.js`) that loads curriculum reference data from CSV files included in this repository and syncs student/progress data to a Google Apps Script endpoint configured in `app.js`.

## Run locally

### 1) Clone the repository

```bash
git clone https://github.com/chriswhite3140/class-tracker-split.git
cd class-tracker-split
```

### 2) Start a local static server

You can use Python (available on most systems):

```bash
python3 -m http.server 8000
```

### 3) Open the app in your browser

Visit:

```text
http://localhost:8000
```

## Notes for local development

- Opening `index.html` directly via `file://` may cause fetch/CORS issues in some browsers; using a local server is recommended.
- The repository includes curriculum CSV files used by the app UI.
- Live data operations (students, progress, taught log, judgments, placements) depend on the configured Google Apps Script API URL in `app.js`.
