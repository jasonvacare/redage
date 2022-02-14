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
			return this._weaponAttackRoll(item, actor.data.data);
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

  async _weaponAttackRoll(item, actor) {

		const rollData = this.getRollData();

		var attackFormula = (item.data.isProficient) ? "1d20" : "2d20kl1";
		var damageFormula = "@item.damageDie";

		attackFormula += "+@attackBonus";

		if (item.data.isForceful && item.data.isFinesse) {
			attackFormula += (actor.vigor.mod > actor.dexterity.mod) ? "+@vigor.mod" : "+@dexterity.mod";
			damageFormula += (actor.vigor.mod > actor.dexterity.mod) ? "+@vigor.mod" : "+@dexterity.mod";
		}
		else if (item.data.isForceful) {
			attackFormula += "+@vigor.mod";
			damageFormula += "+@vigor.mod";
		}
		else if (item.data.isFinesse) {
			attackFormula += "+@dexterity.mod";
			damageFormula += "+@dexterity.mod";
		}

		attackFormula += "+@item.attackBonus";
		damageFormula += "+@item.damageBonus";

		const attackRoll = new Roll(attackFormula, rollData);
		const damageRoll = new Roll(damageFormula, rollData);

		const rollMode = game.settings.get("core", "rollMode");
		const diceData = Roll.fromTerms([
			PoolTerm.fromRolls([attackRoll, damageRoll]),
		]);

		const diceTooltip = {
			attack: await attackRoll.render(),
			damage: await damageRoll.render(),
		};

		const dialogData = {
			actor: this.actor,
			item,
			attackRoll,
			damageRoll,
			diceTooltip,
		};

		const template = "systems/redage/templates/chat/weapon-attack-roll.html";
		const chatContent = await renderTemplate(template, dialogData);
		const chatMessage = getDocumentClass("ChatMessage");
		chatMessage.create(
			chatMessage.applyRollMode(
			{
				speaker: ChatMessage.getSpeaker({ actor: this.actor }),
				roll: JSON.stringify(diceData),
				content: chatContent,
				type: CONST.CHAT_MESSAGE_TYPES.ROLL,
			},
			rollMode
			)
		);

		return chatMessage;
	}
}
