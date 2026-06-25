# PTR1e Tick Health Automation

External Foundry VTT module for Pokemon Tabletop Reunited (`ptu`).

It adds custom PTR1e Rule Elements named `TickHealth` and `ApplyEffectOnTurn`.

## Installation from The Forge

Manifest URL:

```text
https://github.com/marcbenoitcote-star/ptr1e-tick-health/releases/latest/download/module.json
```

Steps:

1. In The Forge, open **Bazaar**.
2. Click **Install From Manifest**.
3. Paste the Manifest URL above.
4. If Forge tries to search the Bazaar first, disable **Install from the Bazaar if the package is found**.
5. Click **Install Module**.
6. Enable the module in your PTR1e world from **Manage Modules**.

Important: The GitHub repository or release asset must be publicly reachable for Forge/Foundry to install it from a manifest URL. If this repository stays private, Forge will not be able to download `module.json` or `module.zip` unless a separate public release mirror is used.

## Rule Elements

### TickHealth

Add this rule to any PTR1e item that can host rules, such as effects, conditions, feats, abilities, items, or moves.

The rule is editable in the PTR1e item sheet. It supports:

- `mode`: `add-health`, `subtract-health`, `add-temp-health`, or `subtract-temp-health`
- `fraction`: `1/16`, `1/10 (Tick)`, `1/8`, `1/6`, `3/10`, `1/4`, `1/3`, or `1/2`
- `value`: multiplier for the selected fraction
- `timing`: `turn-start` or `turn-end`
- `label`: reason/source shown in chat

If `label` is omitted or blank, the Rule Element now falls back to the owning Item name, then to `Tick Health`, so imported or incomplete rules do not fail validation with an invalid label.
- `predicate`: PTR1e predicate array
- `chatMessage`: whether to send the chat message

Gain one tick of HP at turn start:

```json
{
  "key": "TickHealth",
  "mode": "add-health",
  "fraction": "1/10 (Tick)",
  "value": 1,
  "timing": "turn-start",
  "label": "Regeneration"
}
```

Lose one tick of HP at turn end:

```json
{
  "key": "TickHealth",
  "mode": "subtract-health",
  "fraction": "1/10 (Tick)",
  "value": 1,
  "timing": "turn-end",
  "label": "Poison"
}
```

Gain one tick of temporary HP at turn start:

```json
{
  "key": "TickHealth",
  "mode": "add-temp-health",
  "fraction": "1/10 (Tick)",
  "value": 1,
  "timing": "turn-start",
  "label": "Shield"
}
```

Lose one tick of temporary HP at turn end:

```json
{
  "key": "TickHealth",
  "mode": "subtract-temp-health",
  "fraction": "1/10 (Tick)",
  "value": 1,
  "timing": "turn-end",
  "label": "Shield Decay"
}
```

The temporary HP modes use PTR1e's temporary HP fields:

- `system.tempHp.value`
- `system.tempHp.max`

Gain two ticks only while a predicate is true:

```json
{
  "key": "TickHealth",
  "mode": "add-health",
  "fraction": "1/10 (Tick)",
  "value": 2,
  "timing": "turn-start",
  "label": "Healing Aura",
  "predicate": ["self:types:grass"]
}
```

### ApplyEffectOnTurn

Use this rule when an item or effect should apply another PTR1e effect or condition to its owning actor at the start or end of that actor's turn.

It supports:

- `uuid`: UUID of the PTR1e effect or condition to apply
- `timing`: `turn-start` or `turn-end`
- `label`: reason/source shown in chat
- `predicate`: PTR1e predicate array
- `chatMessage`: whether to send the chat message

`ApplyEffectOnTurn` attempts to apply the UUID every matching turn while its predicate is true. If the applied effect should not stack, configure that behavior through the applied effect or condition itself.

Apply an effect at the target actor's turn start:

```json
{
  "key": "ApplyEffectOnTurn",
  "uuid": "Compendium.ptu.effects.Item.REPLACE_WITH_EFFECT_ID",
  "timing": "turn-start",
  "label": "Lingering Aura",
  "predicate": [],
  "chatMessage": true
}
```

Apply an effect at the target actor's turn end:

```json
{
  "key": "ApplyEffectOnTurn",
  "uuid": "Compendium.ptu.effects.Item.REPLACE_WITH_EFFECT_ID",
  "timing": "turn-end",
  "label": "Delayed Condition",
  "predicate": [],
  "chatMessage": true
}
```

## Notes

- The available fractions are `1/16`, `1/10 (Tick)`, `1/8`, `1/6`, `3/10`, `1/4`, `1/3`, and `1/2`.
- The final amount is `value * floor(actor.system.health.max * fraction)`.
- HP is clamped between `0` and `system.health.max` by default.
- Temporary HP never goes below `0`.
- Temporary HP gains are capped to the rule's calculated bonus. If a rule grants 10 temporary HP and the actor already has 10 or more, it does not stack another 10 on the next turn. If the actor has less than 10, it refills only up to 10.
- Turn start uses PTR1e's native rule callback.
- Turn end is handled through the `ptu.endTurn` hook.
- Chat messages are whispered to the actor owners and GMs.
