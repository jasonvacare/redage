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

    data.abilities.vigor.mod = this._calculateMod(data.abilities.vigor.value);
    data.abilities.dexterity.mod = this._calculateMod(data.abilities.dexterity.value);
    data.abilities.wits.mod = this._calculateMod(data.abilities.wits.value);
    data.abilities.spirit.mod = this._calculateMod(data.abilities.spirit.value);

    data.abilities.vigor.bonus = this._calculateBonus(data.abilities.vigor.value);
    data.abilities.dexterity.bonus = this._calculateBonus(data.abilities.dexterity.value);
    data.abilities.wits.bonus = this._calculateBonus(data.abilities.wits.value);
    data.abilities.spirit.bonus = this._calculateBonus(data.abilities.spirit.value);
  }

  _calculateMod(value) {
    return Math.floor(value / 3) - 3;
  }

  _calculateBonus(value) {
    return value - 10;
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

    data.vigor = foundry.utils.deepClone(data.abilities.vigor);
    data.dexterity = foundry.utils.deepClone(data.abilities.dexterity);
    data.wits = foundry.utils.deepClone(data.abilities.wits);
    data.spirit = foundry.utils.deepClone(data.abilities.spirit);

    // Add level for easier access, or fall back to 0.
    if (data.attributes.level) {
      data.lvl = data.attributes.level.value ?? 0;
    }
  }

  /**
   * Prepare NPC roll data.
   */
  _getNpcRollData(data) {
    if (this.data.type !== 'npc') return;

    // Process additional NPC data here.
  }

}