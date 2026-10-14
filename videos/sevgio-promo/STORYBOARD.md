---
format: 1080x1920
duration: 30s
message: "Book your next short stay at sevgio.com"
arc: Hook → Feel at home → What you get → How it works → Promise → CTA
audience: travelers looking for a short-term rental
mode: autonomous
music: none
captions: skipped (silent cut, no narration)
---

## Video direction

- **palette system** — from `frame.md`: green ground for gravity frames (1, 5, 6), cream ground for content frames (2, 3, 4); pink is the accent (display words, monogram, rules). Max two surface tones per frame.
- **type** — Source Serif 4 weight 500 display (negative tracking), 400 body; JetBrains Mono 500 uppercase chrome. Mono topbar "SEVGIO · SHORT STAYS" + monogram "S" circle on every frame.
- **motion grammar** — silent cut, so reveals are paced to the beat (~0.5–0.8s between reveals), long-tail `power3.out` settles, word-by-word rises for display lines, hairline rules draw left→right. No bounce.
- **rhythm** — frame 5 is the held breather (one line, then stillness) before the CTA climax.
- **negative list** — no shadows, gradients, glow, photos/stock imagery, invented amenities, prices, ratings or locations. No front-load-then-freeze; no floating "screensaver" drift.
- **keep-out** — all content above y ≈ 1600.

## Frame 1 — Hook

- scene: "Your stay, sorted." in big pink serif on forest green
- duration: 4s
- transition_in: cut
- status: animated
- src: compositions/frames/01-hook.html
- blueprint: compose

Scene 1 (0.0–0.6s): green ground; topbar draws in (mono label left, pink monogram circle right).
Scene 2 (0.4–1.6s): "Your stay," rises word-by-word in cream display-hero, upper third, left-aligned.
Scene 3 (1.5–2.6s): "sorted." rises in pink display-hero below it; a 2px pink rule draws under it.
Scene 4 (2.6–4.0s): mono kicker "SHORT-TERM RENTALS" fades up; hold.

## Frame 2 — Feel at home

- scene: "Feels like home." statement with a line-drawn house outline
- duration: 5s
- transition_in: crossfade
- status: animated
- src: compositions/frames/02-home.html
- blueprint: compose

Scene 1 (0.0–1.4s): cream ground, topbar; an SVG house outline in green strokes draws itself (roof, walls, door), centered upper half.
Scene 2 (1.4–2.6s): "Feels like" rises in green display.
Scene 3 (2.6–3.8s): "home." rises in green display-hero; door of the house fills pink.
Scene 4 (3.8–5.0s): hold.

## Frame 3 — What you get

- scene: three rotating-fill topic tiles stack in, one per beat
- duration: 6s
- transition_in: crossfade
- status: animated
- src: compositions/frames/03-features.html
- blueprint: compose

Scene 1 (0.0–1.0s): cream ground, topbar; headline-xl "Everything you need" rises.
Scene 2 (1.0–2.4s): tile 01 (green fill, pink text) "Comfortable spaces" slides up.
Scene 3 (2.4–3.8s): tile 02 (pink fill, green-deep text) "Easy online booking" slides up.
Scene 4 (3.8–5.2s): tile 03 (cream-2 with green border) "Stay your way" slides up.
Scene 5 (5.2–6.0s): hold.

## Frame 4 — How it works

- scene: three step tiles — Pick dates, Choose your place, Check in & relax
- duration: 6s
- transition_in: crossfade
- status: animated
- src: compositions/frames/04-steps.html
- blueprint: compose

Scene 1 (0.0–1.0s): cream ground, topbar; headline "Booking is simple" rises.
Scene 2 (1.0–2.4s): step 01 "Pick your dates" tile slides in from left, its top rule draws.
Scene 3 (2.4–3.8s): step 02 "Choose your place".
Scene 4 (3.8–5.2s): step 03 "Check in & relax".
Scene 5 (5.2–6.0s): hold.

## Frame 5 — Promise

- scene: "Short stays. Real comfort." on green — held breather
- duration: 4s
- transition_in: crossfade
- status: animated
- src: compositions/frames/05-promise.html
- blueprint: compose

Scene 1 (0.0–1.2s): green ground, topbar; "Short stays." rises in cream display.
Scene 2 (1.2–2.4s): "Real comfort." rises in pink display; pink rule draws.
Scene 3 (2.4–4.0s): held read, stillness.

## Frame 6 — CTA

- scene: monogram stamp, "Book your stay", big pink "sevgio.com"
- duration: 5s
- transition_in: crossfade
- status: animated
- src: compositions/frames/06-cta.html
- blueprint: compose

Scene 1 (0.0–1.0s): green ground, topbar; large pink monogram circle "S" scales in, upper third, centered.
Scene 2 (1.0–2.2s): "Book your stay" rises in cream display.
Scene 3 (2.2–3.4s): "sevgio.com" rises in pink headline-xl inside a 2px pink outlined pill; rule draws.
Scene 4 (3.4–5.0s): mono footline "LINK IN BIO · SEVGIO.COM" fades up; final settle.
