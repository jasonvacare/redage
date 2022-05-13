import { REDAGE } from "../helpers/config.mjs";

/**
 * Extend the base Actor document by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */
export class RedAgeActor extends Actor {

  /** @override */
  prepareData() {
    // Prepare data for the actor. Calling the super version of this executes
    // the following, in order: data reset (to clear active effects),
    // prepareBaseData(), prepareEmbeddedDocuments() (including active effects),
    // prepareDerivedData().
    super.prepareData();
  }

  /** @override */
  prepareBaseData() {
    // Data modifications in this step occur before processing embedded
    // documents or derived data.
  }

  /**
   * @override
   * Augment the basic actor data with additional dynamic data. Typically,
   * you'll want to handle most of your calculated/derived data in this step.
   * Data calculated in this step should generally not exist in template.json
   * (such as ability modifiers rather than ability scores) and should be
   * available both inside and outside of character sheets (such as if an actor
   * is queried and has a roll executed directly from it).
   */
  prepareDerivedData() {
    const actorData = this.data;
    const data = actorData.data;
    const flags = actorData.flags.redage || {};

    // Make separate methods for each Actor type (character, npc, etc.) to keep
    // things organized.
    this._prepareCharacterData(actorData);
    this._prepareNpcData(actorData);
    this._preparePartyData(actorData);
  }

  /**
   * Prepare Character type specific data
   */
  _prepareCharacterData(actorData) {
    if (actorData.type !== 'character') return;

    // Make modifications to data here. For example:
    const data = actorData.data;
    const items = actorData.items;

    // level
    data.characterLevel = this._calculateCharacterLevel(data.xp);
    data.proficiencyBonus = Math.min(Math.ceil(data.characterLevel / 2), 5);
    data.halfProficiencyBonus = Math.floor(data.proficiencyBonus / 2);
    data.attackBonus = this._calculateAttackBonus(items);

    // stats
    data.vigor.mod = Math.floor(data.vigor.value / 3) - 3;
    data.dexterity.mod = Math.floor(data.dexterity.value / 3) - 3;
    data.wits.mod = Math.floor(data.wits.value / 3) - 3;
    data.spirit.mod = Math.floor(data.spirit.value / 3) - 3;

    data.vigor.bonus = data.vigor.value - 10;
    data.dexterity.bonus = data.dexterity.value - 10;
    data.wits.bonus = data.wits.value - 10;
    data.spirit.bonus = data.spirit.value - 10;

    data.vigor.save = data.vigor.mod + (data.vigor.proficientSave ? data.proficiencyBonus : data.halfProficiencyBonus);
    data.dexterity.save = data.dexterity.mod + (data.dexterity.proficientSave ? data.proficiencyBonus : data.halfProficiencyBonus);
    data.wits.save = data.wits.mod + (data.wits.proficientSave ? data.proficiencyBonus : data.halfProficiencyBonus);
    data.spirit.save = data.spirit.mod + (data.spirit.proficientSave ? data.proficiencyBonus : data.halfProficiencyBonus);

    // health & life
    data.health.max = this._calculateMaxHealth(items, data.vigor.mod, data.characterLevel);
    data.health.value = Math.max(0, Math.min(data.health.max, data.health.value));
    data.health.reserve = Math.max(0, Math.min(data.health.max, data.health.reserve));
    
    data.life.max = 10 + data.vigor.mod + data.spirit.mod + data.proficiencyBonus;
    data.life.value = Math.max(0, Math.min(data.life.max, data.life.value));

    // fatigue
    data.fatigue.value = items.filter((i) => i.type === "status" && i.data.data.origin.toLowerCase() === "fatigue")
      .map((f) => f.data.data.progress)
      .reduce((currentTotal, newValue) => currentTotal + newValue, 0);
    data.fatigue.exhaustion = Math.floor(data.fatigue.value / 10);

    // speed
    data.speed.base.value = Math.round(data.speed.base.max * ((6 - data.fatigue.exhaustion) / 6));

    // tooltip is penalty for this level of exhaustion
    data.fatigue.tooltip = (data.fatigue.exhaustion <= 0) ? "" : "Exhaustion " + data.fatigue.exhaustion + ":\n -" + data.fatigue.exhaustion + 
      " to all stat-based rolls\n -" + data.fatigue.exhaustion + " max load\n Speed reduced by " + (data.speed.base.max - data.speed.base.value);

    // armor caps dexterity bonus and mod
    const armorProperties = this._calculateDefenseBonus(items);
    data.dexterity.bonus = Math.min(armorProperties.maxDexterityBonus, data.dexterity.bonus);
    data.dexterity.mod = Math.min(armorProperties.maxDexterityMod, data.dexterity.mod);
    data.dexterity.save = data.dexterity.mod + (data.dexterity.proficientSave ? data.proficiencyBonus : data.halfProficiencyBonus);
    data.defenseBonus = armorProperties.defense + data.dexterity.mod;

    // inventory
    data.readied = { value: this._calculateReadiedItems(items) };
    data.readied.max = Math.round(Math.max(data.dexterity.value, data.wits.value) / 2.0);

    data.carried = { value: this._calculateCarriedItems(items) };
    data.carried.max = data.vigor.value - data.fatigue.exhaustion;

    if (data.carried.value <= Math.ceil(data.carried.max / 2))
      data.carried.loadLevel = "Light";
    else if (data.carried.value <= data.carried.max)
      data.carried.loadLevel = "Medium";
    else if (data.carried.value <= Math.ceil(1.5 * data.carried.max))
      data.carried.loadLevel = "Heavy";
    else
      data.carried.loadLevel = "Overloaded";

    // fighter mastery preparation
    data.fighterMastery = this._calculateFighterMasteries(items);

    // mana
    data.mana.max = this._calculateMaxMana(items);
    data.mana.value = Math.max(0, Math.min(data.mana.max, data.mana.value));
    data.mana.reserve = Math.max(0, Math.min(data.mana.max, data.mana.reserve));
    data.mana.cantrip = Math.max(0, data.mana.cantrip);
  }

  _calculateFighterMasteries(items) {
    let masteries = { fighterLevel: 0, deedsNumber: 0 };
    for (let i of items) {
    	if (i.type === 'classFighter') {
				masteries.fighterLevel = i.data.data.classLevel;
				masteries.damage = Math.ceil(masteries.fighterLevel / 2);

        let data = i.data.data;
        masteries.deedsNumber = data.deedsNumber;

        masteries.brawling = { 
          brutal: data.mastery.brawling.brutal,
          cleave: data.mastery.brawling.cleave,
          damage: data.mastery.brawling.damage,
          supreme: data.mastery.brawling.supreme
        };
        masteries.great = { 
          brutal: data.mastery.great.brutal,
          cleave: data.mastery.great.cleave,
          damage: data.mastery.great.damage,
          supreme: data.mastery.great.supreme
        };
        masteries.missile = { 
          brutal: data.mastery.missile.brutal,
          cleave: data.mastery.missile.cleave,
          damage: data.mastery.missile.damage,
          supreme: data.mastery.missile.supreme
        };
        masteries.pole = { 
          brutal: data.mastery.pole.brutal,
          cleave: data.mastery.pole.cleave,
          damage: data.mastery.pole.damage,
          supreme: data.mastery.pole.supreme
        };
        masteries.single = { 
          brutal: data.mastery.single.brutal,
          cleave: data.mastery.single.cleave,
          damage: data.mastery.single.damage,
          supreme: data.mastery.single.supreme
        };
        masteries.thrown = { 
          brutal: data.mastery.thrown.brutal,
          cleave: data.mastery.thrown.cleave,
          damage: data.mastery.thrown.damage,
          supreme: data.mastery.thrown.supreme
        };
        masteries.exotic = { 
          brutal: data.mastery.exotic.brutal,
          cleave: data.mastery.exotic.cleave,
          damage: data.mastery.exotic.damage,
          supreme: data.mastery.exotic.supreme
        };
      }
    }

    return masteries;
  }

  _calculateReadiedItems(items) {
  	let readiedItems = 0;

    for (let i of items) {
      if (REDAGE.isType(i, ['item', 'weapon', 'armor']) && i.data.data.location == REDAGE.INV_READY) {
        if (i.data.data.weight < 1.0) {
          // multiple light items take up readied slots = total weight (min 1)
          readiedItems += Math.max(1, Math.round(i.data.data.weight * i.data.data.quantity.value));
        }
        else {
          // 1+ weight items take up readied slots = total quantity (regardless of weight)
          readiedItems += i.data.data.quantity.value;
        }
      }
    }

    return Math.round(readiedItems);
  }

  _calculateCarriedItems(items) {
  	let carriedWeight = 0;

    for (let i of items) {
      if (i.type === 'item' || i.type === 'weapon' || i.type === 'armor') {
      	if (i.data.data.location == REDAGE.INV_READY || i.data.data.location == REDAGE.INV_WORN || i.data.data.location == REDAGE.INV_STOWED)
      		carriedWeight += Math.round(i.data.data.quantity.value * i.data.data.weight);
      }
    }

    return carriedWeight;
  }

  _calculateCharacterLevel(xpValue) {
    if (xpValue >= 130000) return 8 + Math.floor((xpValue - 130000) / 120000);
    else if (xpValue >= 65000) return 7;
    else if (xpValue >= 32000) return 6;
    else if (xpValue >= 16000) return 5;
    else if (xpValue >= 8000) return 4;
    else if (xpValue >= 4000) return 3;
    else if (xpValue >= 2000) return 2;
    return 1;
  }

  _calculateAttackBonus(items) {
    let classes = items.filter((item) => { return REDAGE.isType(item, ["class", "classCaster", "classFighter"]); });
    let returnValue = 0;
    let totalLevels = 1;
    if (classes.length === 0) return 0;
    classes.sort((a, b) => { return b.data.data.attackBonusPerLevel - a.data.data.attackBonusPerLevel; });
    for (let c = 0; c < classes.length; c++) {
      let thisClassLevels = classes[c].data.data.classLevel;
      for (let i = 1; i <= thisClassLevels; i++) {        
        if (totalLevels > REDAGE.HeroicLevelThreshold) break;
        returnValue += classes[c].data.data.attackBonusPerLevel;
        totalLevels++;
      }
    }
    return Math.round(returnValue);
  }

  _calculateMaxHealth(items, vigorMod, level) {
    let classes = items.filter((item) => { return REDAGE.isType(item, ["class", "classCaster", "classFighter"]); });
    let returnValue = 0;
    let totalLevels = 1;
    classes.sort((a, b) => { return b.data.data.startingHealth - a.data.data.startingHealth; });
    if (classes.length > 0)
    {
	  returnValue += classes[0].data.data.startingHealth;
    }
    classes.sort((a, b) => { return b.data.data.maxHealthPerLevel - a.data.data.maxHealthPerLevel; });
    for (let c = 0; c < classes.length; c++) {
      let thisClassLevels = classes[c].data.data.classLevel;
      for (let i = 1; i <= thisClassLevels; i++) {        
        if (totalLevels > REDAGE.HeroicLevelThreshold) 
          returnValue += classes[c].data.data.maxHealthPerLevelHeroic;
        else 
          returnValue += classes[c].data.data.maxHealthPerLevel + vigorMod;
        totalLevels++;
      }
    }
    return returnValue;
  }

	_calculateDefenseBonus(items) {
    let armor = items.filter((item) => { return item.type === "armor"; });
    let defense = 0;
    let maxDexterityBonus = 100;
    let maxDexterityMod = 100;

		for (let c = 0; c < armor.length; c++) {
			// worn and readied armor grants protection (half value if non-proficient)
			if (armor[c].data.data.location === REDAGE.INV_WORN || armor[c].data.data.location === REDAGE.INV_READY) {
				let def = Number(armor[c].data.data.defense) + Number(armor[c].data.data.defenseBonus);
				defense += (armor[c].data.data.isProficient) ? def : Math.floor(def / 2);
			}
			// worn armor caps dex bonus and mod (or +1 and +0, if non-proficient)
			if (armor[c].data.data.location === REDAGE.INV_WORN) {
				maxDexterityBonus = (armor[c].data.data.isProficient) ?
					Math.min(maxDexterityBonus, armor[c].data.data.maxDexterityBonus) : 1;
				maxDexterityMod = (armor[c].data.data.isProficient) ?
					Math.min(maxDexterityMod, armor[c].data.data.maxDexterityMod) : 0;
			}
		}
		return { "defense": defense, "maxDexterityBonus": maxDexterityBonus, "maxDexterityMod": maxDexterityMod };
  }

  _calculateMaxMana(items) {
    let castingClasses = items.filter((item) => { return item.type === "classCaster"; });
    let manaLevel = 0;

		for (let c = 0; c < castingClasses.length; c++) {
      manaLevel += castingClasses[c].data.data.classLevel * castingClasses[c].data.data.manaLevel;
		}

    manaLevel = Math.ceil(manaLevel);
    let mana = [0, 4, 6, 9, 12, 17, 22, 28, 37, 44, 56];
    return mana[Math.min(10, manaLevel)] + (2 * Math.max(0, manaLevel-10));
  }

  /**
   * Prepare NPC type specific data.
   */
  _prepareNpcData(actorData) {
    if (actorData.type !== 'npc') return;

    const data = actorData.data;
    const items = actorData.items;

    data.xp = (data.cr * data.cr) * 100;
  }

  /**
   * Prepare Party type specific data
   */
  _preparePartyData(actorData) {
    if (actorData.type !== 'party') return;
  
    const data = actorData.data;
    const items = actorData.items;

    // clear out any accidental non-item items from the party
    items.filter((item) => item.data.data.group !== "item").forEach(i => i.delete());
    
    data.carried.value = this._calculateCarriedItems(items);

    if (data.carried.value <= data.carried.max)
      data.carried.loadLevel = "Standard";
    else
      data.carried.loadLevel = "Heavy";

    // calculate treasure
    data.treasure = items.filter((item) => item.data.data.group === 'item' && item.data.data.isLoot && item.data.data.location !== REDAGE.INV_TOWN)
      .map((item) => item.data.data.quantity.value * item.data.data.value)
      .reduce((a,b) => a+b, 0);
    data.xp.total = data.xp.bonus + (data.xp.riskMultiplier * data.treasure);
    data.xp.individual = data.xp.total / data.adventurers;
  }

  /**
   * Override getRollData() that's supplied to rolls.
   */
  getRollData() {
    const data = super.getRollData();

    // Prepare character roll data.
    this._getCharacterRollData(data);
    this._getNpcRollData(data);

    return data;
  }

  /**
   * Prepare character roll data.
   */
  _getCharacterRollData(data) {
    if (this.data.type !== 'character') return;

    data.vigor = foundry.utils.deepClone(data.vigor);
    data.dexterity = foundry.utils.deepClone(data.dexterity);
    data.wits = foundry.utils.deepClone(data.wits);
    data.spirit = foundry.utils.deepClone(data.spirit);

    data.features = foundry.utils.deepClone(data.features);
  }

  /**
   * Prepare NPC roll data.
   */
  _getNpcRollData(data) {
    if (this.data.type !== 'npc') return;

    // Process additional NPC data here.
  }
}