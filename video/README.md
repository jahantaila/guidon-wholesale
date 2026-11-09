# Onboarding walkthrough video

The ~2 minute animated tour linked from the "account approved" email
(Admin → Settings → New Account Walkthrough). Scene plan:
`docs/onboarding-walkthrough-script.md`. Built with [Remotion](https://remotion.dev).

Output: `out/guidon-onboarding.mp4` (1920×1080, 30 fps, H.264 + AAC).

## Re-make it

```bash
cd video && npm install
```

1. **Screens** (only if the portal UI changed). Start the local demo server
   (`guidon-local-demo` in `.claude/launch.json`: placeholder Supabase keys, so
   data comes from `data/*.json` and no email goes out). Back up `data/`, load
   a demo seed (customer `cust-001` with `mustChangePassword: true` and a temp
   password of `Welcome-4821`), then:
   ```bash
   SEED_DIR=/path/to/seed npm run capture
   ```
   This writes `public/shots/*.png` and `src/shots.json` (button positions the
   cursor uses). It places a demo order, so restore `data/` afterwards.
2. **Preview / tweak:** `npm run studio`. Timing, camera moves, captions and
   stamps for every scene live in `src/scenes.ts`.
3. **Render:** `npm run render` (also regenerates the music and sound effects,
   which are synthesized by `scripts/gen-audio.cjs`; nothing to license).

Never record against a real customer account.
