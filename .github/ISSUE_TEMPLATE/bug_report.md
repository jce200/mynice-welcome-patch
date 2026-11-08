---
name: Something doesn't work
about: The patched app misbehaves (connecting, status, pairing, look)
title: ""
labels: ""
---

**What happened, and what did you expect?**

**Your setup**
- Phone and Android version:
- Android System WebView version (Settings > Apps > Android System WebView):
- Accessory (IT4WIFI / CORE, firmware if you know it):
- VPN or mobile data on at the time? Which VPN?

**The diagnosis, with secrets removed**
Open the app, tap the status chip under the title, then *Technical details* > *Copy* (open the sheet, wait until it has measured).
For app logs: tap the small bug icon (LOG), *clear*, repeat the problem, open LOG again, *copy*.
Passwords, setup codes and tokens are masked automatically, but **read it before pasting** and remove your Wi-Fi name, addresses
and the accessory's serial number if you don't want them public.

```
paste here
```

Please don't attach APKs or the original app (see NOTICE.md). Say which release or build you use: the last line of the copied text
shows it (for example `native layer nx-16`).
