# Obscura

A picture-guessing game: a movie scene, an actor or an anime character starts distorted and clears up over time. Name it early for more points.

Live site: https://hugurozmen.github.io/obscura/

## What is in it

- Three modes: Classic (five rounds), Sprint (60 seconds) and Survival (three lives)
- A daily set with streaks, three difficulty levels and five kinds of distortion
- Challenge links that give a friend the same five pictures and your score to beat
- A profile page with statistics and 14 achievements, kept in the browser
- English and Turkish
- Installable as an app (web manifest and service worker)

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page markup |
| `styles.css` | Styles |
| `app.js` | Game engine, modes, profile, routing |
| `i18n.js` | English and Turkish text |
| `config.js` | Site settings, including the TMDB key |
| `sw.js`, `manifest.webmanifest`, `icon*.png`, `icon.svg`, `og.png` | Install and share assets |

There is no build step. Any static host works.

## TMDB key

Anime loads from AniList without a key. Movies and actors load from TMDB and need a key.
Put one in `config.js` (`tmdbKey`) so they work for every visitor. With the field empty,
each visitor is asked for their own key on the About page.

## Pictures and rights

Obscura stores no pictures. Images are requested live from AniList and TMDB and belong to
their rights holders. This product uses the TMDB API but is not endorsed or certified by TMDB.
