const MODULE_ID = "ptr1e-tick-health";
const RULE_KEY = "TickHealth";
const APPLY_EFFECT_RULE_KEY = "ApplyEffectOnTurn";

const MODE_DEFINITIONS = {
  "add-health": {
    resource: "health",
    direction: "gain",
    label: "PTR1E_TICK_HEALTH.Mode.AddHealth"
  },
  "subtract-health": {
    resource: "health",
    direction: "lose",
    label: "PTR1E_TICK_HEALTH.Mode.SubtractHealth"
  },
  "add-temp-health": {
    resource: "tempHp",
    direction: "gain",
    label: "PTR1E_TICK_HEALTH.Mode.AddTempHealth"
  },
  "subtract-temp-health": {
    resource: "tempHp",
    direction: "lose",
    label: "PTR1E_TICK_HEALTH.Mode.SubtractTempHealth"
  }
};

const RESOURCE_ALIASES = {
  hp: "health",
  health: "health",
  tempHp: "tempHp",
  tempHP: "tempHp",
  tempHealth: "tempHp",
  temporaryHealth: "tempHp",
  "temp-hp": "tempHp",
  "temp-health": "tempHp",
  "temporary-health": "tempHp"
};

const MODE_ALIASES = {
  add: "add-health",
  gain: "add-health",
  heal: "add-health",
  lose: "subtract-health",
  loss: "subtract-health",
  damage: "subtract-health",
  remove: "subtract-health",
  subtract: "subtract-health"
};

const TIMING_ALIASES = {
  start: "turn-start",
  "turn-start": "turn-start",
  end: "turn-end",
  "turn-end": "turn-end"
};

const FRACTIONS = {
  "1/16": 1 / 16,
  "1/10 (Tick)": 1 / 10,
  "1/8": 1 / 8,
  "1/6": 1 / 6,
  "3/10": 3 / 10,
  "1/4": 1 / 4,
  "1/3": 1 / 3,
  "1/2": 1 / 2
};

Hooks.once("init", () => {
  if (game.system.id !== "ptu") return;
  registerCustomRuleElements();
});

Hooks.on("renderPTUItemSheet", (_sheet, $html) => {
  renderCustomRuleForms($html);
});

Hooks.on("ptu.endTurn", async (combatant) => {
  const actor = combatant?.actor;
  if (!actor?.rules?.length) return;
  if (actor.primaryUpdater && game.user !== actor.primaryUpdater) return;

  const actorUpdates = {};
  for (const rule of actor.rules) {
    await rule.onTurnEnd?.(actorUpdates);
  }

  const updateKeys = Object.keys(actorUpdates);
  if (updateKeys.length > 0) {
    await actor.update(actorUpdates);
  }
});

function registerCustomRuleElements() {
  const ruleElements = CONFIG.PTU?.rule?.elements;
  if (!ruleElements?.custom || !ruleElements?.builtin?.ActiveEffectLike) {
    console.error(`${MODULE_ID} | PTR1e RuleElements were not available during init.`);
    return;
  }

  const BaseRuleElement = Object.getPrototypeOf(ruleElements.builtin.ActiveEffectLike);

  registerTickHealthRuleElement(ruleElements, BaseRuleElement);
  registerApplyEffectOnTurnRuleElement(ruleElements, BaseRuleElement);
}

function registerTickHealthRuleElement(ruleElements, BaseRuleElement) {
  if (ruleElements.custom[RULE_KEY]) return;

  class TickHealthRuleElement extends BaseRuleElement {
    constructor(data, item, options = {}) {
      super({ ...data, label: data.label || item?.name || "Tick Health" }, item, options);
    }

    static defineSchema() {
      const { fields } = foundry.data;
      return {
        ...super.defineSchema(),
        resource: new fields.StringField({
          required: false,
          nullable: false,
          choices: Object.keys(RESOURCE_ALIASES),
          initial: "health"
        }),
        mode: new fields.StringField({
          required: false,
          nullable: false,
          choices: [...Object.keys(MODE_DEFINITIONS), ...Object.keys(MODE_ALIASES)],
          initial: "add-health"
        }),
        timing: new fields.StringField({
          required: false,
          nullable: false,
          choices: Object.keys(TIMING_ALIASES),
          initial: "turn-start"
        }),
        fraction: new fields.StringField({
          required: false,
          nullable: false,
          choices: Object.keys(FRACTIONS),
          initial: "1/10 (Tick)"
        }),
        value: new fields.NumberField({
          required: false,
          nullable: false,
          integer: true,
          min: 0,
          initial: 1
        }),
        ticks: new fields.NumberField({
          required: false,
          nullable: true,
          min: 0,
          initial: null
        }),
        clampToMax: new fields.BooleanField({
          required: false,
          nullable: false,
          initial: true
        }),
        chatMessage: new fields.BooleanField({
          required: false,
          nullable: false,
          initial: true
        })
      };
    }

    onTurnStart(actorUpdates) {
      if (TIMING_ALIASES[this.timing] === "turn-start") {
        this.applyTick(actorUpdates);
      }
    }

    onTurnEnd(actorUpdates) {
      if (TIMING_ALIASES[this.timing] === "turn-end") {
        this.applyTick(actorUpdates);
      }
    }

    applyTick(actorUpdates = {}) {
      if (!this.test(this.actor.getRollOptions())) return;

      const health = readActorHealth(this.actor, actorUpdates);
      if (health.currentMaxHP <= 0) return;

      const fractionValue = FRACTIONS[this.fraction] ?? FRACTIONS["1/10 (Tick)"];
      const unitAmount = Math.max(1, Math.floor(health.currentMaxHP * fractionValue));
      const multiplier = Math.max(0, Math.floor(Number(this.value ?? this.ticks) || 0));
      const amount = unitAmount * multiplier;
      if (amount <= 0) return;

      const mode = resolveMode(this.mode, this.resource);
      const delta = mode.direction === "gain" ? amount : -amount;

      if (mode.resource === "health") {
        const unclamped = health.currentHP + delta;
        const upper = this.clampToMax ? health.currentMaxHP : Number.MAX_SAFE_INTEGER;
        const newHP = Math.clamp(unclamped, 0, upper);
        if (newHP !== health.currentHP) {
          actorUpdates["system.health.value"] = newHP;
          this.createChatMessage({
            amount: Math.abs(newHP - health.currentHP),
            direction: mode.direction,
            resource: mode.resource,
            oldValue: health.currentHP,
            newValue: newHP
          });
        }
        return;
      }

      const newTempHP = mode.direction === "gain"
        ? Math.max(health.currentTempHP, amount)
        : Math.max(0, health.currentTempHP + delta);
      if (newTempHP !== health.currentTempHP) {
        actorUpdates["system.tempHp.value"] = newTempHP;
        this.createChatMessage({
          amount: Math.abs(newTempHP - health.currentTempHP),
          direction: mode.direction,
          resource: mode.resource,
          oldValue: health.currentTempHP,
          newValue: newTempHP
        });
      }
      if (newTempHP > health.currentTempMaxHP) {
        actorUpdates["system.tempHp.max"] = newTempHP;
      }
    }

    createChatMessage({ amount, direction, resource, oldValue, newValue }) {
      if (!this.chatMessage || amount <= 0) return;

      const actionKey = direction === "gain"
        ? "PTR1E_TICK_HEALTH.Chat.Gain"
        : "PTR1E_TICK_HEALTH.Chat.Lose";
      const resourceLabel = game.i18n.localize(
        resource === "health"
          ? "PTR1E_TICK_HEALTH.Resource.Health"
          : "PTR1E_TICK_HEALTH.Resource.TempHealth"
      );
      const label = this.label || this.item.name || "Tick Health";
      const content = game.i18n.format(actionKey, {
        actor: this.actor.link,
        amount,
        resource: resourceLabel,
        label,
        oldValue,
        newValue
      });

      const recipients = new Set(
        game.users
          .filter((user) => user.isGM || this.actor.testUserPermission(user, "OWNER"))
          .map((user) => user.id)
      );

      ChatMessage.create({
        content,
        speaker: ChatMessage.getSpeaker({ actor: this.actor, token: this.token }),
        whisper: Array.from(recipients)
      });
    }
  }

  ruleElements.custom[RULE_KEY] = TickHealthRuleElement;
  console.log(`${MODULE_ID} | Registered ${RULE_KEY} Rule Element.`);
}

function registerApplyEffectOnTurnRuleElement(ruleElements, BaseRuleElement) {
  if (ruleElements.custom[APPLY_EFFECT_RULE_KEY]) return;

  class ApplyEffectOnTurnRuleElement extends BaseRuleElement {
    constructor(data, item, options = {}) {
      super({ ...data, label: data.label || item?.name || "Apply Effect On Turn" }, item, options);
    }

    static defineSchema() {
      const { fields } = foundry.data;
      return {
        ...super.defineSchema(),
        uuid: new fields.StringField({
          required: false,
          nullable: false,
          blank: true,
          initial: ""
        }),
        timing: new fields.StringField({
          required: false,
          nullable: false,
          choices: Object.keys(TIMING_ALIASES),
          initial: "turn-start"
        }),
        chatMessage: new fields.BooleanField({
          required: false,
          nullable: false,
          initial: true
        })
      };
    }

    async onTurnStart() {
      if (TIMING_ALIASES[this.timing] === "turn-start") {
        await this.applyEffect();
      }
    }

    async onTurnEnd() {
      if (TIMING_ALIASES[this.timing] === "turn-end") {
        await this.applyEffect();
      }
    }

    async applyEffect() {
      if (!this.test(this.actor.getRollOptions())) return;

      const uuid = String(this.resolveInjectedProperties(this.uuid ?? "") ?? "").trim();
      if (!uuid) return;

      const sourceEffect = await getEffectFromUuid(uuid);
      if (!sourceEffect) return;

      const clonedEffect = sourceEffect.clone(this.overwrites ?? {});
      if (!(clonedEffect instanceof CONFIG.PTU.Item.documentClass)) return;

      const effectData = clonedEffect.toObject();
      foundry.utils.setProperty(effectData, "flags.core.sourceId", uuid);
      foundry.utils.setProperty(effectData, "system.origin", this.actor.uuid);
      effectData.system.effect ??= "";
      effectData.system.effect += `<blockquote>Applied by ${this.label ?? this.item.name} from ${this.actor.name}</blockquote>`;

      const created = await this.actor.createEmbeddedDocuments("Item", [effectData]);
      if (created.length > 0) {
        await this.createChatMessage(created[0]);
      }
    }

    async createChatMessage(effect) {
      if (!this.chatMessage) return;

      const label = this.label || this.item.name || "Apply Effect On Turn";
      const content = game.i18n.format("PTR1E_TICK_HEALTH.Chat.ApplyEffect", {
        actor: this.actor.link,
        effect: effect.link,
        label
      });

      const recipients = new Set(
        game.users
          .filter((user) => user.isGM || this.actor.testUserPermission(user, "OWNER"))
          .map((user) => user.id)
      );

      await ChatMessage.create({
        content,
        speaker: ChatMessage.getSpeaker({ actor: this.actor, token: this.token }),
        whisper: Array.from(recipients)
      });
    }
  }

  ruleElements.custom[APPLY_EFFECT_RULE_KEY] = ApplyEffectOnTurnRuleElement;
  console.log(`${MODULE_ID} | Registered ${APPLY_EFFECT_RULE_KEY} Rule Element.`);
}

function resolveMode(mode, resource) {
  if (MODE_DEFINITIONS[mode]) return MODE_DEFINITIONS[mode];

  const legacyDirection = MODE_ALIASES[mode] ?? "add-health";
  const legacyResource = RESOURCE_ALIASES[resource] ?? "health";
  const resolvedMode = legacyResource === "tempHp"
    ? legacyDirection.replace("health", "temp-health")
    : legacyDirection;

  return MODE_DEFINITIONS[resolvedMode] ?? MODE_DEFINITIONS["add-health"];
}

function renderCustomRuleForms($html) {
  renderTickHealthRuleForms($html);
  renderApplyEffectOnTurnRuleForms($html);
}

function renderTickHealthRuleForms($html) {
  const html = $html[0] ?? $html;
  if (!html?.querySelectorAll) return;

  for (const ruleBody of html.querySelectorAll(`.rule-body[data-key="${RULE_KEY}"]`)) {
    const index = Number(ruleBody.dataset.idx);
    const textarea = ruleBody.querySelector(`textarea[name="system.rules.${index}"]`);
    if (!textarea) continue;

    const rule = safeParseJSON(textarea.value, { key: RULE_KEY });
    rule.mode = normalizeModeForForm(rule);
    rule.fraction ??= "1/10 (Tick)";
    rule.value ??= rule.ticks ?? 1;
    rule.timing = TIMING_ALIASES[rule.timing] ?? "turn-start";
    rule.priority ??= 100;
    rule.label ??= "";
    rule.predicate ??= [];
    rule.chatMessage ??= true;
    rule.clampToMax ??= true;

    ruleBody.innerHTML = buildRuleFormHTML(index, rule);
  }
}

function renderApplyEffectOnTurnRuleForms($html) {
  const html = $html[0] ?? $html;
  if (!html?.querySelectorAll) return;

  for (const ruleBody of html.querySelectorAll(`.rule-body[data-key="${APPLY_EFFECT_RULE_KEY}"]`)) {
    const index = Number(ruleBody.dataset.idx);
    const textarea = ruleBody.querySelector(`textarea[name="system.rules.${index}"]`);
    if (!textarea) continue;

    const rule = safeParseJSON(textarea.value, { key: APPLY_EFFECT_RULE_KEY });
    rule.uuid ??= "";
    rule.timing = TIMING_ALIASES[rule.timing] ?? "turn-start";
    rule.priority ??= 100;
    rule.label ??= "";
    rule.predicate ??= [];
    rule.chatMessage ??= true;

    ruleBody.innerHTML = buildApplyEffectOnTurnRuleFormHTML(index, rule);
  }
}

function buildRuleFormHTML(index, rule) {
  return `
    <input type="hidden" name="system.rules.${index}.key" value="${RULE_KEY}">
    <div class="form-group">
      <label>${game.i18n.localize("PTR1E_TICK_HEALTH.Field.Mode")}</label>
      <select name="system.rules.${index}.mode">
        ${buildOptions(MODE_DEFINITIONS, rule.mode)}
      </select>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("PTR1E_TICK_HEALTH.Field.Fraction")}</label>
      <select name="system.rules.${index}.fraction">
        ${Object.keys(FRACTIONS).map((key) => optionHTML(key, key, key === rule.fraction)).join("")}
      </select>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("PTR1E_TICK_HEALTH.Field.Value")}</label>
      <input type="number" name="system.rules.${index}.value" value="${escapeHTML(rule.value)}" min="0" step="1">
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("PTR1E_TICK_HEALTH.Field.Timing")}</label>
      <select name="system.rules.${index}.timing">
        ${optionHTML("turn-start", game.i18n.localize("PTR1E_TICK_HEALTH.Timing.TurnStart"), rule.timing === "turn-start")}
        ${optionHTML("turn-end", game.i18n.localize("PTR1E_TICK_HEALTH.Timing.TurnEnd"), rule.timing === "turn-end")}
      </select>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("PTR1E_TICK_HEALTH.Field.Label")}</label>
      <input type="text" name="system.rules.${index}.label" value="${escapeHTML(rule.label)}" placeholder="${escapeHTML(game.i18n.localize("PTR1E_TICK_HEALTH.Field.LabelPlaceholder"))}">
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("PTR1E_TICK_HEALTH.Field.Priority")}</label>
      <input type="number" name="system.rules.${index}.priority" value="${escapeHTML(rule.priority)}" step="1">
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("PTR1E_TICK_HEALTH.Field.Predicate")}</label>
      <input type="text" name="system.rules.${index}.predicate" value="${escapeHTML(JSON.stringify(rule.predicate ?? []))}">
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("PTR1E_TICK_HEALTH.Field.ClampToMax")}</label>
      <input type="checkbox" name="system.rules.${index}.clampToMax" ${rule.clampToMax ? "checked" : ""}>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("PTR1E_TICK_HEALTH.Field.ChatMessage")}</label>
      <input type="checkbox" name="system.rules.${index}.chatMessage" ${rule.chatMessage ? "checked" : ""}>
    </div>
  `;
}

function buildApplyEffectOnTurnRuleFormHTML(index, rule) {
  return `
    <input type="hidden" name="system.rules.${index}.key" value="${APPLY_EFFECT_RULE_KEY}">
    <div class="form-group">
      <label>${game.i18n.localize("PTR1E_TICK_HEALTH.Field.EffectUuid")}</label>
      <input type="text" name="system.rules.${index}.uuid" value="${escapeHTML(rule.uuid)}" placeholder="Compendium.ptu.effects.Item...">
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("PTR1E_TICK_HEALTH.Field.Timing")}</label>
      <select name="system.rules.${index}.timing">
        ${optionHTML("turn-start", game.i18n.localize("PTR1E_TICK_HEALTH.Timing.TurnStart"), rule.timing === "turn-start")}
        ${optionHTML("turn-end", game.i18n.localize("PTR1E_TICK_HEALTH.Timing.TurnEnd"), rule.timing === "turn-end")}
      </select>
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("PTR1E_TICK_HEALTH.Field.Label")}</label>
      <input type="text" name="system.rules.${index}.label" value="${escapeHTML(rule.label)}" placeholder="${escapeHTML(game.i18n.localize("PTR1E_TICK_HEALTH.Field.LabelPlaceholder"))}">
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("PTR1E_TICK_HEALTH.Field.Priority")}</label>
      <input type="number" name="system.rules.${index}.priority" value="${escapeHTML(rule.priority)}" step="1">
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("PTR1E_TICK_HEALTH.Field.Predicate")}</label>
      <input type="text" name="system.rules.${index}.predicate" value="${escapeHTML(JSON.stringify(rule.predicate ?? []))}">
    </div>
    <div class="form-group">
      <label>${game.i18n.localize("PTR1E_TICK_HEALTH.Field.ChatMessage")}</label>
      <input type="checkbox" name="system.rules.${index}.chatMessage" ${rule.chatMessage ? "checked" : ""}>
    </div>
  `;
}

function normalizeModeForForm(rule) {
  return resolveMode(rule.mode, rule.resource).resource === "tempHp"
    ? resolveMode(rule.mode, rule.resource).direction === "gain"
      ? "add-temp-health"
      : "subtract-temp-health"
    : resolveMode(rule.mode, rule.resource).direction === "gain"
      ? "add-health"
      : "subtract-health";
}

function buildOptions(options, selected) {
  return Object.entries(options)
    .map(([value, data]) => optionHTML(value, game.i18n.localize(data.label), value === selected))
    .join("");
}

function optionHTML(value, label, selected) {
  return `<option value="${escapeHTML(value)}" ${selected ? "selected" : ""}>${escapeHTML(label)}</option>`;
}

function safeParseJSON(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

async function getEffectFromUuid(uuid) {
  try {
    const effect = await fromUuid(uuid);
    if (effect instanceof CONFIG.PTU.Item.documentClass && ["effect", "condition"].includes(effect.type)) {
      return effect;
    }
  } catch (error) {
    console.error(`${MODULE_ID} | Could not load effect UUID ${uuid}.`, error);
  }

  console.warn(`${MODULE_ID} | UUID does not resolve to a PTR1e effect or condition: ${uuid}`);
  return null;
}

function readActorHealth(actor, actorUpdates = {}) {
  const currentHP = Number(readPath(actor, actorUpdates, "system.health.value") ?? 0);
  const currentMaxHP = Number(readPath(actor, actorUpdates, "system.health.max") ?? 0);
  const injuries = Number(readPath(actor, actorUpdates, "system.health.injuries") ?? 0);
  const currentTempHP = Number(readPath(actor, actorUpdates, "system.tempHp.value") ?? 0);
  const currentTempMaxHP = Number(readPath(actor, actorUpdates, "system.tempHp.max") ?? 0);

  return {
    currentHP,
    currentMaxHP,
    injuries,
    currentTempHP,
    currentTempMaxHP
  };
}

function readPath(actor, actorUpdates, path) {
  if (Object.hasOwn(actorUpdates, path)) return actorUpdates[path];

  const expandedUpdates = foundry.utils.expandObject(actorUpdates);
  const updatedValue = foundry.utils.getProperty(expandedUpdates, path);
  if (updatedValue !== undefined) return updatedValue;

  return foundry.utils.getProperty(actor, path);
}
