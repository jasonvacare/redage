/**
 * Extend the basic Item with some very simple modifications.
 * @extends {Item}
 */
export class RedAgeItem extends Item {
  /**
   * Augment the basic Item data model with additional dynamic data.
   */
  prepareData() {
    // As with the actor class, items are documents that can have their data
    // preparation methods overridden (such as prepareBaseData()).
    super.prepareData();
  }

  /**
   * Prepare a data object which is passed to any Roll formulas which are created related to this Item
   * @private
   */
  getRollData() {
    // If present, return the actor's roll data.
    if ( !this.actor ) return null;
    const rollData = this.actor.getRollData();
    rollData.item = foundry.utils.deepClone(this.data.data);

    return rollData;
  }

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  async roll() {
    const item = this.data;
    const actor = this.actor;

    // Initialize chat data.
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    const rollMode = game.settings.get('core', 'rollMode');
    const label = `[${item.type}] ${item.name}`;

    var formula = null;
    if (item.type === "weapon") {
			formula = this._prepareWeaponAttackFormula(item, actor.data.data);
    }

    // If there's no roll data, send a chat message.
    if (formula == null) {
      ChatMessage.create({
        speaker: speaker,
        rollMode: rollMode,
        flavor: label,
        content: item.data.description ?? ''
      });
    }
    // Otherwise, create a roll and send a chat message from it.
    else {
      // Retrieve roll data.
      const rollData = this.getRollData();

      // Invoke the roll and submit it to chat.
      const roll = new Roll(formula, rollData);
      roll.toMessage({
        speaker: speaker,
        rollMode: rollMode,
        flavor: label,
      });
      return roll;
    }
  }

  _prepareWeaponAttackFormula(item, actor) {
    var formula = "";

   	formula = (item.data.isProficient) ? "1d20" : "2d20kl1";
   	formula += "+@attackBonus";

    if (item.data.isForceful && item.data.isFinesse) {
    	formula += (actor.vigor.mod > actor.dexterity.mod) ? "+@vigor.mod" : "+@dexterity.mod";
    }
    else if (item.data.isForceful) {
    	formula += "+@vigor.mod";
    }
    else if (item.data.isFinesse) {
     	formula += "+@dexterity.mod";
    }

		formula += "+" + item.data.attackBonus;

    return formula;
  }

  _prepareWeaponDamageFormula(item, actor) {
    var formula = "@damageDie";

    if (item.data.isForceful && item.data.isFinesse) {
     	formula += (actor.vigor.mod > actor.dexterity.mod) ? "+@vigor.mod" : "+@dexterity.mod";
    }
    else if (item.data.isForceful) {
     	formula += "+@vigor.mod";
    }
    else if (item.data.isFinesse) {
     	formula += "+@dexterity.mod";
    }

    formula += "+@damageBonus";

    // TODO fighter damage bonus, backstabs?

    return formula;
  }
}
