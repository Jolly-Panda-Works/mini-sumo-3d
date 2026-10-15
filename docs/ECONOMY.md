# Mini Sumo economy

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
| Welcome gift | 500 | Once per guest account. |
| Training bout | +5 | Training Arena only. The round lasted ≥ 20 s and you didn't leave it. |
| Training win | +15 | As above, and you won. |
| First bout of the day | +50 | First rewarded training bout per UTC day. |
| Daily cap | 300 | Free rewards (the three above) per account per UTC day. |
| Paid arena win | prize | See below. |

Anti-farming: rewards are recorded once per player per match (`match_results` primary key), short rounds and leavers get nothing, the daily cap bounds bot farming, and private rooms give no rewards (two friends could otherwise farm each other).

## Arenas

Defined once in `ARENA_CONFIG` (`config.ts`) and served to clients by `GET /api/catalog`.

| Arena | Entry | Players | Bots | Unlock | Max prize (4 players) |
| --- | ---: | :---: | :---: | --- | ---: |
| Training | free | 2–4 | yes | – | rewards only |
| Rookie | 100 | 2–4 | no | – | 360 |
| Pro | 500 | 2–4 | no | 10 bouts | 1,800 |
| Champion | 2,000 | 2–4 | no | 20 bouts, 10 wins | 7,200 |

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

The shop **is** the existing wardrobe, organised in tabs (hair, colour, face, outfit; 36 items). Each appearance option has a stable item id (`hair.mohawk`, `hairColor.blue`, …). The first option of each category is a free starter item owned by everyone, also offline; every other item has a price in `COSMETIC_PRICES` (`packages/shared/src/economy.ts`), the single table the server charges from. Bought items are owned for good and listed first in their tab.

- Locked options show their price; picking one previews it on your wrestler (try before you buy).
- *Buy* calls `POST /api/shop/purchase` with the item id and a UUID idempotency key. The server takes the price from its own catalog, debits and grants ownership in one transaction. Buying something you own never charges again.
- The server only lets you **wear** owned items: join options, `setAppearance` and `PUT /api/profile/appearance` replace anything unowned with the default.
- Cosmetics never change gameplay.
- Offline, you can wear starter items and items cached from your last online profile (display only).

Not supported yet (no renderer for them): emotes, victory effects. Add them to the catalog once the game can show them.

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
