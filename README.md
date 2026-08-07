# Mess Manager MVP

Responsive admin-controlled mess management PWA.

## Run locally
Use any static web server in this folder, for example:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080

## Demo login
- Admin PIN: 1234
- Member PIN: 1111

## Included modules
- Admin dashboard
- Member add/edit/activate/deactivate
- Daily meal ON/OFF
- Bazar add/edit/delete
- Member deposits
- Utility bills with selected-member sharing
- Bazar schedule
- Monthly settlement / due / advance
- Reports
- Settings and reset
- PWA manifest + service worker
- Browser localStorage persistence

## Production upgrade path
This MVP stores data in the browser. For real multi-user deployment, connect the same UI to a hosted backend such as Supabase/PostgreSQL, add secure authentication, row-level permissions, backups, and audit logs.
