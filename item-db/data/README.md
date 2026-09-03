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

`vampir-enhance/viper-orbs.json` — ヴァイパー専用オーブ全種（51件、+0〜+15）。
取引所スクショから最低/最大攻撃を照合し、強化段階は次の固定式で算出:

- +1〜+6: 武器追加攻撃力 +3 / 段階
- +7〜+9: 武器追加攻撃力 +5、命中 +3 / 段階
- +10〜+15: 武器追加攻撃力 +10、命中 +6 / 段階

最低/最大攻撃は強化しても変わらない。追加ステ（スキルダメージ等）も段階で増えない。

カタログシードのあとにオーブ強化テーブルを流す（カタログ側は stats を持たないので上書きしない）:

```bash
export ADMIN_PASSWORD='…'   # Cloudflare Worker secret と同じ値
bash item-db/scripts/seed-vampir-catalog.sh https://mmorpg-item-db.enchanting-supernova.workers.dev
bash item-db/scripts/verify-vampir-catalog.sh https://mmorpg-item-db.enchanting-supernova.workers.dev
bash item-db/scripts/seed-viper-orbs.sh https://mmorpg-item-db.enchanting-supernova.workers.dev
bash item-db/scripts/verify-viper-orbs.sh https://mmorpg-item-db.enchanting-supernova.workers.dev
```

`vampir-enhance/seiei-furubita-orb.json` — 「精鋭の古びたオーブ」単体シード（後方互換。全種 JSON にも含まれる）。

## Game versions

`vampir-versions.json` — Lodestone の Patch 相当。現行は `2026.09.02`。

```bash
export ADMIN_PASSWORD='…'
bash item-db/scripts/seed-vampir-versions.sh https://mmorpg-item-db.enchanting-supernova.workers.dev
```

UI では `Version: …` 表示と「最新アップデート検索」が使えます。

## Admin

公開 UI は閲覧専用。登録・ドロップ編集は `/admin.html`（`ADMIN_PASSWORD` でログイン）。
GitHub Actions の `ADMIN_PASSWORD` secret を設定すると、デプロイ時に Worker secret へ同期されます。
