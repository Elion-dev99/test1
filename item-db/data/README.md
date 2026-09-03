# VAMPIR item catalog

`vampir-catalog.json` is curated from public GameWith guides (not an official Netmarble dump).

## Coverage

Included (verified against GameWith pages linked in `meta.sources`):

- Heroic/Legendary weapons, armor, accessories listed on equipment pages
- Burial goods (副葬品) + remnant materials
- Craft materials named on the craft guide (including 上級/最上級 grades where the guide describes them)
- World Boss participation rewards, Gehenna-named rewards, buffs, portraits, collection categories, currencies

## Intentionally incomplete

- Full common / uncommon / rare field-drop equipment names are **not** published as complete lists on GameWith; those pages focus on heroic/legendary
- Event-only temporary buffs
- Every Sephira individual roll / every skillbook variant name beyond the rarity tiers named in guides

## Enhance tables (in-game screenshots)

`vampir-enhance/seiei-furubita-orb.json` — ヴァイパー専用 T4 一般武器「精鋭の古びたオーブ」の +0〜+15。
取引所のアイテム詳細スクショ（黄色の強化ボーナス）から照合済み。

```bash
bash item-db/scripts/seed-worn-orb-enhance.sh https://mmorpg-item-db.enchanting-supernova.workers.dev
bash item-db/scripts/verify-worn-orb-enhance.sh https://mmorpg-item-db.enchanting-supernova.workers.dev
```

Re-run full catalog seed after deploy:

```bash
bash item-db/scripts/seed-vampir-catalog.sh https://mmorpg-item-db.enchanting-supernova.workers.dev
bash item-db/scripts/verify-vampir-catalog.sh https://mmorpg-item-db.enchanting-supernova.workers.dev
```
