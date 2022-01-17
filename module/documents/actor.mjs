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

    data.level = this._calculateLevel(data.xp);
    data.proficiencyBonus = Math.min(Math.ceil(data.level / 2), 5);
    data.halfProficiencyBonus = Math.floor(data.proficiencyBonus / 2);

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

    data.health.max = this._calculateMaxHealth(items, data.vigor.mod);
    if (data.health.value > data.health.max) data.health.value = data.health.max;
    data.life.max = 10 + data.vigor.mod + data.spirit.mod + data.proficiencyBonus;
    if (data.life.value > data.life.max) data.life.value = data.life.max;
  }

  _calculateLevel(xpValue) {
    if (xpValue >= 130000) return 8 + Math.floor((xpValue - 130000) / 120000);
    else if (xpValue >= 65000) return 7;
    else if (xpValue >= 32000) return 6;
    else if (xpValue >= 16000) return 5;
    else if (xpValue >= 8000) return 4;
    else if (xpValue >= 4000) return 3;
    else if (xpValue >= 2000) return 2;
    return 1;
  }

  _calculateMaxHealth(items, vigorMod) {
    let classes = items.filter((item) => { return item.type === "class"; });    
    let returnValue = 0;
    let totalLevels = 0;
    classes.sort((a, b) => { return a.data.data.startingHealth - b.data.data.startingHealth; });
    returnValue += classes[0].data.data.startingHealth;
    classes.sort((a, b) => { return a.data.data.maxHealthPerLevel - b.data.data.maxHealthPerLevel; });
    for (let c = 0; c < classes.length; c++) {
      let thisClassLevels = classes[c].data.data.level;
      if (totalLevels >= REDAGE.HeroicLevelMax) break;
      for (let i = 1; i <= thisClassLevels; i++) {        
        if (totalLevels >= REDAGE.HeroicLevelMax) break;
        returnValue += classes[c].data.data.maxHealthPerLevel + vigorMod;
        totalLevels++;
      }
    }
    return returnValue;
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
  }

  /**
   * Prepare NPC roll data.
   */
  _getNpcRollData(data) {
    if (this.data.type !== 'npc') return;

    // Process additional NPC data here.
  }

}