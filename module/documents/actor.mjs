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
  }

  /**
   * Prepare Character type specific data
   */
  _prepareCharacterData(actorData) {
    if (actorData.type !== 'character') return;

    // Make modifications to data here. For example:
    const data = actorData.data;
    const items = actorData.items;

    data.characterLevel = this._calculateCharacterLevel(data.xp);
    data.proficiencyBonus = Math.min(Math.ceil(data.characterLevel / 2), 5);
    data.halfProficiencyBonus = Math.floor(data.proficiencyBonus / 2);
    data.attackBonus = this._calculateAttackBonus(items);

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

    data.health.max = this._calculateMaxHealth(items, data.vigor.mod, data.characterLevel);
    data.health.value = Math.max(0, Math.min(data.health.max, data.health.value));
    data.health.reserve = Math.max(0, Math.min(data.health.max, data.health.reserve));
    
    data.life.max = 10 + data.vigor.mod + data.spirit.mod + data.proficiencyBonus;
    data.life.value = Math.max(0, Math.min(data.life.max, data.life.value));

    // TODO set value = sum of all fatigue status items (fatigue, hunger, thirst, drain, wind, etc)
    // tooltip is penalty for this level of exhaustion
    // fatigue penalty to be integrated into rolls via REDAGE.getD20()
    data.fatigue.value = 0;
    data.fatigue.exhaustion = Math.ceil(-data.fatigue.value / 10);
    data.fatigue.tooltip = "";

		// armor caps dexterity bonus and mod
		const armorProperties = this._calculateDefenseBonus(items);
		data.defenseBonus = armorProperties.defense;
		data.dexterity.bonus = Math.min(armorProperties.maxDexterityBonus, data.dexterity.bonus);
		data.dexterity.mod = Math.min(armorProperties.maxDexterityMod, data.dexterity.mod);
		data.dexterity.save = data.dexterity.mod + (data.dexterity.proficientSave ? data.proficiencyBonus : data.halfProficiencyBonus);

    // TODO have some visual way of showing that your dex / mod have been capped down (color, small icon, etc) + tooltip?

 		data.readied = { value: this._calculateReadiedItems(items) };
 		data.readied.max = Math.round(Math.max(data.dexterity.value, data.wits.value) / 2.0);

 		data.carried = { value: this._calculateCarriedItems(items) };
 		data.carried.max = data.vigor.value;

		if (data.carried.value <= (data.carried.max / 2))
			data.carried.loadLevel = "Light";
		else if (data.carried.value <= data.carried.max)
			data.carried.loadLevel = "Medium";
		else if (data.carried.value <= (1.5 * data.carried.max))
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
      if (i.type === 'item' || i.type === 'weapon' || i.type === 'armor') {
      	if (i.data.data.location == REDAGE.INV_READY)
      		readiedItems++;
      }
    }

    return readiedItems;
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

    // Make modifications to data here. For example:
    const data = actorData.data;
    data.xp = (data.cr * data.cr) * 100;
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