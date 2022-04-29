import { REDAGE } from "../helpers/config.mjs";

/*
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
    const actor = this.actor.data;

    // Initialize chat data.
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    const rollMode = game.settings.get('core', 'rollMode');
    var label = `[${item.type}] ${item.name}`;

    var formula = null;
    if (item.type === "weapon") {
			return this._onWeaponAttackRoll(item, actor);
    }
    else if (item.type === "featureRollable") {
      formula = item.data.formula;
      label = `${item.name}`;
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

	/**
	* Prep and display weapon attack dialog
	*/
  async _onWeaponAttackRoll(item, actor) {

		const rollData = this.getRollData();

		var adShift = 3;
		if (!item.data.isProficient) adShift--;

		var attackFormula = "@attackBonus";
		var damageFormula = "@item.damageDie";

		if (item.data.isForceful && item.data.isFinesse) {
			attackFormula += (actor.data.vigor.mod > actor.data.dexterity.mod) ? "+@vigor.mod" : "+@dexterity.mod";
			damageFormula += (actor.data.vigor.mod > actor.data.dexterity.mod) ? "+@vigor.mod" : "+@dexterity.mod";
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

		// fighter feature check
		if (actor.data.fighterMastery) {
      if (actor.data.fighterMastery[item.data.proficiencyGroup.toLowerCase()]) {
        let m = actor.data.fighterMastery[item.data.proficiencyGroup.toLowerCase()];
        if (m.damage) damageFormula += "+@fighterMastery.damage";
      }
		}

		// TODO to add
		// 		fighter-type bonuses from other sources (brute, acrobatic combatant, etc)
		//		sneak attack

		const attackRoll = new Roll(attackFormula, rollData);
		const damageRoll = new Roll(damageFormula, rollData);

		const dialogData = {
			actor: actor,
			item: item,
			attackFormula: attackFormula,
			attackRoll: attackRoll,
			damageFormula: damageFormula,
			damageRoll: damageRoll,
			adShift: adShift,
			adLadder: ["+3D", "+2D", "+D", "Normal", "+A", "+2A", "+3A"],
			rollData: rollData
		};

		const template = "systems/redage/templates/dialogs/roll-weapon-attack.html";
		const html = await renderTemplate(template, dialogData);

		// this.tempData is a temporary place to store data for inter-function transport
		// the dialog callback only passes its own html as text, so we need a way to move data
		// it can be overwritten as needed
		this.tempData = dialogData;

		const _doRoll = async (html) => { return this._doWeaponAttackRoll(html, this.tempData); };

		this.popUpDialog = new Dialog({
			title: actor.name + " - " + item.name + "Attack",
			content: html,
			default: "roll",
			buttons: {
				roll: {
					label: "Attack",
					callback: (html) => _doRoll(html),
				},
				cancel: {
					label: "Cancel",
					callback: () => { ; },
				}
			},
		});

		const s = this.popUpDialog.render(true);

		if (s instanceof Promise)
			await s;

		return this.tempData.chatMessage;
	}

	/**
	* Actual processing and output of weapon attack roll
	*/
	async _doWeaponAttackRoll(html, dialogData) {

		const actor = dialogData.actor;
		const item = dialogData.item;

		dialogData.attackNotes = [];
		dialogData.damageNotes = [item.data.damageType];

		// get data from dialog
		var _a;
		const form = html[0].querySelector("form");
		const adShift = parseInt((_a = form.querySelector('[name="adShift"]')) === null || _a === void 0 ? void 0 : _a.value) - 3;

		// handle advantage / disadvantage on attack roll
		const adShiftLadder = ["+3D", "+2D", "+D", "", "+A", "+2A", "+3A"];
		var dice = (Math.abs(adShift)+1) + "d20";
		if (adShift < 0) dice += "kl1"; else if (adShift > 0) dice += "kh1";
		dialogData.attackFormula = dice + " + " + dialogData.attackFormula;
		if (adShift != 0) dialogData.attackNotes.push(adShiftLadder[adShift+3]);

		// handle attack roll
		const attackRoll = new Roll(dialogData.attackFormula, dialogData.rollData);
		await attackRoll.evaluate({async: true});

		// handle special attack rolls (crit, fumble, deeds)
		const attackD20Result = attackRoll.terms[0].total;
		var critThreshold = 20;
		var fumbleThreshold = 1;
		var deedsNumber = 0;

    // apply fighter brutal crit threat range and deeds number
    if (actor.data.fighterMastery) {
      deedsNumber = actor.data.fighterMastery.deedsNumber;

      if (actor.data.fighterMastery[item.data.proficiencyGroup.toLowerCase()]) {
        let m = actor.data.fighterMastery[item.data.proficiencyGroup.toLowerCase()];
        if (m.brutal && actor.data.fighterMastery.fighterLevel >= 5) critThreshold = 19;
      }
    }

		if (attackD20Result >= critThreshold)
		{
			dialogData.attackNotes.push("Crit");

			// add maximized damage die
			const damageDie = dialogData.damageRoll.terms[0];
			const damageDieMax = Number(damageDie.number) * Number(damageDie.faces);
			dialogData.damageFormula += " + " + damageDieMax;

      // apply fighter brutal crit damage
      if (actor.data.fighterMastery) {
        if (actor.data.fighterMastery[item.data.proficiencyGroup.toLowerCase()]) {
          let m = actor.data.fighterMastery[item.data.proficiencyGroup.toLowerCase()];
  				if (m.brutal) dialogData.damageFormula += " + " + damageDieMax;
        }
			}
		}
		else if (attackD20Result <= fumbleThreshold)
		{
			dialogData.attackNotes.push("Fumble");
		}

		// deeds number may overlap with crit / fumble
		if (attackD20Result == deedsNumber)
		{
			dialogData.attackNotes.push("Mighty Deeds");
		}

		const damageRoll = new Roll(dialogData.damageFormula, dialogData.rollData);
		await damageRoll.evaluate({async: true});

		const rollMode = game.settings.get("core", "rollMode");
		const diceData = Roll.fromTerms([
			PoolTerm.fromRolls([attackRoll, damageRoll]),
		]);

		const diceTooltip = {
			attack: await attackRoll.render(),
			damage: await damageRoll.render(),
		};

		dialogData.attackRoll = attackRoll;
		dialogData.damageRoll = damageRoll;
		dialogData.diceTooltip = diceTooltip;

		dialogData.attackNotes = (dialogData.attackNotes.length > 0) ? "(" + dialogData.attackNotes.join(", ") + ")" : "";
		dialogData.damageNotes = (dialogData.damageNotes.length > 0) ? "(" + dialogData.damageNotes.join(", ") + ")" : "";

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

		this.tempData.chatMessage = chatMessage;
		return chatMessage;
	}
}