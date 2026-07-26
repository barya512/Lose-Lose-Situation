# Archive

Point-in-time design records and execution plans that have been **fully
implemented**. They are kept for the *why* — each carries a decision table
explaining choices the current code no longer explains on its own.

**Nothing here is current guidance.** Where an archived file describes how the
game works today, believe the live docs instead:

| For | Read |
|-----|------|
| Client scenes, theme tokens, structure | [client-architecture.md](../client-architecture.md) |
| Running and playing the game | [getting-started.md](../getting-started.md) |
| What's built and what's next | [roadmap.md](../roadmap.md) |
| Load-bearing decisions | [adr/](../adr/) |

| File | Was | Superseded because |
|------|-----|--------------------|
| [2026-07-24-client-scaffold-slots-design.md](2026-07-24-client-scaffold-slots-design.md) | Design spec for the client scaffold + slots vertical slice | Shipped |
| [2026-07-24-client-scaffold-slots-plan.md](2026-07-24-client-scaffold-slots-plan.md) | Task-by-task execution plan for the same | Every task executed |
| [2026-07-25-gui-polish-design.md](2026-07-25-gui-polish-design.md) | Poison hub, casino cards, slot relayout, win juice | Shipped; its "Market is coming soon" is now wrong — Market is a full scene |
| [2026-07-26-visual-theme-design.md](2026-07-26-visual-theme-design.md) | The casino-felt retheme: palette, type, edge chrome | Shipped; the token contract now lives in `core/theme.ts` and `client-architecture.md` |
