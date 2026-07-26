# Domain language

The words this project uses for its own concepts. If code, docs or conversation
reaches for a different word for one of these, that's drift — fix it here or fix
it there, but don't let both live.

This file is a glossary and nothing else. Architecture lives in
[docs/architecture.md](docs/architecture.md); decisions live in
[docs/adr/](docs/adr/).

## The inversion

**Win** — reaching a balance of exactly **$0**. The player wins by going broke.
Everything below inherits this inversion, and it is the single most common source
of misreading in the codebase.

**Reward** — an event that *lost* the player money. Celebrated: gold flash, coin
burst, screen shake. In API terms a `LOST` bet.

**Punish** — an event that *gained* the player money. Punished: red flash, glitch
particles. In API terms a `WON` bet.

> A bet's `status` is named from the **house's** point of view (`WON` = the bet
> paid out). The juice is named from the **player's**. `WON` is therefore bad.
> Code must reference `theme.outcome.reward` / `.punish`, never a colour, and
> never assume `WON` is good.

**Progress** — how far a run has travelled from its starting balance toward $0.
Not "score", not "loss so far".

## What a player picks

**Poison** — the hub screen where a run chooses how to lose money. Named for its
prompt ("choose your poison"), and the scene is `Poison`.

**Bet** — one way to lose money, offered on the poison screen: **beer**,
**market**, **casino**. Rendered as an `Orb`.

**Machine** — a casino game, offered on the casino screen: **slots**,
**blackjack**, **roulette**. Rendered as a `Card`.

> A bet is chosen on the poison screen; a machine is chosen after picking the
> casino bet. They are different levels of the same funnel, so neither word may
> stand in for the other. "Game" is ambiguous between the two and the product as
> a whole — avoid it for either.

**Stake** — the amount of money committed to one play. Never "bet amount", which
collides with **bet** above.

## Money

**Wallet** — the player's balance. Always integer **cents** in transit and in
storage ([ADR 0002](docs/adr/0002-money-as-cents.md)); it becomes a readable
string only in `core/money.ts`.

**Run** — one session from a funded wallet to $0 (or to giving up, which clears
the wallet).

**Last call** — the state of a wallet holding less than the minimum stake and
more than $0. The remaining balance becomes the only legal stake, and the only
price a beer can cost, so a run can always reach $0. Not "all-in", which implies
a choice the player doesn't have here.
