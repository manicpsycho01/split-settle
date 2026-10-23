# Split & Settle

**Split the bill. Settle in one UPI tap.** A bill-splitting app for friends in India. Add what everyone paid, see who owes whom (to the paisa), and settle with UPI payment links or a QR code. Friends join with a WhatsApp link. There's no sign-up and nothing to install.

**Live:** https://split-settle-iota.vercel.app — install it from the browser menu ("Add to Home Screen").

Built with Expo (React Native), so the same code can ship to the App Store and Play Store later.

## What it does

- **Groups and invites**
  - Each placeholder friend gets a **personal invite link** that joins as them and works once. A separate group link is for new people.
  - The admin can reset the group link, or unlink someone who joined as the wrong person.
- **Expenses**
  - Split equally, by exact amounts, by shares or by percentage. Splits are computed in integer paise with largest-remainder rounding, so they always add up exactly.
  - Only the author or the admin can edit an expense. Deletes can be undone.
- **Settle up**
  - Suggested payments settle everyone in at most n−1 transfers. The order is stable, so recording one payment doesn't reshuffle the rest (the approach used by [Spliit](https://github.com/spliit-app/spliit), MIT).
  - Each payment opens a UPI app with the amount filled in (`upi://pay`). On a laptop it shows a scannable QR.
  - "Record payment" is just what you tell the group. The app never sees your bank.
- **Live and accountable:** realtime sync between phones, and an activity log of who added, edited, deleted or recorded what.
- **Import from Splitwise:** upload Splitwise's own "Export as spreadsheet" file.
  - The export lists each person's **net** effect per row, so rows are rebuilt to reproduce every net exactly. Rows with several payers become one expense per payer, and Splitwise payments become recorded payments.
  - Before anything is saved, the result is checked against the export's own "Total balance" row.
  - There's no "Connect Splitwise" login: Splitwise's API terms require a commercial licence beyond personal use, and a login would mean storing friends' tokens.
- **Demo mode:** a fictional Goa trip saved only on your device, to try everything without an account.

## Security model

Data lives in a dedicated `split` schema in Supabase (Postgres).
- **Sign-in:** friends sign in as Supabase *anonymous* users, so the session stays on their device.
- **Who sees what:**
  - Row-level security lets you read a group only if you're a member.
  - Column grants hide invite tokens; you can only get them through `invite_links()`, which checks membership.
- **Changes:**
  - Joining, claiming, creating and importing go through `SECURITY DEFINER` functions with limits: groups per day, people per group, text lengths.
  - A trigger rejects expenses whose shares don't add up or that name people outside the group.
  - Another trigger logs every change with before and after values.

See `supabase/schema.sql`.

## Run it

```bash
npm install
cp .env.example .env.local          # EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_KEY (publishable key)
npx expo start                      # phone via Expo Go, or press w for web
npx expo export -p web && npx serve dist -l 3400
```

## Tests

```bash
npx vitest run                      # money maths (incl. 2,300 randomised splits/settlements) + Splitwise import
LIVE=1 npx vitest run               # + access rules against the real database with four guest users
BASE_URL=http://localhost:3400 npx playwright test
```

**Browser suite:**
- **Demo flows:** adding, editing and deleting expenses; restoring one; settling up and undoing it; invites.
- **Splitwise import** end to end.
- **Two friends, live:**
  - Asha creates a group, and Bilal joins with his personal link.
  - The same link fails for a third person.
  - Bilal's expense appears on Asha's screen in real time, and she settles up.
- **Reduced motion:** content stays visible.
- **Layout audit:** every screen at 17 sizes, from a 320px phone to a 2560px monitor.
- **First-screen hero check,** and scrolling with animations on.

## Design

Inspired by an Indian auto-rickshaw:
- **Colours:** black, auto-yellow for the one action per screen, deep green for money coming back, red for money owed.
- **Receipts:** warm paper with dotted leaders and torn edges.
- **Type:** Archivo for words and totals, Martian Mono for receipt lines.
