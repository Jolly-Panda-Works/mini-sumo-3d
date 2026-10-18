# Mini Sumo economy

> **Current release: on-device economy.** While online play is not available, the same rules run locally (`apps/client/src/network/localEconomy.ts`, stored on the device): wallet, ledger, wardrobe purchases, arena entries against bots, prizes, training rewards, XP and levels. Only buying coins (the coin shop) is *Coming soon*. The server described below takes over as the authority when online play launches.

A server-authoritative virtual-currency economy: earn **Sumo Coins** by playing, pay an entry fee to compete in an arena, the server pays the winner, and coins buy cosmetics in the existing wardrobe.

**This is not real-money wagering.** Coins can't be bought with money, sent to other players, traded or cashed out. Entry fees and prizes are virtual. There are no real-money purchases in this version.

## What the audit found (before this change)

| Area | State before |
| --- | --- |
| Identity | None. A player was a per-connection Colyseus session id. |
| Persistence | None on the server. The client kept settings (name, look) in `localStorage`. |
| Currency, inventory, rewards | None. |
| Customisation | `packages/shared/src/appearance.ts`: 4 indexes (hair, hair colour, face, outfit), all free. |
| Matches | `GameSession` (authoritative, framework-free) inside `MiniSumoRoom`; quick match with bot fill; private rooms. |
| Offline mode | The client runs `GameSession` locally when no server is reachable. |

So the economy adds the smallest persistent layer that fits: **guest accounts and a SQLite ledger on the game server**, using Node's built-in `node:sqlite` (no native dependency to compile on Windows). Nothing else was replaced.

## Accounts and identity

- On first online use the client calls `POST /api/guest` and stores the returned **token** (a credential, never a balance) in `localStorage`. The server stores only its SHA-256 hash.
- Every API call and every room join sends the token; the server resolves the account. A client-supplied account id is never trusted.
- **Guest accounts are per device.** Coins and owned items don't move between devices or browsers yet, and clearing site data loses the guest account. A future sign-in can attach existing guest accounts; nothing here promises synchronisation.

## Currencies

| Currency | Id | State |
| --- | --- | --- |
| Sumo Coins | `coins` | Enabled. Free to earn. Used for arena entries and cosmetics. |
| Sumo Gems | `gems` | Prepared, **disabled**. Wallet rows exist; no way to earn, buy or spend them. The server rejects any gem transaction while `premiumCurrency` is off. |

Balances are integers in a `wallets` row per account and currency (`CHECK (balance >= 0)`).

## Earning coins

All values are in `apps/server/src/economy/config.ts` (`ECONOMY`).

| Source | Amount | Conditions |
| --- | ---: | --- |
| Welcome gift | 200 | Once per player: enough for a first Rookie bout. |
| Training bout | 0 | Free practice: no coins, but XP and stats (the round lasted ≥ 20 s and you didn't leave it). |
| Daily coins | +100 | Once per day from the coin shop. |
| Level up | 50 + 25 × level | For every level reached. |
| Paid arena win | prize | See below. |

Anti-farming: rewards are recorded once per player per match (`match_results` primary key), short rounds and leavers get nothing, the daily cap bounds bot farming, and private rooms give no rewards (two friends could otherwise farm each other).

## Arenas

Defined once in `ARENA_CONFIG` (`config.ts`) and served to clients by `GET /api/catalog`.

| Arena | Entry | Players | Unlock | Max prize (4 players) |
| --- | ---: | :---: | --- | ---: |
| Private room | free | 2–4 | – | no coins (XP only), friends and bots |
| Training | free | 2–4 | – | no coins (XP only) |
| Rookie | 50 | 2–4 | level 1 | 180 |
| Amateur | 150 | 2–4 | level 3 | 540 |
| Pro | 500 | 2–4 | level 5 | 1,800 |
| Veteran | 1,000 | 2–4 | level 8 | 3,600 |
| Champion | 2,000 | 2–4 | level 10 | 7,200 |
| Master | 5,000 | 2–4 | level 15 | 18,000 |
| Legend | 10,000 | 2–4 | level 20 | 36,000 |
| Godlike | 25,000 | 2–4 | level 30 | 90,000 |

**Level-up rewards:** reaching a level pays `50 + 25 × level` coins (level 2 = 100, level 5 = 175, level 10 = 300); several levels at once add up.

**Daily coins:** the coin shop gives 100 free coins once a day.

**Levels:** every finished bout (not left early) gives XP: 20, +30 for a win, times the arena's multiplier: Training and private rooms ×1, Rookie ×1.5, Amateur ×1.75, Pro ×2, Veteran ×2.5, Champion ×3, Master ×4, Legend ×5, Godlike ×6. Total XP for a level is `50 × (level − 1) × level` (level 2 = 100, level 5 = 1,000, level 10 = 4,500). Arenas, rewards, prizes and levels are defined once in `packages/shared/src/economy.ts` and used by both the local economy and the server.

**Bots:** on the device, every arena is played against bots. Training uses the difficulty picked on its card; paid arenas pick one at random for their tier (Rookie easy or normal, Amateur mostly normal, Pro and Veteran normal or hard, Champion mostly hard, Master / Legend / Godlike almost always hard). Online, paid arenas are humans only.

The Training Arena is always free and open, so a player with zero coins can always keep playing and earning.

Paid arenas are humans only: a prize must come from other players' entries, never from bots. They start automatically 12 s after a second player joins (at once when full), and are **cancelled and refunded** if nobody else joins within 60 s. Each paid bout is a single round; *Play again* takes you back to the arena list for a new entry.

## Payout formula

```
pool  = entryFee × players            (players = locked entries of the match)
prize = floor(pool × (100 − fee%) / 100)
sink  = pool − prize                  (removed from circulation)
```

Integer arithmetic only, so `prize + sink = pool` exactly and rounding can never create coins. Examples with a 10 % economy fee: 4 × 100 → prize 360, sink 40; 2 × 100 → prize 180, sink 20.

The **economy fee is a currency sink** to keep the coin supply in check. It is not business revenue.

## Entry, refund and disconnect policy

| Moment | What happens to the entry fee |
| --- | --- |
| Joining a paid room | Debited atomically together with an `arena_entries` row (`reserved`). Not enough coins: the join is refused, nothing is charged. |
| Joining the same room twice (second tab, retry) | Refused by a unique index on active entries; never charged twice. |
| Leaving before the bout starts | Refunded. |
| Not enough players in time | Room cancelled, everyone refunded. |
| Bout starts (`playing`) | Entries become `locked`: no refund for leaving any more. |
| Leaving or disconnecting during the bout | Treated as being pushed out (existing rules). No refund. |
| Single winner | Prize paid to the winner, entries `settled`. |
| Draw (time-up tie or simultaneous ring-out) | Everyone refunded, nothing removed. |
| Winner without a paid entry, or inconsistent data | Match voided, everyone refunded. |
| Room closes before settlement (crash, everyone gone) | `onDispose` refunds all unsettled entries. |
| Server restart | Rooms are in memory, so on startup every unsettled entry is refunded (`recoverOrphanedEntries`). |

Settlement is keyed by `matchId = <roomId>:<round>` (primary key of `settlements`). Settling again returns the stored result and changes nothing, even if a different winner is passed.

## Ledger

Every balance change goes through one function, `Economy.apply()`, which in a single SQLite transaction:

1. returns the original result if the **idempotency key** was already used,
2. updates the wallet only if the balance stays ≥ 0,
3. appends a row to `transactions` (id, account, currency, signed amount, category, reason, match id, item id, idempotency key, balance after, timestamp).

The ledger is append-only; tests check that the ledger sum always equals the balance.

| Idempotency key | Used for |
| --- | --- |
| `welcome:<account>` | welcome gift |
| `entry:<entryId>` / `refund:<entryId>` | arena entry and its refund (one each) |
| `prize:<matchId>` | the single prize of a match |
| `reward:<matchId>:<account>` | free bout reward |
| `purchase:<account>:<clientKey>` | cosmetic purchase (client sends a UUID per click) |

Tables: `accounts`, `wallets`, `transactions`, `ownership`, `arena_entries`, `settlements`, `match_results` (schema in `Economy.ts`). The database file is `DATABASE_PATH` (default `data/mini-sumo.db`, relative to the server's working directory). Back it up; it is the only copy of player balances.

## Cosmetic shop

The shop **is** the existing wardrobe, organised in tabs (hair, colour, face, outfit; 36 items). Each appearance option has a stable item id (`hair.mohawk`, `hairColor.blue`, …). Three items per category are free starter items owned by everyone, also offline; every other item has a price in `COSMETIC_PRICES` (`packages/shared/src/economy.ts`), the single table the server charges from. Bought items are owned for good and listed first in their tab.

- Locked options show their price; picking one previews it on your wrestler (try before you buy).
- *Buy* calls `POST /api/shop/purchase` with the item id and a UUID idempotency key. The server takes the price from its own catalog, debits and grants ownership in one transaction. Buying something you own never charges again.
- The server only lets you **wear** owned items: join options, `setAppearance` and `PUT /api/profile/appearance` replace anything unowned with the default.
- Cosmetics never change gameplay.
- Offline, you can wear starter items and items cached from your last online profile (display only).

Not supported yet (no renderer for them): emotes, victory effects. Add them to the catalog once the game can show them.

## Coin shop

The coin shop (coin button on the home screen) lists six Sumo Coin packs (`COIN_PACKS` in `packages/shared/src/economy.ts`: 500 to 30,000 coins). Buying is **not available**: every pack shows *Coming soon* and no real-money price is displayed. On Android, real purchases will have to go through Google Play Billing.

## Feature flags (server-enforced)

| Variable | Default | Effect |
| --- | --- | --- |
| `ECONOMY_ENABLED` | `true` | Accounts, wallets, paid arenas, rewards. `false`: rooms run without accounts; paid arenas refuse to open. |
| `SHOP_ENABLED` | `true` | Cosmetic purchases. |
| `PREMIUM_CURRENCY_ENABLED` | `false` | Gems. Keep off. |
| `REAL_MONEY_PURCHASES_ENABLED` | `false` | Keep off. Even when set, no checkout can succeed: no provider exists. |

## Payments (prepared, not active)

`apps/server/src/economy/payments.ts` defines a `PaymentProvider` interface and a `PaymentService` that always refuses (`POST /api/payments/checkout` returns `501 payments_disabled`). There is no provider SDK, no buy-currency button, no simulated receipt.

To add a provider later:

1. Implement `PaymentProvider` (checkout creation, server-side order/receipt verification, webhooks).
2. Fulfil only verified orders, crediting through `Economy.apply()` with the key `payment:<provider>:<orderId>` so duplicate webhooks can't double-grant.
3. Add gem-priced items to the catalog and enable `premiumCurrency` / `realMoneyPurchases` after store and legal review. Platform rules differ (Google Play billing for Android in-app purchases).

## Events

`economy/events.ts` writes one JSON line per event (`arena_entry_accepted`, `match_settled`, `cosmetic_purchased`, …) to the server log; set `ECONOMY_EVENT_LOG=false` to silence it. Useful metrics to derive later: arena entry rate, cancellation rate, coins earned vs. removed per day, cosmetic conversion, balance distribution, share of players who can't afford Rookie. No analytics provider is integrated and no figures have been measured.

## HTTP API

| Method and path | Auth | Purpose |
| --- | :---: | --- |
| `GET /api/catalog` | – | Flags, arenas, shop items |
| `POST /api/guest` | – | New guest account (rate-limited per IP) |
| `GET /api/profile` | token | Balances, owned items, look, stats, daily progress |
| `GET /api/ledger?limit=` | token | Transaction history |
| `POST /api/shop/purchase` | token | `{ itemId, idempotencyKey }` |
| `PUT /api/profile/appearance` | token | Save the equipped look (owned items only) |
| `POST /api/payments/checkout` | token | Always `501` |

Arena entry has no endpoint: the fee is charged when a paid room accepts your join (`onAuth` + `onJoin`), so there is no window between paying and joining.

## Platforms

Web, desktop (Electron) and Android (Capacitor) all run the same client and talk to the same server API, so the rules are identical. Offline builds (no server) show the economy as unavailable and keep the free Training Arena.

## Explicitly out of scope

Season or battle pass, real-money entry fees or prizes, cash-out, cryptocurrency, player-to-player transfers or trading, loot boxes, premium checkout, any payment provider, a sign-in system.

## Tests

`apps/server/test/economy.test.ts` (wallet, entries, concurrency, cancellation, recovery, settlement, draws, rewards, cap, shop, payments) and `paid-arena.test.ts` (auto start, cancel, single round). Run `npm test`.
